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
	redisStorage "github.com/gofiber/storage/redis/v3"
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
		BodyLimit:             50 * 1024 * 1024, // 50MB
	})

	store := redisStorage.New(redisStorage.Config{
		URL:      fmt.Sprintf("redis://:%s@%s/0", redisPassword, redisAddr),
		Reset:    false,
	})

	sessionStore = session.New(session.Config{
		Storage:        store,
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

	// Explicit CORS header middleware for static uploads
	app.Use("/uploads", func(c *fiber.Ctx) error {
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Set("Access-Control-Allow-Headers", "*")
		if c.Method() == "OPTIONS" {
			return c.SendStatus(200)
		}
		return c.Next()
	})

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
		var parsedTeacherID int
		switch v := teacherID.(type) {
		case int:
			parsedTeacherID = v
		case float64:
			parsedTeacherID = int(v)
		case string:
			parsedTeacherID, _ = strconv.Atoi(v)
		default:
			parsedTeacherID, _ = strconv.Atoi(fmt.Sprintf("%v", v))
		}
		c.Locals("teacher_id", parsedTeacherID)
		c.Locals("teacher_name", fmt.Sprintf("%v", sess.Get("teacher_name")))
		c.Locals("teacher_email", fmt.Sprintf("%v", sess.Get("teacher_email")))
		
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
			// End all active classes belonging to this teacher before destroying session
			teacherID, _ := sess.Get("teacher_id").(int)
			if teacherID > 0 {
				log.Printf("[Auth] Teacher ID %d logging out — ending all active classes", teacherID)

				// End in-memory sessions and eject student websockets
				allSessions := sm.GetAllSessions()
				for _, session := range allSessions {
					if session.TeacherID == teacherID && session.IsActive {
						session.EndSession()
						repManager.ReplicateSessionState(session)
						BroadcastClassState(session.Code)

						// Eject all student websockets for this class
						registry.mu.Lock()
						if clients, ok := registry.participants[session.Code]; ok {
							for name, conn := range clients {
								payload, _ := json.Marshal(map[string]string{"message": "Sesi kelas telah diakhiri karena Guru logout."})
								conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, payload))
								conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "TeacherLogout"))
								conn.Close()
								delete(clients, name)
							}
						}
						registry.mu.Unlock()
					}
				}

				// Bulk-deactivate in the database
				db := database.GetDB()
				if db != nil {
					_, dbErr := db.Exec("UPDATE classes SET is_active = 0 WHERE teacher_id = ? AND is_active = 1", teacherID)
					if dbErr != nil {
						log.Printf("[Database] Failed to end classes on teacher logout: %v", dbErr)
					}
				}
			}

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
				"questionText":    text,
				"options":         options,
				"correctOption":   correct,
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

		rows, err := db.Query("SELECT code, class_name, student_entry_code, is_active, presentation_url, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC", teacherID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var list []interface{}
		for rows.Next() {
			var code, className, entryCode string
			var isActive int
			var presentationUrl sql.NullString
			var createdAt time.Time
			if err := rows.Scan(&code, &className, &entryCode, &isActive, &presentationUrl, &createdAt); err == nil {
				list = append(list, fiber.Map{
					"code":             code,
					"className":        className,
					"studentEntryCode": entryCode,
					"isActive":         isActive == 1,
					"presentationUrl":  presentationUrl.String,
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

		// Length check of entry code (harus tepat 6 karakter jika diisi)
		if req.StudentEntryCode != "" && len(req.StudentEntryCode) != 6 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Access Code harus tepat 6 karakter."})
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
			if err != nil || s == nil {
				// Fallback to Database
				db := database.GetDB()
				if db != nil {
					var className, entryCode, teacherName string
					var teacherID, isActive int
					var presUrl sql.NullString
					errDB := db.QueryRow(`
						SELECT c.class_name, c.student_entry_code, c.presentation_url, c.is_active, c.teacher_id, t.name 
						FROM classes c 
						JOIN teachers t ON c.teacher_id = t.id 
						WHERE c.code = ?`, req.Code).Scan(&className, &entryCode, &presUrl, &isActive, &teacherID, &teacherName)
					if errDB == nil {
						s = &classroom.ClassSession{
							Code:             req.Code,
							ClassName:        className,
							HostName:         teacherName,
							TeacherID:        teacherID,
							StudentEntryCode: entryCode,
							Active:           true,
							IsActive:         isActive == 1,
							PointMultiplier:  1,
							ActiveSlide:      1,
							TotalSlides:      5,
							PresentationUrl:  presUrl.String,
							Participants:     make(map[string]*classroom.Participant),
							Leaderboard:      []classroom.LeaderboardEntry{},
							CreatedAt:        time.Now(), // Or fetch from DB
						}
					}
				}
			}

			if s == nil {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Kelas tidak ditemukan"})
			}
			sm.AddSession(s)
			session = s
		}

		// Enforce single active class per teacher
		teacherID := session.TeacherID
		for _, s := range sm.GetAllSessions() {
			if s.TeacherID == teacherID && s.Code != req.Code && s.IsActive {
				log.Printf("[%s] Teacher %d starting session %s. Auto-ending active old session %s.", nodeName, teacherID, req.Code, s.Code)
				s.EndSession()
				repManager.ReplicateSessionState(s)
				BroadcastClassState(s.Code)

				// Eject all participants of the old session
				registry.mu.Lock()
				if clients, ok := registry.participants[s.Code]; ok {
					for name, conn := range clients {
						payload, _ := json.Marshal(map[string]string{"message": "Sesi kelas telah diakhiri karena Guru membuka kelas baru."})
						conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, payload))
						conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Kicked"))
						conn.Close()
						delete(clients, name)
					}
				}
				registry.mu.Unlock()
			}
		}

		// Enforce single active class per teacher in database
		db := database.GetDB()
		if db != nil {
			_, dbErr := db.Exec("UPDATE classes SET is_active = 0 WHERE teacher_id = ? AND code != ?", teacherID, req.Code)
			if dbErr != nil {
				log.Printf("[Database] Failed to auto-end other classes in DB: %v", dbErr)
			}
		}

		session.StartSession()
		sess, err := sessionStore.Get(c)
		if err == nil {
			session.HostSessionID = sess.ID()
		}
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

		// Unconditionally set this class as inactive in the database
		db := database.GetDB()
		if db != nil {
			_, dbErr := db.Exec("UPDATE classes SET is_active = 0 WHERE code = ?", req.Code)
			if dbErr != nil {
				log.Printf("[Database] Failed to end class manually in DB: %v", dbErr)
			}
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
					conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Kicked"))
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
			sess, err := sessionStore.Get(c)
			if err == nil {
				c.Locals("session_id", sess.ID())
			}
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
				log.Printf("Fiber Server failed (Port already in use?): %v", err)
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
			var wasSuperseded bool
			registry.mu.Lock()
			if clients, ok := registry.participants[currentCode]; ok {
				if activeConn, exists := clients[currentName]; exists && activeConn == c {
					delete(clients, currentName)
				} else if exists && activeConn != c {
					wasSuperseded = true
				}
			}
			registry.mu.Unlock()

			if !wasSuperseded {
				session := sm.GetSession(currentCode)
				if session != nil {
					session.DisconnectParticipant(currentName)
					repManager.ReplicateSessionState(session)
					BroadcastClassState(currentCode)
				}
				log.Printf("[%s] Participant %s disconnected from session %s", nodeName, currentName, currentCode)
			}
		}
	}()

	c.SetReadLimit(2 * 1024 * 1024) // Limit to 2MB to prevent OOM
	for {
		c.SetReadDeadline(time.Now().Add(60 * time.Second)) // 60s read timeout
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
			c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseUnsupportedData, "Malformed packet"))
			break // Security fix: drop connection immediately on malformed data
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

			if session == nil && req.Code != "" {
				// Try to restore from Database
				db := database.GetDB()
				if db != nil {
					var className, entryCode, teacherName string
					var teacherID, isActive int
					var presUrl sql.NullString
					err := db.QueryRow(`
						SELECT c.class_name, c.student_entry_code, c.presentation_url, c.is_active, c.teacher_id, t.name 
						FROM classes c 
						JOIN teachers t ON c.teacher_id = t.id 
						WHERE c.code = ?`, req.Code).Scan(&className, &entryCode, &presUrl, &isActive, &teacherID, &teacherName)
					if err == nil {
						session = &classroom.ClassSession{
							Code:             req.Code,
							ClassName:        className,
							HostName:         teacherName,
							TeacherID:        teacherID,
							StudentEntryCode: entryCode,
							Active:           true,
							IsActive:         isActive == 1,
							PointMultiplier:  1,
							ActiveSlide:      1,
							TotalSlides:      5,
							PresentationUrl:  presUrl.String,
							Participants:     make(map[string]*classroom.Participant),
							Leaderboard:      []classroom.LeaderboardEntry{},
							CreatedAt:        time.Now(),
						}
						sm.AddSession(session)
					}
				}
			}

			if session == nil {
				session = sm.CreateSession(req.ClassName, req.HostName, req.TeacherID, req.StudentEntryCode, time.Time{})
			}

			sessID, _ := c.Locals("session_id").(string)
			if sessID != "" {
				session.HostSessionID = sessID
			}

			currentCode = session.Code
			isHost = true

			registry.mu.Lock()
			// Evict older host connections for this teacher across all sessions
			for code, oldConn := range registry.hosts {
				oldSession := sm.GetSession(code)
				if oldSession != nil && oldSession.TeacherID == req.TeacherID && oldConn != c {
					oldPayload, _ := json.Marshal(map[string]string{"message": "Sesi sebelumnya ditutup karena Anda membuka sesi baru."})
					oldConn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, oldPayload))
					oldConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Kicked"))
					oldConn.Close()
					delete(registry.hosts, code)
				}
			}
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
			participant, _, err := session.JoinParticipant(req.EntryCode)
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

			// Handle duplicate login (Evict/Kick older browser tab across ALL classes)
			registry.mu.Lock()
			for code, clients := range registry.participants {
				if oldConn, exists := clients[currentName]; exists && oldConn != c {
					oldPayload, _ := json.Marshal(map[string]string{"message": "Sesi Anda ditendang karena login ganda dari tab/kelas lain."})
					oldConn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, oldPayload))
					oldConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Kicked"))
					oldConn.Close()
					delete(clients, currentName)
					
					// Also mark inactive in the old session
					if oldSession := sm.GetSession(code); oldSession != nil {
						oldSession.DisconnectParticipant(currentName)
						repManager.ReplicateSessionState(oldSession)
						BroadcastClassState(code)
					}
				}
			}
			registry.mu.Unlock()

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
				Answer string `json:"answer"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for SUBMIT_ANSWER")
				continue
			}

			// Use connection-level currentCode and currentName instead of payload
			if currentCode == "" || currentName == "" {
				sendError(c, "Anda belum bergabung ke kelas.")
				continue
			}

			session := sm.GetSession(currentCode)
			if session == nil {
				sendError(c, "Sesi kelas tidak ditemukan.")
				continue
			}

			isCorrect, points, err := session.SubmitAnswer(currentName, req.Answer)
			if err != nil {
				sendError(c, err.Error())
				continue
			}

			// Get the correct option before it might be cleared
			correctOpt := ""
			if session.CurrentQuestion != nil {
				correctOpt = session.CurrentQuestion.CorrectOption
			}

			// Get updated participant data for score/streak
			participant := session.GetParticipant(currentName)
			var newScore, newStreak int
			if participant != nil {
				newScore = participant.Score
				newStreak = participant.Streak
			}

			resPayload, _ := json.Marshal(map[string]interface{}{
				"isCorrect":    isCorrect,
				"pointsEarned": points,
				"correct":      correctOpt,
				"newScore":     newScore,
				"newStreak":    newStreak,
			})
			c.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgQuizResult, seq, resPayload))

			log.Printf("[%s] Student %s submitted answer %s. Points earned: %d (Score: %d, Streak: %d)", nodeName, currentName, req.Answer, points, newScore, newStreak)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(currentCode)

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
			var qText, optionsJSON, correctOpt, activityType string
			var duration int
			err := database.DB.QueryRow(`
				SELECT q.question_text, q.options, q.correct_option, q.duration_seconds, q.activity_type 
				FROM slide_triggers t
				JOIN question_bank q ON t.question_id = q.id
				WHERE t.class_code = ? AND t.slide_number = ?
			`, req.Code, req.Slide).Scan(&qText, &optionsJSON, &correctOpt, &duration, &activityType)

			if err == nil {
				// We have a mapped question for this slide! Trigger it automatically.
				var opts []string
				json.Unmarshal([]byte(optionsJSON), &opts)
				
				session.PointMultiplier = 1
				session.StartQuestion(qText, opts, correctOpt, duration, activityType)
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
				ActivityType    string   `json:"activityType"`
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

			session.StartQuestion(req.QuestionText, req.Options, req.CorrectOption, req.DurationSeconds, req.ActivityType)
			log.Printf("[%s] Host launched active Quiz in %s (Multiplier x%d): %s", nodeName, req.Code, multiplier, req.QuestionText)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgStopQuestion:
			var req struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for STOP_QUESTION")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			session.StopQuestion()
			log.Printf("[%s] Host stopped active Quiz in %s", nodeName, req.Code)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgGradeCode:
			var req struct {
				Code        string `json:"code"`
				StudentName string `json:"studentName"`
				Points      int    `json:"points"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for GRADE_CODE")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			newScore, newStreak, err := session.GradeStudent(req.StudentName, req.Points)
			if err != nil {
				sendError(c, "Gagal memberi nilai: "+err.Error())
				continue
			}

			// Send MsgQuizResult ONLY to the graded student
			resPayload, _ := json.Marshal(map[string]interface{}{
				"isCorrect":    true,
				"pointsEarned": req.Points,
				"correct":      "Approved by Teacher",
				"newScore":     newScore,
				"newStreak":    newStreak,
			})
			packet := protocol.EncodePacket(protocol.MsgQuizResult, 0, resPayload)

			registry.mu.RLock()
			if classMap, ok := registry.participants[req.Code]; ok {
				if studentConn, ok := classMap[req.StudentName]; ok {
					studentConn.WriteMessage(websocket.BinaryMessage, packet)
				}
			}
			registry.mu.RUnlock()

			log.Printf("[%s] Host awarded %d points to %s in %s", nodeName, req.Points, req.StudentName, req.Code)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgToggleVideoCall:
			var req struct {
				Code   string `json:"code"`
				Active bool   `json:"active"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for TOGGLE_VIDEO_CALL")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			session.SetVideoCallActive(req.Active)

			log.Printf("[%s] Host toggled Video Call in %s: %v", nodeName, req.Code, req.Active)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgLeaderboard:
			var req struct {
				Code   string `json:"code"`
				Active bool   `json:"active"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for LEADERBOARD")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak aktif.")
				continue
			}

			session.ToggleLeaderboard(req.Active)

			log.Printf("[%s] Host toggled Leaderboard in %s: %v", nodeName, req.Code, req.Active)

			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgWhiteboardDraw:
			var req struct {
				Code    string    `json:"code"`
				Points  []float64 `json:"points"`
				Color   string    `json:"color"`
				Size    float64   `json:"size"`
				Tool    string    `json:"tool"`
			}
			if err := json.Unmarshal(payload, &req); err == nil {
				session := sm.GetSession(req.Code)
				if session != nil {
					// Check permissions
					canDraw := isHost || session.WhiteboardPermit == "all"
					if canDraw {
						line := classroom.WhiteboardLine{
							Points:  req.Points,
							Color:   req.Color,
							Size:    req.Size,
							Tool:    req.Tool,
							Student: currentName,
						}
						session.AddWhiteboardLine(line)
						
						broadcastPayload, _ := json.Marshal(line)
						packet := protocol.EncodePacket(protocol.MsgWhiteboardDraw, 0, broadcastPayload)
						
						registry.mu.RLock()
						if hostConn, exists := registry.hosts[req.Code]; exists && !isHost {
							hostConn.WriteMessage(websocket.BinaryMessage, packet)
						}
						if students, exists := registry.participants[req.Code]; exists {
							for name, studentConn := range students {
								if isHost || name != currentName {
									studentConn.WriteMessage(websocket.BinaryMessage, packet)
								}
							}
						}
						registry.mu.RUnlock()
					}
				}
			}

		case protocol.MsgWhiteboardClear:
			var req struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(payload, &req); err == nil {
				session := sm.GetSession(req.Code)
				if session != nil && isHost {
					session.ClearWhiteboard()
					packet := protocol.EncodePacket(protocol.MsgWhiteboardClear, 0, []byte("{}"))
					
					registry.mu.RLock()
					if students, exists := registry.participants[req.Code]; exists {
						for _, studentConn := range students {
							studentConn.WriteMessage(websocket.BinaryMessage, packet)
						}
					}
					registry.mu.RUnlock()
				}
			}

		case protocol.MsgWhiteboardPermit:
			var req struct {
				Code   string `json:"code"`
				Permit string `json:"permit"`
			}
			if err := json.Unmarshal(payload, &req); err == nil {
				session := sm.GetSession(req.Code)
				if session != nil && isHost {
					session.SetWhiteboardPermit(req.Permit)
					repManager.ReplicateSessionState(session)
					BroadcastClassState(req.Code)
				}
			}

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
			// Check if teacher's login session has expired in Redis
			if s.IsActive && s.HostSessionID != "" && sessionStore != nil {
				val, err := sessionStore.Storage.Get(s.HostSessionID)
				if err != nil || len(val) == 0 {
					log.Printf("[%s] Host session %s has expired. Auto-ending class %s.", nodeName, s.HostSessionID, s.Code)
					s.EndSession()
					repManager.ReplicateSessionState(s)
					BroadcastClassState(s.Code)

					// Eject all participants
					registry.mu.Lock()
					if clients, ok := registry.participants[s.Code]; ok {
						for name, conn := range clients {
							payload, _ := json.Marshal(map[string]string{"message": "Sesi kelas telah berakhir otomatis karena sesi Guru habis."})
							conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, payload))
							conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Kicked"))
							conn.Close()
							delete(clients, name)
						}
					}
					registry.mu.Unlock()
					continue
				}
			}

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
