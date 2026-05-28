package classroom

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"classroom-bringgas/protocol"
)

// ReplicationMessage is the payload sent between server nodes for sync
type ReplicationMessage struct {
	Action string        `json:"action"` // "sync" or "delete"
	Session *ClassSession `json:"session"`
}

// ReplicationManager handles inter-server sync via TCP
type ReplicationManager struct {
	nodeName       string
	syncAddr       string
	peerAddr       string
	sessionManager *SessionManager
	peerConn       net.Conn
	peerMu         sync.Mutex
	broadcastCB    func(sessionCode string) // Callback to notify WebSocket clients of updated state
	closeChan      chan struct{}
}

// NewReplicationManager creates a new ReplicationManager
func NewReplicationManager(nodeName, syncAddr, peerAddr string, sm *SessionManager, broadcastCB func(sessionCode string)) *ReplicationManager {
	return &ReplicationManager{
		nodeName:       nodeName,
		syncAddr:       syncAddr,
		peerAddr:       peerAddr,
		sessionManager: sm,
		broadcastCB:    broadcastCB,
		closeChan:      make(chan struct{}),
	}
}

// Start launches the TCP listener and the background peer connector
func (rm *ReplicationManager) Start() {
	go rm.listen()
	go rm.connectToPeer()
}

// Stop closes the manager
func (rm *ReplicationManager) Stop() {
	close(rm.closeChan)
	rm.peerMu.Lock()
	if rm.peerConn != nil {
		rm.peerConn.Close()
	}
	rm.peerMu.Unlock()
}

// listen listens for incoming replication TCP connections from peers
func (rm *ReplicationManager) listen() {
	listener, err := net.Listen("tcp", rm.syncAddr)
	if err != nil {
		log.Printf("[%s] Replication listener failed to start on %s: %v", rm.nodeName, rm.syncAddr, err)
		return
	}
	defer listener.Close()

	log.Printf("[%s] Replication listener started on %s", rm.nodeName, rm.syncAddr)

	for {
		select {
		case <-rm.closeChan:
			return
		default:
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-rm.closeChan:
					return
				default:
					log.Printf("[%s] Replication Accept error: %v", rm.nodeName, err)
					continue
				}
			}

			// Handle peer replication connection
			go rm.handleIncomingConn(conn)
		}
	}
}

// handleIncomingConn decodes protocol packets sent by the peer
func (rm *ReplicationManager) handleIncomingConn(conn net.Conn) {
	defer conn.Close()
	log.Printf("[%s] Peer connected from %s", rm.nodeName, conn.RemoteAddr().String())

	for {
		// Read packet length first to extract full frame
		header := make([]byte, protocol.HeaderSize)
		_, err := io.ReadFull(conn, header)
		if err != nil {
			if err != io.EOF {
				log.Printf("[%s] Error reading replication header: %v", rm.nodeName, err)
			}
			break
		}

		// Read payload length from header
		payloadLen := binary.BigEndian.Uint32(header[9:13])
		packet := make([]byte, protocol.HeaderSize+payloadLen+protocol.ChecksumSize)
		copy(packet[0:protocol.HeaderSize], header)

		// Read the rest of the packet
		_, err = io.ReadFull(conn, packet[protocol.HeaderSize:])
		if err != nil {
			log.Printf("[%s] Error reading replication body: %v", rm.nodeName, err)
			break
		}

		// Decode custom packet
		msgType, _, payload, err := protocol.DecodePacket(packet)
		if err != nil {
			log.Printf("[%s] Malformed replication packet rejected: %v", rm.nodeName, err)
			continue
		}

		if msgType == protocol.MsgReplicateState {
			var msg ReplicationMessage
			if err := json.Unmarshal(payload, &msg); err != nil {
				log.Printf("[%s] Failed to decode replication message: %v", rm.nodeName, err)
				continue
			}

			// Synchronize to local manager
			if msg.Action == "sync" && msg.Session != nil {
				// Re-initialize mutexes on unmarshaled ClassSession
				// In Go, unmarshaling JSON creates a new struct with zero/default mutexes,
				// which is perfectly clean to reuse!
				
				// We keep existing local locks if they are active, or overwrite state
				rm.sessionManager.AddSession(msg.Session)
				
				// Notify local WebSocket clients
				if rm.broadcastCB != nil {
					rm.broadcastCB(msg.Session.Code)
				}
			} else if msg.Action == "delete" && msg.Session != nil {
				rm.sessionManager.RemoveSession(msg.Session.Code)
			}
		}
	}

	log.Printf("[%s] Peer connection closed from %s", rm.nodeName, conn.RemoteAddr().String())
}

// connectToPeer runs in the background and attempts to dial the peer node
func (rm *ReplicationManager) connectToPeer() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-rm.closeChan:
			return
		case <-ticker.C:
			rm.peerMu.Lock()
			if rm.peerConn != nil {
				rm.peerMu.Unlock()
				continue
			}
			rm.peerMu.Unlock()

			if rm.peerAddr == "" {
				continue
			}

			// Try to connect
			conn, err := net.DialTimeout("tcp", rm.peerAddr, 2*time.Second)
			if err != nil {
				// Peer is not online yet or network error
				continue
			}

			log.Printf("[%s] Connected to replication peer at %s", rm.nodeName, rm.peerAddr)
			rm.peerMu.Lock()
			rm.peerConn = conn
			rm.peerMu.Unlock()
		}
	}
}

// ReplicateSessionState sends a sync command to the peer node
func (rm *ReplicationManager) ReplicateSessionState(session *ClassSession) {
	// Generate safe copy to serialize
	copied := session.CopyState()
	msg := ReplicationMessage{
		Action:  "sync",
		Session: copied,
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[%s] Replication marshal error: %v", rm.nodeName, err)
		return
	}

	// Wrap in custom network protocol packet
	packet := protocol.EncodePacket(protocol.MsgReplicateState, 0, payload)

	rm.peerMu.Lock()
	defer rm.peerMu.Unlock()

	if rm.peerConn != nil {
		_, err := rm.peerConn.Write(packet)
		if err != nil {
			log.Printf("[%s] Peer connection lost while replicating: %v", rm.nodeName, err)
			rm.peerConn.Close()
			rm.peerConn = nil // Will trigger reconnect
		}
	}
}

// ReplicateSessionDelete sends a delete command to the peer node
func (rm *ReplicationManager) ReplicateSessionDelete(code string) {
	msg := ReplicationMessage{
		Action: "delete",
		Session: &ClassSession{
			Code: code,
		},
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[%s] Replication delete marshal error: %v", rm.nodeName, err)
		return
	}

	packet := protocol.EncodePacket(protocol.MsgReplicateState, 0, payload)

	rm.peerMu.Lock()
	defer rm.peerMu.Unlock()

	if rm.peerConn != nil {
		_, err := rm.peerConn.Write(packet)
		if err != nil {
			log.Printf("[%s] Peer connection lost while replicating delete: %v", rm.nodeName, err)
			rm.peerConn.Close()
			rm.peerConn = nil
		}
	}
}
