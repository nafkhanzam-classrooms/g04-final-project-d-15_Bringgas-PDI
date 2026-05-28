package classroom

import (
	"crypto/rand"
	"math/big"
	"sync"
	"time"
)

// Participant represents a student in a session
type Participant struct {
	Name           string    `json:"name"`
	Score          int       `json:"score"`
	Streak         int       `json:"streak"`
	Active         bool      `json:"active"`
	LastActiveTime time.Time `json:"lastActiveTime"`
}

// QuizQuestion represents the currently active question
type QuizQuestion struct {
	QuestionID      int                  `json:"questionId"`
	QuestionText    string               `json:"questionText"`
	Options         []string             `json:"options"` // e.g. ["Option A", "Option B", "Option C", "Option D"]
	CorrectOption   string               `json:"correctOption"` // "A", "B", "C", or "D"
	DurationSeconds int                  `json:"durationSeconds"`
	EndTime         time.Time            `json:"endTime"`
	Answers         map[string]string    `json:"answers"`    // Name -> Answer
	Timestamps      map[string]time.Time `json:"timestamps"` // Name -> Submission time
}

// LeaderboardEntry is an item in the leaderboard ranking
type LeaderboardEntry struct {
	Name        string `json:"name"`
	Score       int    `json:"score"`
	Streak      int    `json:"streak"`
	Rank        int    `json:"rank"`
	Change      int    `json:"change"` // Rank change: positive = up, negative = down, 0 = no change
	LastRank    int    `json:"lastRank"`
	StreakBonus int    `json:"streakBonus"`
}

// ClassSession represents the full state of a single classroom
type ClassSession struct {
	Code            string                  `json:"code"`
	ClassName       string                  `json:"className"`
	HostName        string                  `json:"hostName"`
	Active          bool                    `json:"active"`
	ActiveSlide     int                     `json:"activeSlide"`
	TotalSlides     int                     `json:"totalSlides"`
	Participants    map[string]*Participant `json:"participants"`
	CurrentQuestion *QuizQuestion           `json:"currentQuestion"`
	Leaderboard     []LeaderboardEntry      `json:"leaderboard"`
	CreatedAt       time.Time               `json:"createdAt"`
	mu              sync.RWMutex
}

// SessionManager manages all active classroom sessions in-memory
type SessionManager struct {
	sessions map[string]*ClassSession
	mu       sync.RWMutex
}

// NewSessionManager creates a new empty SessionManager
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*ClassSession),
	}
}

// GenerateRandomCode generates a 6-character alphanumeric uppercase code
func GenerateRandomCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 6)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

// CreateSession initializes a new interactive classroom session
func (sm *SessionManager) CreateSession(className, hostName string) *ClassSession {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	var code string
	for {
		code = GenerateRandomCode()
		if _, exists := sm.sessions[code]; !exists {
			break
		}
	}

	session := &ClassSession{
		Code:         code,
		ClassName:    className,
		HostName:     hostName,
		Active:       true,
		ActiveSlide:  1,
		TotalSlides:  5, // Default total slides
		Participants: make(map[string]*Participant),
		Leaderboard:  []LeaderboardEntry{},
		CreatedAt:    time.Now(),
	}

	sm.sessions[code] = session
	return session
}

// AddSession force-adds or updates an existing session (used in distributed sync replication)
func (sm *SessionManager) AddSession(session *ClassSession) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.sessions[session.Code] = session
}

// GetSession retrieves a class session by its code
func (sm *SessionManager) GetSession(code string) *ClassSession {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.sessions[code]
}

// RemoveSession deletes a session
func (sm *SessionManager) RemoveSession(code string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.sessions, code)
}

// JoinParticipant joins a student to a class session, handling registration/reconnection
func (s *ClassSession) JoinParticipant(name string) (*Participant, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, exists := s.Participants[name]
	if exists {
		if p.Active {
			// Duplicate login: we return a status telling the server to kick the old one
			p.LastActiveTime = time.Now()
			return p, "kick", nil
		}
		// Reconnect: participant exists but was inactive
		p.Active = true
		p.LastActiveTime = time.Now()
		return p, "reconnect", nil
	}

	// New join
	p = &Participant{
		Name:           name,
		Score:          0,
		Streak:         0,
		Active:         true,
		LastActiveTime: time.Now(),
	}
	s.Participants[name] = p

	// Recalculate leaderboard to include new participant
	s.recalculateLeaderboardNoLock()

	return p, "join", nil
}

// DisconnectParticipant marks a student as inactive (handles disconnect timeout)
func (s *ClassSession) DisconnectParticipant(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, exists := s.Participants[name]
	if exists {
		p.Active = false
		p.LastActiveTime = time.Now()
	}
}

// StartQuestion launches a new multiple choice question
func (s *ClassSession) StartQuestion(qText string, options []string, correct string, duration int) *QuizQuestion {
	s.mu.Lock()
	defer s.mu.Unlock()

	question := &QuizQuestion{
		QuestionID:      1,
		QuestionText:    qText,
		Options:         options,
		CorrectOption:   correct,
		DurationSeconds: duration,
		EndTime:         time.Now().Add(time.Duration(duration) * time.Second),
		Answers:         make(map[string]string),
		Timestamps:      make(map[string]time.Time),
	}

	s.CurrentQuestion = question
	return question
}

