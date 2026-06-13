package classroom

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

// PubSubEvent represents a real-time event broadcasted across the server cluster
type PubSubEvent struct {
	Sender  string `json:"sender"`
	Action  string `json:"action"` // "sync", "delete", "draw", "clear_whiteboard"
	Code    string `json:"code"`
	Payload []byte `json:"payload,omitempty"`
}

// ReplicationManager handles inter-server real-time synchronization via Redis Pub/Sub
type ReplicationManager struct {
	nodeName       string
	syncAddr       string                   // Retained for interface compatibility in main.go
	peerAddr       string                   // Retained for interface compatibility in main.go
	sessionManager *SessionManager
	broadcastCB    func(sessionCode string) // Callback to notify local WebSocket clients of updated state
	broadcastRawCB func(sessionCode string, payload []byte) // Callback to broadcast raw packets
	closeChan      chan struct{}
	wg             sync.WaitGroup
}

// NewReplicationManager creates a new ReplicationManager leveraging Redis Pub/Sub
func NewReplicationManager(nodeName, syncAddr, peerAddr string, sm *SessionManager, broadcastCB func(sessionCode string), broadcastRawCB func(sessionCode string, payload []byte)) *ReplicationManager {
	return &ReplicationManager{
		nodeName:       nodeName,
		syncAddr:       syncAddr,
		peerAddr:       peerAddr,
		sessionManager: sm,
		broadcastCB:    broadcastCB,
		broadcastRawCB: broadcastRawCB,
		closeChan:      make(chan struct{}),
	}
}

// Start launches the Redis Pub/Sub listener in a background goroutine
func (rm *ReplicationManager) Start() {
	rm.wg.Add(1)
	go rm.listenPubSub()
}

// Stop closes the manager and waits for the listener to shut down
func (rm *ReplicationManager) Stop() {
	close(rm.closeChan)
	rm.wg.Wait()
	log.Printf("[%s] Replication Manager stopped.", rm.nodeName)
}

// listenPubSub listens for sync notifications published on the Redis Pub/Sub channel
func (rm *ReplicationManager) listenPubSub() {
	defer rm.wg.Done()

	// Wait for Redis connection to be initialized
	for RedisClient == nil {
		select {
		case <-rm.closeChan:
			return
		case <-time.After(500 * time.Millisecond):
			// Check again
		}
	}

	pubsub := RedisClient.Subscribe(ctx, RedisPubSubChannel)
	defer pubsub.Close()

	log.Printf("[%s] Redis Pub/Sub state clustering listener started on channel: %s", rm.nodeName, RedisPubSubChannel)

	ch := pubsub.Channel()

	for {
		select {
		case <-rm.closeChan:
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			var event PubSubEvent
			if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
				log.Printf("[%s] Error decoding Pub/Sub cluster event: %v", rm.nodeName, err)
				continue
			}

			// Ignore events sent by ourselves to prevent infinite feedback loops
			if event.Sender == rm.nodeName {
				continue
			}

			// Process cluster sync event
			switch event.Action {
			case "sync":
				// Fetch the latest full state from Redis Cache
				session, err := GetSessionFromRedis(event.Code)
				if err != nil {
					log.Printf("[%s] Cluster sync failed: couldn't fetch key %s: %v", rm.nodeName, event.Code, err)
					continue
				}

				// Synchronize the session locally inside the manager
				rm.sessionManager.AddSession(session)
				log.Printf("[%s] Class %s synchronized from peer node %s.", rm.nodeName, event.Code, event.Sender)

				// Notify local WebSocket clients
				if rm.broadcastCB != nil {
					rm.broadcastCB(event.Code)
				}
				
			case "draw":
				// We don't save to the session here; the originating node already saved it to Redis via the full sync at the end of the stroke.
				// We just broadcast the real-time drawing packet to local students so they see it instantly.
				if rm.broadcastRawCB != nil && len(event.Payload) > 0 {
					rm.broadcastRawCB(event.Code, event.Payload)
				}
				
			case "clear_whiteboard":
				if rm.broadcastRawCB != nil && len(event.Payload) > 0 {
					rm.broadcastRawCB(event.Code, event.Payload)
				}

			case "delete":
				rm.sessionManager.RemoveSession(event.Code)
				log.Printf("[%s] Class %s purged based on peer delete event from %s.", rm.nodeName, event.Code, event.Sender)

				if rm.broadcastCB != nil {
					rm.broadcastCB(event.Code)
				}
			}
		}
	}
}

// ReplicateSessionState serializes session state to Redis and publishes a sync event
func (rm *ReplicationManager) ReplicateSessionState(session *ClassSession) {
	// 1. Commit the up-to-date state to global Redis Cache
	if err := SaveSessionToRedis(session); err != nil {
		log.Printf("[%s] Redis cache commit error: %v", rm.nodeName, err)
		return
	}

	// 2. Publish lightweight notification on Pub/Sub channel
	event := PubSubEvent{
		Sender: rm.nodeName,
		Action: "sync",
		Code:   session.Code,
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return
	}

	if RedisClient != nil {
		RedisClient.Publish(ctx, RedisPubSubChannel, payload)
	}

	// 3. Notify local WebSocket clients since pubsub ignores self
	if rm.broadcastCB != nil {
		rm.broadcastCB(session.Code)
	}
}

// ReplicateSessionDelete deletes session state from Redis and publishes a delete event
func (rm *ReplicationManager) ReplicateSessionDelete(code string) {
	// 1. Delete from Redis Cache
	if err := DeleteSessionFromRedis(code); err != nil {
		log.Printf("[%s] Redis cache delete error: %v", rm.nodeName, err)
	}

	// 2. Publish delete notification
	event := PubSubEvent{
		Sender: rm.nodeName,
		Action: "delete",
		Code:   code,
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return
	}

	if RedisClient != nil {
		RedisClient.Publish(ctx, RedisPubSubChannel, payload)
	}
}
