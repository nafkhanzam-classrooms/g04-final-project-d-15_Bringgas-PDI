package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"classroom-bringgas/classroom"
	"classroom-bringgas/protocol"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
)

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
var nodeName string

func main() {
	// Parse CLI arguments
	port := flag.Int("port", 8789, "Web HTTP and WebSocket Port")
	syncPort := flag.Int("sync-port", 8889, "TCP State Replication Listener Port")
	peerSync := flag.String("peer-sync", "127.0.0.1:8890", "TCP address of replication peer node")
	node := flag.String("node", "node-1", "Name/ID of this server instance")
	flag.Parse()

	nodeName = *node
	sm = classroom.NewSessionManager()

	log.Printf("[%s] Starting Interactive Classroom Server...", nodeName)

	// Callback: When peer replicates session data to us, broadcast the updated state to all our local sockets
	broadcastCB := func(code string) {
		BroadcastClassState(code)
	}

	// Initialize Distributed State Replication over VPN
	syncAddr := fmt.Sprintf("127.0.0.1:%d", *syncPort)
	repManager = classroom.NewReplicationManager(nodeName, syncAddr, *peerSync, sm, broadcastCB)
	repManager.Start()
	defer repManager.Stop()

	// Initialize Fiber App
	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
	})

	app.Use(recover.New())
	app.Use(cors.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path}\n",
	}))

	// Serve Static Files
	app.Static("/css", "./public/css")
	app.Static("/js", "./public/js")

	// Host-based Routing / Role Separation at Gateway level
	app.Get("/", func(c *fiber.Ctx) error {
		host := c.Hostname()
		if host == "guru.lopyta.org" {
			return c.SendFile("./public/host.html")
		}
		// Default is siswa.lopyta.org
		return c.SendFile("./public/index.html")
	})

	app.Get("/host.html", func(c *fiber.Ctx) error {
		if c.Hostname() != "guru.lopyta.org" {
			return c.Status(http.StatusForbidden).SendString("Akses ditolak: Hanya Guru (guru.lopyta.org) yang dapat mengakses panel ini.")
		}
		return c.SendFile("./public/host.html")
	})

	app.Get("/index.html", func(c *fiber.Ctx) error {
		if c.Hostname() == "guru.lopyta.org" {
			return c.Redirect("http://siswa.lopyta.org")
		}
		return c.SendFile("./public/index.html")
	})

	// WebSocket Protocol Handler Upgrade
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// WebSocket Session Event Loop
	app.Get("/ws", websocket.New(handleWebSocket))

	// Heartbeat Check: Periodically prune dead sockets (15s heartbeat timeout)
	go startHeartbeatTicker()

	// Start Listening
	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("[%s] Web Server listening on http://%s", nodeName, addr)
	log.Fatal(app.Listen(addr))
}

