package classroom

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

var RedisClient *redis.Client
var ctx = context.Background()

const (
	RedisSessionPrefix = "lopyta:session:"
	RedisPubSubChannel = "lopyta:class:sync"
)

// InitRedis initializes the connection pool to the Redis server
func InitRedis(addr, password string) error {
	RedisClient = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0, // Use default DB
	})

	// Verify Redis connection health
	status := RedisClient.Ping(ctx)
	if err := status.Err(); err != nil {
		return fmt.Errorf("failed to connect to Redis at %s: %v", addr, err)
	}

	log.Printf("[Redis] Successfully connected to Redis server at %s", addr)
	return nil
}

// GetRedis returns the active Redis client connection
func GetRedis() *redis.Client {
	return RedisClient
}

// SaveSessionToRedis serializes and caches the classroom session state in Redis
func SaveSessionToRedis(session *ClassSession) error {
	if RedisClient == nil {
		return nil
	}

	copied := session.CopyState()
	payload, err := json.Marshal(copied)
	if err != nil {
		return fmt.Errorf("failed to marshal session state for Redis: %v", err)
	}

	key := RedisSessionPrefix + session.Code
	// Store with 24 hours Time-To-Live (controlled cache lifecycle)
	err = RedisClient.Set(ctx, key, payload, 24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to cache session in Redis: %v", err)
	}

	return nil
}

// GetSessionFromRedis fetches and deserializes the cached session state from Redis
func GetSessionFromRedis(code string) (*ClassSession, error) {
	if RedisClient == nil {
		return nil, fmt.Errorf("redis client is not initialized")
	}

	key := RedisSessionPrefix + code
	payload, err := RedisClient.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var session ClassSession
	if err := json.Unmarshal(payload, &session); err != nil {
		return nil, fmt.Errorf("failed to unmarshal cached session: %v", err)
	}

	// Safely initialize custom fields that JSON doesn't reconstruct
	if session.Participants == nil {
		session.Participants = make(map[string]*Participant)
	}
	if session.Leaderboard == nil {
		session.Leaderboard = []LeaderboardEntry{}
	}

	return &session, nil
}

// DeleteSessionFromRedis prunes a session key from the Redis cache
func DeleteSessionFromRedis(code string) error {
	if RedisClient == nil {
		return nil
	}

	key := RedisSessionPrefix + code
	return RedisClient.Del(ctx, key).Err()
}