// SubmitAnswer processes a student's answer submission, updating points and streaks
func (s *ClassSession) SubmitAnswer(name, answer string) (bool, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	q := s.CurrentQuestion
	if q == nil {
		return false, 0, nil // No active question
	}

	// Check timeout
	now := time.Now()
	if now.After(q.EndTime) {
		return false, 0, nil // Question has expired
	}

	// Record answer
	q.Answers[name] = answer
	q.Timestamps[name] = now

	p, exists := s.Participants[name]
	if !exists {
		return false, 0, nil
	}

	isCorrect := (answer == q.CorrectOption)
	pointsEarned := 0

	if isCorrect {
		p.Streak++
		
		// Formula: Base 100 points + Speed Bonus
		baseScore := 100
		speedBonus := 0
		
		// Calculate time taken
		timeLeft := q.EndTime.Sub(now)
		totalDuration := time.Duration(q.DurationSeconds) * time.Second
		
		if timeLeft > 0 && totalDuration > 0 {
			// Max 100 speed bonus points
			speedBonus = int((timeLeft.Seconds() / totalDuration.Seconds()) * 100)
		}
		
		// Streak Bonus: 20 points per streak level (max 100 extra points)
		streakBonus := (p.Streak - 1) * 20
		if streakBonus > 100 {
			streakBonus = 100
		}
		if streakBonus < 0 {
			streakBonus = 0
		}

		pointsEarned = baseScore + speedBonus + streakBonus
		p.Score += pointsEarned
	} else {
		p.Streak = 0 // Reset streak
	}

	p.LastActiveTime = now
	s.recalculateLeaderboardNoLock()

	return isCorrect, pointsEarned, nil
}

// ChangeSlide updates slide position
func (s *ClassSession) ChangeSlide(slide int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if slide >= 1 {
		s.ActiveSlide = slide
	}
}

// RecalculateLeaderboard updates rankings based on current scores
func (s *ClassSession) RecalculateLeaderboard() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recalculateLeaderboardNoLock()
}

// recalculateLeaderboardNoLock is internal helper, assumes caller holds the lock
func (s *ClassSession) recalculateLeaderboardNoLock() {
	// 1. Keep track of previous ranks to compute rank change
	prevRanks := make(map[string]int)
	for _, entry := range s.Leaderboard {
		prevRanks[entry.Name] = entry.Rank
	}

	// 2. Collect participants
	var list []LeaderboardEntry
	for _, p := range s.Participants {
		streakBonus := (p.Streak - 1) * 20
		if streakBonus < 0 {
			streakBonus = 0
		} else if streakBonus > 100 {
			streakBonus = 100
		}

		list = append(list, LeaderboardEntry{
			Name:        p.Name,
			Score:       p.Score,
			Streak:      p.Streak,
			StreakBonus: streakBonus,
		})
	}

	// 3. Sort by Score descending
	// Simple bubble sort or standard sort is fine since participant counts are small (minimal 5, usually <= 50)
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[i].Score < list[j].Score {
				list[i], list[j] = list[j], list[i]
			}
		}
	}

	// 4. Assign ranks and compute differences
	for i := range list {
		rank := i + 1
		list[i].Rank = rank
		
		lastRank, hadRank := prevRanks[list[i].Name]
		if hadRank {
			list[i].LastRank = lastRank
			// If rank went from 5 to 3, change is +2 (improvement).
			// If rank went from 2 to 4, change is -2.
			list[i].Change = lastRank - rank
		} else {
			list[i].LastRank = rank
			list[i].Change = 0
		}
	}

	s.Leaderboard = list
}

// CopyState creates a safe-to-serialize copy of the classroom session state
func (s *ClassSession) CopyState() *ClassSession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	copied := &ClassSession{
		Code:        s.Code,
		ClassName:   s.ClassName,
		HostName:    s.HostName,
		Active:      s.Active,
		ActiveSlide: s.ActiveSlide,
		TotalSlides: s.TotalSlides,
		CreatedAt:   s.CreatedAt,
	}

	copied.Participants = make(map[string]*Participant)
	for k, v := range s.Participants {
		copied.Participants[k] = &Participant{
			Name:           v.Name,
			Score:          v.Score,
			Streak:         v.Streak,
			Active:         v.Active,
			LastActiveTime: v.LastActiveTime,
		}
	}

	if s.CurrentQuestion != nil {
		q := s.CurrentQuestion
		copied.CurrentQuestion = &QuizQuestion{
			QuestionID:      q.QuestionID,
			QuestionText:    q.QuestionText,
			Options:         q.Options,
			CorrectOption:   q.CorrectOption,
			DurationSeconds: q.DurationSeconds,
			EndTime:         q.EndTime,
			Answers:         make(map[string]string),
			Timestamps:      make(map[string]time.Time),
		}
		for k, v := range q.Answers {
			copied.CurrentQuestion.Answers[k] = v
		}
		for k, v := range q.Timestamps {
			copied.CurrentQuestion.Timestamps[k] = v
		}
	}

	copied.Leaderboard = make([]LeaderboardEntry, len(s.Leaderboard))
	copy(copied.Leaderboard, s.Leaderboard)

	return copied
}

// UpdateParticipantActivity thread-safely bumps a participant's active timestamp
func (s *ClassSession) UpdateParticipantActivity(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, exists := s.Participants[name]; exists {
		p.LastActiveTime = time.Now()
		p.Active = true
	}
}

// GetAllSessions returns a thread-safe snapshot slice of all active sessions
func (sm *SessionManager) GetAllSessions() []*ClassSession {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	sessions := make([]*ClassSession, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

// PruneInactiveParticipants checks and flags participants exceeding heartbeat timeouts
func (s *ClassSession) PruneInactiveParticipants(timeout time.Duration) ([]string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var prunedNames []string
	changed := false
	now := time.Now()

	for name, p := range s.Participants {
		if p.Active && now.Sub(p.LastActiveTime) > timeout {
			p.Active = false
			changed = true
			prunedNames = append(prunedNames, name)
		}
	}

	return prunedNames, changed
}