// handleWebSocket processes incoming custom binary packets over websocket connections
func handleWebSocket(c *websocket.Conn) {
	var currentCode string
	var currentName string // empty if host
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
				// Replicate disconnect status to peer
				repManager.ReplicateSessionState(session)
				// Broadcast state change to local clients
				BroadcastClassState(currentCode)
			}
			log.Printf("[%s] Participant %s disconnected from session %s", nodeName, currentName, currentCode)
		}
	}()

	for {
		// Read message as binary frame
		mt, message, err := c.ReadMessage()
		if err != nil {
			break
		}

		if mt != websocket.BinaryMessage {
			// Reject non-binary frames (Malformed Packet Edge Case)
			sendError(c, "Protokol error: Server hanya menerima frame biner kustom.")
			continue
		}

		// Decode binary custom protocol frame
		msgType, seq, payload, err := protocol.DecodePacket(message)
		if err != nil {
			log.Printf("[%s] Malformed Packet Error: %v", nodeName, err)
			sendError(c, fmt.Sprintf("Malformed packet rejected: %v", err))
			continue
		}

		// Process Packet based on Message Type
		switch msgType {
		case protocol.MsgCreateClass:
			var req struct {
				ClassName string `json:"className"`
				HostName  string `json:"hostName"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for CREATE_CLASS")
				continue
			}

			// Initialize session
			session := sm.CreateSession(req.ClassName, req.HostName)
			currentCode = session.Code
			isHost = true

			// Register host socket
			registry.mu.Lock()
			registry.hosts[session.Code] = c
			registry.mu.Unlock()

			log.Printf("[%s] Host created session: %s (%s)", nodeName, session.Code, session.ClassName)

			// Replicate to peer server
			repManager.ReplicateSessionState(session)

			// Respond with current state
			sendState(c, session)

		case protocol.MsgJoinClass:
			var req struct {
				Code string `json:"code"`
				Name string `json:"name"`
			}
			if err := json.Unmarshal(payload, &req); err != nil {
				sendError(c, "Invalid JSON payload for JOIN_CLASS")
				continue
			}

			session := sm.GetSession(req.Code)
			if session == nil {
				sendError(c, "Kelas tidak ditemukan. Periksa kembali kode Anda.")
				continue
			}

			// Process join
			participant, status, err := session.JoinParticipant(req.Name)
			if err != nil {
				sendError(c, err.Error())
				continue
			}

			currentCode = req.Code
			currentName = req.Name
			isHost = false

			// Handle duplicate login (Kick previous connection if online locally)
			if status == "kick" {
				registry.mu.Lock()
				if clients, ok := registry.participants[currentCode]; ok {
					if oldConn, exists := clients[currentName]; exists {
						// Send error packet and close
						oldPayload, _ := json.Marshal(map[string]string{"message": "Sesi Anda ditendang karena login ganda."})
						oldConn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, oldPayload))
						oldConn.Close()
					}
				}
				registry.mu.Unlock()
			}

			// Register socket
			registry.mu.Lock()
			if _, ok := registry.participants[currentCode]; !ok {
				registry.participants[currentCode] = make(map[string]*websocket.Conn)
			}
			registry.participants[currentCode][currentName] = c
			registry.mu.Unlock()

			log.Printf("[%s] Student %s joined session %s (%s)", nodeName, participant.Name, currentCode, status)

			// Replicate to peer
			repManager.ReplicateSessionState(session)

			// Broadcast state to everyone
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

			// Send immediate confirmation to student
			resPayload, _ := json.Marshal(map[string]interface{}{
				"isCorrect":    isCorrect,
				"pointsEarned": points,
				"correct":      session.CurrentQuestion.CorrectOption,
			})
			c.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgQuizResult, seq, resPayload))

			log.Printf("[%s] Student %s submitted answer %s. Correct: %v (Points: %d)", nodeName, req.Name, req.Answer, isCorrect, points)

			// Replicate state
			repManager.ReplicateSessionState(session)

			// Broadcast leaderboard/stats
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

			// Replicate and broadcast
			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgSendQuestion:
			var req struct {
				Code            string   `json:"code"`
				QuestionText    string   `json:"questionText"`
				Options         []string `json:"options"`
				CorrectOption   string   `json:"correctOption"`
				DurationSeconds int      `json:"durationSeconds"`
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

			session.StartQuestion(req.QuestionText, req.Options, req.CorrectOption, req.DurationSeconds)
			log.Printf("[%s] Host launched active Quiz Question in %s: %s", nodeName, req.Code, req.QuestionText)

			// Replicate and broadcast
			repManager.ReplicateSessionState(session)
			BroadcastClassState(req.Code)

		case protocol.MsgHeartbeat:
			// Ping-pong response
			c.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgHeartbeat, seq, []byte(`{"status": "pong"}`)))
			
			// Update activity
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

	// 1. Send to local Host socket
	if hostConn, exists := registry.hosts[code]; exists {
		hostConn.WriteMessage(websocket.BinaryMessage, binaryPacket)
	}

	// 2. Send to all local student sockets
	if students, exists := registry.participants[code]; exists {
		for _, studentConn := range students {
			studentConn.WriteMessage(websocket.BinaryMessage, binaryPacket)
		}
	}
}

// sendState sends the class session state to an individual connection
func sendState(conn *websocket.Conn, session *classroom.ClassSession) {
	copied := session.CopyState()
	payload, err := json.Marshal(copied)
	if err != nil {
		return
	}
	conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgClassState, 0, payload))
}

// sendError transmits a structured error frame over binary protocol
func sendError(conn *websocket.Conn, errStr string) {
	payload, _ := json.Marshal(map[string]string{"message": errStr})
	conn.WriteMessage(websocket.BinaryMessage, protocol.EncodePacket(protocol.MsgError, 0, payload))
}

// startHeartbeatTicker periodically checks for participants that missed heartbeats and marks them disconnected
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
					
					// Force close connection locally if present
					registry.mu.Lock()
					if clients, ok := registry.participants[s.Code]; ok {
						if conn, exists := clients[name]; exists {
							conn.Close()
							delete(clients, name)
						}
					}
					registry.mu.Unlock()
				}

				// Recalculate rankings
				s.RecalculateLeaderboard()
				// Replicate state
				repManager.ReplicateSessionState(s)
				// Broadcast state change
				BroadcastClassState(s.Code)
			}
		}
	}
}
