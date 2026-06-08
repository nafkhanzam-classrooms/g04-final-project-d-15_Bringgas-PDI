package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"time"

	"classroom-bringgas/classroom"
	"classroom-bringgas/database"
	"classroom-bringgas/protocol"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/session"
	"github.com/gofiber/websocket/v2"
	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

//go:embed all:frontend/dist
var assets embed.FS


// Active Client Connection registry
type ConnectionRegistry struct {
	hosts        map[string]*websocket.Conn                  // ClassCode -> Host Socket
	participants map[string]map[string]*websocket.Conn       // ClassCode -> (ParticipantName -> Student Socket)
	mu           sync.RWMutex
}

var registry = &ConnectionRegistry{
	hosts:        make(map[string]*websocket.Conn),
	participants: make(map[string]map[string]*websocket.Conn),
}

var sm *classroom.SessionManager
var repManager *classroom.ReplicationManager
var sessionStore *session.Store
var googleOauthConfig *oauth2.Config

var nodeName string
var teacherDomain string
var studentDomain string

func main() {
	// 1. Load Environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] Warning: .env file not found, using environmental/flag defaults.")
	}

	// Read env parameters
	envPort := os.Getenv("PORT")
	defaultPort := 8789
	if envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			defaultPort = p
		}
	}

	envNodeName := os.Getenv("NODE_NAME")
	if envNodeName == "" {
		envNodeName = "node-1"
	}

	teacherDomain = os.Getenv("TEACHER_DOMAIN")
	if teacherDomain == "" {
		teacherDomain = "guru.lopyta.com"
	}

	studentDomain = os.Getenv("STUDENT_DOMAIN")
	if studentDomain == "" {
		studentDomain = "siswa.lopyta.com"
	}

	dbDSN := os.Getenv("DB_DSN")
	if dbDSN == "" {
		dbDSN = "root:root@tcp(127.0.0.1:3306)/classroom_bringgas?parseTime=true"
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "127.0.0.1:6379"
	}
	redisPassword := os.Getenv("REDIS_PASSWORD")

	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	googleClientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	googleRedirectURL := os.Getenv("GOOGLE_REDIRECT_URL")
	if googleRedirectURL == "" {
		googleRedirectURL = "https://" + teacherDomain + "/api/auth/google/callback"
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		sessionSecret = "bringgas_lopyta_secret_2026"
	}

	// Parse CLI arguments (for overrides)
	port := flag.Int("port", defaultPort, "Web HTTP and WebSocket Port")
	syncPort := flag.Int("sync-port", 8889, "TCP State Replication (compatibility mode)")
	peerSync := flag.String("peer-sync", "", "TCP sync address (compatibility mode)")
	node := flag.String("node", envNodeName, "Name/ID of this server instance")
	flag.Parse()

	nodeName = *node
	sm = classroom.NewSessionManager()

	log.Printf("[%s] Starting Interactive Classroom Server on %s / %s...", nodeName, teacherDomain, studentDomain)

	// 2. Initialize Database connection (MariaDB)
	if err := database.InitDB(dbDSN); err != nil {
		log.Fatalf("[Database] Critical Error initializing database: %v", err)
	}

	// 3. Initialize Redis connection
	if err := classroom.InitRedis(redisAddr, redisPassword); err != nil {
		log.Printf("[Redis] Connection warning: %v (falling back to memory-only sync)", err)
	}

	// 4. Setup Google OAuth Configurations
	googleOauthConfig = &oauth2.Config{
		RedirectURL:  googleRedirectURL,
		ClientID:     googleClientID,
		ClientSecret: googleClientSecret,
		Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
		Endpoint:     google.Endpoint,
	}

	// Callback: When Redis replicates class state to us, broadcast the updated state to all our local sockets
	broadcastCB := func(code string) {
		BroadcastClassState(code)
	}

	// 5. Initialize Distributed State Replication (now powered inside by Redis Pub/Sub!)
	syncAddr := fmt.Sprintf("127.0.0.1:%d", *syncPort)
	repManager = classroom.NewReplicationManager(nodeName, syncAddr, *peerSync, sm, broadcastCB)
	repManager.Start()
	defer repManager.Stop()

	// 6. Initialize Fiber App & Session store
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	sessionStore = session.New(session.Config{
		KeyLookup:      "cookie:lopyta_session",
		CookieSecure:   false,
		CookieHTTPOnly: true,
		Expiration:     2 * time.Hour,
	})

	app.Use(recover.New())
	app.Use(cors.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path}\n",
	}))

	// Ensure upload/download dirs exist
	os.MkdirAll("./uploads", 0755)
	os.MkdirAll("./bin_releases", 0755)

	// Serve Static Files
	app.Static("/uploads", "./uploads")
	app.Static("/downloads", "./bin_releases")
	app.Static("/assets", "./frontend/dist/assets")
	app.Static("/images", "./frontend/dist/images")
	
	// Explicitly map specific root static files to avoid intercepting / 
	app.Get("/favicon.svg", func(c *fiber.Ctx) error { return c.SendFile("./frontend/dist/favicon.svg") })
	app.Get("/icons.svg", func(c *fiber.Ctx) error { return c.SendFile("./frontend/dist/icons.svg") })

	// Helper Authentication Middleware
	authGuard := func(c *fiber.Ctx) error {
		sess, err := sessionStore.Get(c)
		if err != nil {
			log.Printf("[%s] AuthGuard Error: Failed to retrieve session: %v", nodeName, err)
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session error"})
		}
		teacherID := sess.Get("teacher_id")
		if teacherID == nil {
			isAjax := c.Get("X-Requested-With") == "XMLHttpRequest"
			path := c.Path()
			log.Printf("[%s] AuthGuard: Unauthorized request to %s (IP: %s, AJAX: %t). Redirecting or blocking.", nodeName, path, c.IP(), isAjax)
			if c.Method() == "GET" && !isAjax && (path == "/host" || (len(path) > 5 && path[:6] == "/host/")) {
				return c.Redirect("/login")
			}
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized. Mohon login menggunakan Google."})
		}
		c.Locals("teacher_id", teacherID)
		c.Locals("teacher_name", sess.Get("teacher_name"))
		c.Locals("teacher_email", sess.Get("teacher_email"))
		
		// Refresh session expiration on activity
		sess.Save()
		
		return c.Next()
	}

	// 7. Domain / Subdomain separation UI routing ( guru.lopyta.com vs siswa.lopyta.com )
	
	// SPA Handler - Return index.html for React Router
	serveSPA := func(c *fiber.Ctx) error {
		return c.SendFile("./frontend/dist/index.html")
	}

	app.Get("/", func(c *fiber.Ctx) error {
		host := c.Hostname()
		mode := os.Getenv("WAILS_MODE")
		log.Printf("[%s] Incoming Host: '%s', Expected TeacherDomain: '%s', Mode: '%s'", nodeName, host, teacherDomain, mode)
		
		if host == teacherDomain {
			// Serve the React App. The React App itself will check if window.go exists
			// to determine whether to show the Download Landing Page or the Teacher App.
			if mode == "server" {
				return c.SendFile("./frontend/dist/index.html")
			}
			
			// If not in server mode (local desktop), redirect to login/host
			sess, _ := sessionStore.Get(c)
			if sess.Get("teacher_id") == nil {
				return c.Redirect("/login")
			}
			return c.Redirect("/host")
		}
		// Default is student join page
		return serveSPA(c)
	})

	app.Get("/login", serveSPA)
	app.Get("/host", authGuard, serveSPA)
	app.Get("/host/*", authGuard, serveSPA)

	// Legacy .html URLs redirect to clean URLs
	app.Get("/login.html", func(c *fiber.Ctx) error {
		return c.Redirect("/login", fiber.StatusMovedPermanently)
	})
	app.Get("/host.html", func(c *fiber.Ctx) error {
		return c.Redirect("/host", fiber.StatusMovedPermanently)
	})
	app.Get("/index.html", func(c *fiber.Ctx) error {
		return c.Redirect("/", fiber.StatusMovedPermanently)
	})

	// 8. Authentication & Google OAuth REST endpoints
	RegisterNewRoutes(app, authGuard)
	app.Post("/api/auth/google/mock", func(c *fiber.Ctx) error {
		var req struct {
			Email string `json:"email"`
		}
		if err := c.BodyParser(&req); err != nil || req.Email == "" {
			log.Printf("[%s] Mock Auth Error: Invalid payload or empty email", nodeName)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid email"})
		}

		teacher, err := classroom.MockLoginTeacher(req.Email)
		if err != nil {
			log.Printf("[%s] Mock Auth Error for %s: %v", nodeName, req.Email, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		// Store details in active session
		sess, err := sessionStore.Get(c)
		if err != nil {
			log.Printf("[%s] Mock Auth Session Error: %v", nodeName, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Session generation error"})
		}
		sess.Set("teacher_id", teacher.ID)
		sess.Set("teacher_name", teacher.Name)
		sess.Set("teacher_email", teacher.Email)
		sess.Save()

		log.Printf("[%s] Mock Auth Success: Registered/Logged in teacher %s (ID: %d)", nodeName, teacher.Email, teacher.ID)
		return c.JSON(fiber.Map{"success": true, "teacher": teacher})
	})

	app.Get("/api/auth/google/login", func(c *fiber.Ctx) error {
		if googleOauthConfig.ClientID == "" {
			log.Printf("[%s] OAuth Login Error: ClientID is empty in environment variables", nodeName)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Google OAuth is not configured in .env. Use Mock Login."})
		}
		// Random state string for protection
		url := googleOauthConfig.AuthCodeURL("lopyta_state_string")
		log.Printf("[%s] OAuth Login: Redirecting client %s to Google Auth URL", nodeName, c.IP())
		return c.Redirect(url)
	})

	app.Get("/api/auth/google/callback", func(c *fiber.Ctx) error {
		code := c.Query("code")
		if code == "" {
			log.Printf("[%s] OAuth Callback Error: Code parameter is missing", nodeName)
			return c.Status(fiber.StatusBadRequest).SendString("OAuth code empty")
		}

		token, err := googleOauthConfig.Exchange(c.Context(), code)
		if err != nil {
			log.Printf("[%s] OAuth Callback Error: Token exchange failed: %v", nodeName, err)
			return c.Status(fiber.StatusInternalServerError).SendString("Token exchange failed: " + err.Error())
		}

		client := googleOauthConfig.Client(c.Context(), token)
		resp, err := client.Get("https://www.googleapis.com/oauth2/v3/userinfo")
		if err != nil {
			log.Printf("[%s] OAuth Callback Error: Failed to fetch Google user info: %v", nodeName, err)
			return c.Status(fiber.StatusInternalServerError).SendString("Failed fetching user info: " + err.Error())
		}
		defer resp.Body.Close()

		var userInfo struct {
			Sub   string `json:"sub"`
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
			log.Printf("[%s] OAuth Callback Error: Failed to decode user profile: %v", nodeName, err)
			return c.Status(fiber.StatusInternalServerError).SendString("Failed decoding user profile")
		}

		teacher, err := classroom.GetOrCreateTeacher(userInfo.Email, userInfo.Name, userInfo.Sub)
		if err != nil {
			log.Printf("[%s] OAuth Callback Error: GetOrCreateTeacher database error for email %s: %v", nodeName, userInfo.Email, err)
			return c.Status(fiber.StatusInternalServerError).SendString("Database authentication failed: " + err.Error())
		}

		// Save identity in secure session store
		sess, _ := sessionStore.Get(c)
		sess.Set("teacher_id", teacher.ID)
		sess.Set("teacher_name", teacher.Name)
		sess.Set("teacher_email", teacher.Email)
		sess.Save()

		log.Printf("[%s] OAuth Callback Success: Logged in teacher %s (ID: %d)", nodeName, teacher.Email, teacher.ID)
		return c.Redirect("/host")
	})

	app.Get("/api/auth/me", authGuard, func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"id":    c.Locals("teacher_id"),
			"name":  c.Locals("teacher_name"),
			"email": c.Locals("teacher_email"),
		})
	})

	app.Post("/api/auth/logout", func(c *fiber.Ctx) error {
		sess, err := sessionStore.Get(c)
		if err == nil {
			sess.Destroy()
		}
		return c.JSON(fiber.Map{"success": true})
	})

	// 9. Reusable Question Bank REST endpoints
	app.Get("/api/bank", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id").(int)
		setID := c.Query("set_id") // Optional filter by set

		db := database.GetDB()
		if db == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database offline"})
		}

		var rows *sql.Rows
		var err error
		if setID != "" {
			rows, err = db.Query("SELECT id, title, question_text, options, correct_option, duration_seconds, activity_type, set_id FROM question_bank WHERE teacher_id = ? AND set_id = ? ORDER BY created_at DESC", teacherID, setID)
		} else {
			rows, err = db.Query("SELECT id, title, question_text, options, correct_option, duration_seconds, activity_type, set_id FROM question_bank WHERE teacher_id = ? ORDER BY created_at DESC", teacherID)
		}

		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var list []interface{}
		for rows.Next() {
			var id, duration int
			var title, text, optStr, correct, actType string
			var sid sql.NullInt64
			if err := rows.Scan(&id, &title, &text, &optStr, &correct, &duration, &actType, &sid); err != nil {
				continue
			}
			var options []string
			json.Unmarshal([]byte(optStr), &options)

			var setIDVal *int
			if sid.Valid {
				v := int(sid.Int64)
				setIDVal = &v
			}

			list = append(list, fiber.Map{
				"id":              id,
				"title":           title,
				"question_text":   text,
				"options":         options,
				"correct_option":  correct,
				"durationSeconds": duration,
				"activityType":    actType,
				"set_id":          setIDVal,
			})
		}
		return c.JSON(list)
	})

	app.Post("/api/bank", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id").(int)
		var req struct {
			Title           string   `json:"title"`
			QuestionText    string   `json:"questionText"`
			Options         []string `json:"options"`
			CorrectOption   string   `json:"correctOption"`
			DurationSeconds int      `json:"durationSeconds"`
			ActivityType    string   `json:"activityType"`
			SetID           *int     `json:"set_id"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}

		optionsJSON, _ := json.Marshal(req.Options)

		db := database.GetDB()
		if db == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database offline"})
		}

		res, err := db.Exec(`
			INSERT INTO question_bank (teacher_id, set_id, title, question_text, options, correct_option, duration_seconds, activity_type)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, teacherID, req.SetID, req.Title, req.QuestionText, string(optionsJSON), req.CorrectOption, req.DurationSeconds, req.ActivityType)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		lastID, _ := res.LastInsertId()
		return c.JSON(fiber.Map{"success": true, "id": lastID})
	})

	app.Put("/api/bank/:id", authGuard, func(c *fiber.Ctx) error {
		id := c.Params("id")
		teacherID := c.Locals("teacher_id").(int)
		var req struct {
			Title           string   `json:"title"`
			QuestionText    string   `json:"questionText"`
			Options         []string `json:"options"`
			CorrectOption   string   `json:"correctOption"`
			DurationSeconds int      `json:"durationSeconds"`
			ActivityType    string   `json:"activityType"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}
		optionsJSON, _ := json.Marshal(req.Options)
		
		db := database.GetDB()
		if db == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database offline"})
		}

		_, err := db.Exec(`
			UPDATE question_bank 
			SET title=?, question_text=?, options=?, correct_option=?, duration_seconds=?, activity_type=?
			WHERE id=? AND teacher_id=?
		`, req.Title, req.QuestionText, string(optionsJSON), req.CorrectOption, req.DurationSeconds, req.ActivityType, id, teacherID)
		
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	app.Delete("/api/bank/:id", authGuard, func(c *fiber.Ctx) error {
		id := c.Params("id")
		teacherID := c.Locals("teacher_id").(int)
		db := database.GetDB()
		if db == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database offline"})
		}

		_, err := db.Exec("DELETE FROM question_bank WHERE id = ? AND teacher_id = ?", id, teacherID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		return c.JSON(fiber.Map{"success": true})
	})

	// 10. Teacher Class Management REST endpoints
	app.Get("/api/teacher/classes", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id").(int)
		db := database.GetDB()
		if db == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database offline"})
		}

		rows, err := db.Query("SELECT code, class_name, student_entry_code, is_active, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC", teacherID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var list []interface{}
		for rows.Next() {
			var code, className, entryCode string
			var isActive int
			var createdAt time.Time
			if err := rows.Scan(&code, &className, &entryCode, &isActive, &createdAt); err == nil {
				list = append(list, fiber.Map{
					"code":             code,
					"className":        className,
					"studentEntryCode": entryCode,
					"isActive":         isActive == 1,
					"createdAt":        createdAt,
				})
			}
		}
		return c.JSON(list)
	})

	app.Post("/api/teacher/classes", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id").(int)
		teacherName := c.Locals("teacher_name").(string)

		var req struct {
			ClassName        string `json:"className"`
			StudentEntryCode string `json:"studentEntryCode"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
		}

		// Length check of entry code
		if len(req.StudentEntryCode) > 10 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Kode Khusus maksimal 10 karakter."})
		}

		session := sm.CreateSession(req.ClassName, teacherName, teacherID, req.StudentEntryCode, time.Time{})

		// Replicate to Redis and return details
		repManager.ReplicateSessionState(session)

		return c.JSON(session.CopyState())
	})

	// Start class manually endpoint
	app.Post("/api/class/start", authGuard, func(c *fiber.Ctx) error {
		var req struct {
			Code string `json:"code"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}

		session := sm.GetSession(req.Code)
		if session == nil {
			// Pull from Redis in case it was created on another Node
			s, err := classroom.GetSessionFromRedis(req.Code)
			if err != nil {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Kelas tidak ditemukan"})
			}
			sm.AddSession(s)
			session = s
		}

		session.StartSession()
		repManager.ReplicateSessionState(session)
		BroadcastClassState(req.Code)

		return c.JSON(fiber.Map{"success": true})
	})

	// End class manually endpoint (Ejects all student websockets dynamically)
	app.Post("/api/class/end", authGuard, func(c *fiber.Ctx) error {
		var req struct {
			Code string `json:"code"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}

		session := sm.GetSession(req.Code)
		if session != nil {
			session.EndSession()
			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

			// Eject all participants local connection sockets for resource cleanup
			registry.mu.Lock()
			if clients, ok := registry.participants[req.Code]; ok {
				for name, conn := range clients {
					// Send termination protocol packet
					payload, _ := json.Marshal(map[string]string{"message": "Sesi kelas telah diakhiri oleh Guru."})
					conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, payload))
					conn.Close()
					delete(clients, name)
				}
			}
			registry.mu.Unlock()
		}

		return c.JSON(fiber.Map{"success": true})
	})

	// Retrieve session score statistics from database
	app.Get("/api/class/history/:code", authGuard, func(c *fiber.Ctx) error {
		code := c.Params("code")
		db := database.GetDB()
		if db == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database offline"})
		}

		rows, err := db.Query("SELECT student_name, score, streak, submitted_at FROM submissions WHERE class_code = ? ORDER BY score DESC", code)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var list []interface{}
		for rows.Next() {
			var name string
			var score, streak int
			var submitted time.Time
			if err := rows.Scan(&name, &score, &streak, &submitted); err == nil {
				list = append(list, fiber.Map{
					"studentName": name,
					"score":       score,
					"streak":      streak,
					"submittedAt": submitted,
				})
			}
		}
		return c.JSON(list)
	})

	// 11. Online Sandbox Compiler REST endpoint
	app.Post("/api/compiler/run", func(c *fiber.Ctx) error {
		var req struct {
			Lang  string `json:"lang"`
			Code  string `json:"code"`
			Input string `json:"input"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid compiler payload"})
		}

		resp, err := classroom.ExecuteCode(req.Lang, req.Code, req.Input)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		return c.JSON(resp)
	})

	// 12. WebSocket Protocol Handler Upgrade
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// WebSocket Session Event Loop
	app.Get("/ws", websocket.New(handleWebSocket))

	// Heartbeat Ticker
	go startHeartbeatTicker()

	// Start Listening
	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("[%s] Web Server listening on http://%s", nodeName, addr)
	
	mode := os.Getenv("WAILS_MODE")
	if mode == "server" {
		log.Println("Running in SERVER mode. Wails UI disabled.")
		log.Fatal(app.Listen(addr))
	} else {
		// Run Fiber in background for Wails
		go func() {
			if err := app.Listen(addr); err != nil {
				log.Fatal("Fiber Server failed:", err)
			}
		}()
		
		// Run Wails Desktop App
		wailsApp := NewApp()
		err := wails.Run(&options.App{
			Title:  "Bringgas PDI",
			Width:  1280,
			Height: 800,
			AssetServer: &assetserver.Options{
				Assets: assets,
			},
			BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
			OnStartup:        wailsApp.startup,
			Bind: []interface{}{
				wailsApp,
			},
		})

		if err != nil {
			log.Fatal("Wails error:", err)
		}
	}
}

// handleWebSocket processes incoming custom binary packets over websocket connections
func handleWebSocket(c *websocket.Conn) {
	var currentCode string
	var currentName string
	var isHost bool

	defer func() {
		c.Close()
		if isHost && currentCode != "" {
			registry.mu.Lock()
			delete(registry.hosts, currentCode)
			registry.mu.Unlock()
			log.Printf("[%s] Host disconnected from session %s", nodeName, currentCode)
		} else if currentCode != "" && currentName != "" {
			registry.mu.Lock()
			if clients, ok := registry.participants[currentCode]; ok {
				delete(clients, currentName)
			}
			registry.mu.Unlock()

			session := sm.GetSession(currentCode)
			if session != nil {
				session.DisconnectParticipant(currentName)
				repManager.ReplicateSessionState(session)
				BroadcastClassState(currentCode)
			}
			log.Printf("[%s] Participant %s disconnected from session %s", nodeName, currentName, currentCode)
		}
	}()

	for {
		mt, message, err := c.ReadMessage()
		if err != nil {
			break
		}

		if mt != websocket.BinaryMessage {
			sendError(c, "Protokol error: Server hanya menerima frame biner kustom.")
			continue
		}

		msgType, seq, payload, err := protocol.DecodePacket(message)
		if err != nil {
			log.Printf("[%s] Malformed Packet Error: %v", nodeName, err)
			sendError(c, fmt.Sprintf("Malformed packet rejected: %v", err))
			continue
		}

		switch msgType {
		case protocol.MsgCreateClass:
			var req struct {
				Code             string `json:"code"`
				ClassName        string `json:"className"`
				HostName         string `json:"hostName"`
				TeacherID        int    `json:"teacherId"`
				StudentEntryCode string `json:"studentEntryCode"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for CREATE_CLASS")
				continue
			}

			var session *classroom.ClassSession
			if req.Code != "" {
				session = sm.GetSession(req.Code)
				if session == nil {
					// Fallback to Redis cache
					var err error
					session, err = classroom.GetSessionFromRedis(req.Code)
					if err == nil && session != nil {
						sm.AddSession(session)
					}
				}
			}

			if session == nil {
				session = sm.CreateSession(req.ClassName, req.HostName, req.TeacherID, req.StudentEntryCode, time.Time{})
			}

			currentCode = session.Code
			isHost = true

			registry.mu.Lock()
			registry.hosts[session.Code] = c
			registry.mu.Unlock()

			log.Printf("[%s] Host registered session via WS: %s (%s)", nodeName, session.Code, session.ClassName)

			repManager.ReplicateSessionState(session)
			sendState(c, session)

		case protocol.MsgJoinClass:
			var req struct {
				Code      string `json:"code"`
				Name      string `json:"name"`
				EntryCode string `json:"entryCode"` // Secret class code
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for JOIN_CLASS")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				// Try fetching from Redis Cache first to ensure horizontal scaling
				s, err := classroom.GetSessionFromRedis(req.Code)
				if err != nil {
					sendError(c, "Kelas tidak ditemukan. Periksa kembali kode Anda.")
					continue
				}
				sm.AddSession(s)
				session = s
			}

			// Validate secret student PIN code and active state in one go
			participant, status, err := session.JoinParticipant(req.EntryCode)
			if err != nil {
				sendError(c, err.Error())
				continue
			}

			currentCode = req.Code
			currentName = participant.Name
			isHost = false
			
			// Send personalized success response so frontend knows their name
			joinSuccessPayload, _ := json.Marshal(map[string]string{"name": participant.Name})
			c.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(0x0008, seq, joinSuccessPayload))

			// Handle duplicate login (Evict/Kick older browser tab to save resources!)
			if status == "kick" {
				registry.mu.Lock()
				if clients, ok := registry.participants[currentCode]; ok {
					if oldConn, exists := clients[currentName]; exists {
						oldPayload, _ := json.Marshal(map[string]string{"message": "Sesi Anda ditendang karena login ganda dari tab lain."})
						oldConn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, oldPayload))
						oldConn.Close()
					}
				}
				registry.mu.Unlock()
			}

			registry.mu.Lock()
			if _, ok := registry.participants[currentCode]; !ok {
				registry.participants[currentCode] = make(map[string]*websocket.Conn)
			}
			registry.participants[currentCode][currentName] = c
			registry.mu.Unlock()

			log.Printf("[%s] Student %s joined session %s", nodeName, participant.Name, currentCode)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(currentCode)

		case protocol.MsgSubmitAnswer:
			var req struct {
				Code   string `json:"code"`
				Name   string `json:"name"`
				Answer string `json:"answer"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for SUBMIT_ANSWER")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			isCorrect, points, err := session.SubmitAnswer(req.Name, req.Answer)
			if err != nil {
				sendError(c, err.Error())
				continue
			}

			resPayload, _ := json.Marshal(map[string]interface{}{
				"isCorrect":    isCorrect,
				"pointsEarned": points,
				"correct":      session.CurrentQuestion.CorrectOption,
			})
			c.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgQuizResult, seq, resPayload))

			log.Printf("[%s] Student %s submitted answer %s. Points earned: %d", nodeName, req.Name, req.Answer, points)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgSlideChange:
			var req struct {
				Code  string `json:"code"`
				Slide int    `json:"slide"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for SLIDE_CHANGE")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			session.ChangeSlide(req.Slide)
			log.Printf("[%s] Host changed slide of %s to page %d", nodeName, req.Code, req.Slide)

			// Check for slide triggers in database
			var qText, optionsJSON, correctOpt string
			var duration int
			err := database.DB.QueryRow(`
				SELECT q.question_text, q.options, q.correct_option, q.duration_seconds 
				FROM slide_triggers t
				JOIN question_bank q ON t.question_id = q.id
				WHERE t.class_code = ? AND t.slide_number = ?
			`, req.Code, req.Slide).Scan(&qText, &optionsJSON, &correctOpt, &duration)

			if err == nil {
				// We have a mapped question for this slide! Trigger it automatically.
				var opts []string
				json.Unmarshal([]byte(optionsJSON), &opts)
				
				session.PointMultiplier = 1
				session.StartQuestion(qText, opts, correctOpt, duration)
				log.Printf("[%s] Auto-triggered Quiz on Slide %d: %s", nodeName, req.Slide, qText)
			}

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgSendQuestion:
			var req struct {
				Code            string   `json:"code"`
				QuestionText    string   `json:"questionText"`
				Options         []string `json:"options"`
				CorrectOption   string   `json:"correctOption"`
				DurationSeconds int      `json:"durationSeconds"`
				PointMultiplier int      `json:"pointMultiplier"` // point multiplier: x1 or x2
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for SEND_QUESTION")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			// Apply multiplier in the class session
			multiplier := req.PointMultiplier
			if multiplier < 1 {
				multiplier = 1
			}
			session.PointMultiplier = multiplier

			session.StartQuestion(req.QuestionText, req.Options, req.CorrectOption, req.DurationSeconds)
			log.Printf("[%s] Host launched active Quiz in %s (Multiplier x%d): %s", nodeName, req.Code, multiplier, req.QuestionText)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgHeartbeat:
			c.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgHeartbeat, seq, []byte(`{"status": "pong"}`)))
			
			if currentCode != "" && currentName != "" {
				if session := sm.GetSession(currentCode); session != nil {
					session.UpdateParticipantActivity(currentName)
				}
			}
		}
	}
}

// BroadcastClassState updates all local hosts and participants belonging to this session
func BroadcastClassState(code string) {
	session := sm.GetSession(code)
	if session == nil {
		return
	}

	copied := session.CopyState()
	payload, err := json.Marshal(copied)
	if err != nil {
		return
	}

	binaryPacket := protocol.EncodePacket(protocol.MsgClassState, 0, payload)

	registry.mu.RLock()
	defer registry.mu.RUnlock()

	if hostConn, exists := registry.hosts[code]; exists {
		hostConn.WriteMessage(websocket.BinaryMessage, binaryPacket)
	}

	if students, exists := registry.participants[code]; exists {
		for _, studentConn := range students {
			studentConn.WriteMessage(websocket.BinaryMessage, binaryPacket)
		}
	}
}

func sendState(conn *websocket.Conn, session *classroom.ClassSession) {
	copied := session.CopyState()
	payload, err := json.Marshal(copied)
	if err != nil {
		return
	}
	conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgClassState, 0, payload))
}

func sendError(conn *websocket.Conn, errStr string) {
	payload, _ := json.Marshal(map[string]string{"message": errStr})
	conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, payload))
}

func startHeartbeatTicker() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		sessions := sm.GetAllSessions()

		for _, s := range sessions {
			prunedNames, changed := s.PruneInactiveParticipants(15 * time.Second)
			if changed {
				for _, name := range prunedNames {
					log.Printf("[%s] Heartbeat timeout: participant %s in session %s marked inactive.", nodeName, name, s.Code)
					
					registry.mu.Lock()
					if clients, ok := registry.participants[s.Code]; ok {
						if conn, exists := clients[name]; exists {
							conn.Close()
							delete(clients, name)
						}
					}
					registry.mu.Unlock()
				}

				s.RecalculateLeaderboard()
				repManager.ReplicateSessionState(s)
				BroadcastClassState(s.Code)
			}
		}
	}
}
