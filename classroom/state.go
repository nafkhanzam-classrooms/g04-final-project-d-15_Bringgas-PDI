package classroom

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
	"sync"
	"time"

	"classroom-bringgas/database"
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
	Options         []string             `json:"options"`
	CorrectOption   string               `json:"correctOption"`
	DurationSeconds int                  `json:"durationSeconds"`
	EndTime         time.Time            `json:"endTime"`
	Answers         map[string]string    `json:"answers"`
	Timestamps      map[string]time.Time `json:"timestamps"`
}

// LeaderboardEntry is an item in the leaderboard ranking
type LeaderboardEntry struct {
	Name        string `json:"name"`
	Score       int    `json:"score"`
	Streak      int    `json:"streak"`
	Rank        int    `json:"rank"`
	Change      int    `json:"change"`
	LastRank    int    `json:"lastRank"`
	StreakBonus int    `json:"streakBonus"`
}

// ClassSession represents the full state of a single classroom
type ClassSession struct {
	Code              string                  `json:"code"`
	ClassName         string                  `json:"className"`
	HostName          string                  `json:"hostName"`
	TeacherID         int                     `json:"teacherId"`
	StudentEntryCode  string                  `json:"studentEntryCode"` // Kode Khusus (manual or system-generated)
	Active            bool                    `json:"active"`           // WebSocket connectivity active
	IsActive          bool                    `json:"isActive"`         // Teacher started the class
	PointMultiplier   int                     `json:"pointMultiplier"`   // Multiplier x1 or x2
	ScheduledTime     time.Time               `json:"scheduledTime"`
	ActiveSlide       int                     `json:"activeSlide"`
	TotalSlides       int                     `json:"totalSlides"`
	PresentationUrl   string                  `json:"presentationUrl"`
	Participants      map[string]*Participant `json:"participants"`
	CurrentQuestion   *QuizQuestion           `json:"currentQuestion"`
	Leaderboard       []LeaderboardEntry      `json:"leaderboard"`
	CreatedAt         time.Time               `json:"createdAt"`
	mu                sync.RWMutex
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

// GenerateRandomEntryCode generates a 5-character simple numeric entry code
func GenerateRandomEntryCode() string {
	const charset = "0123456789"
	b := make([]byte, 5)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

// CreateSession initializes a new interactive classroom session
func (sm *SessionManager) CreateSession(className, hostName string, teacherID int, entryCode string, schedTime time.Time) *ClassSession {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	var code string
	for {
		code = GenerateRandomCode()
		if _, exists := sm.sessions[code]; !exists {
			break
		}
	}

	// Dynamic student entry code generation
	studentEntryCode := entryCode
	if studentEntryCode == "" {
		studentEntryCode = GenerateRandomEntryCode()
	}

	session := &ClassSession{
		Code:             code,
		ClassName:        className,
		HostName:         hostName,
		TeacherID:        teacherID,
		StudentEntryCode: studentEntryCode,
		Active:           true,
		IsActive:         false, // Class must be explicitly started by the teacher
		PointMultiplier:  1,
		ScheduledTime:    schedTime,
		ActiveSlide:      1,
		TotalSlides:      5,
		Participants:     make(map[string]*Participant),
		Leaderboard:      []LeaderboardEntry{},
		CreatedAt:        time.Now(),
	}

	// Persist the created class metadata to MariaDB in a non-blocking goroutine
	go func() {
		db := database.GetDB()
		if db == nil {
			return
		}
		query := "INSERT INTO classes (code, class_name, teacher_id, student_entry_code, scheduled_time, is_active) VALUES (?, ?, ?, ?, ?, ?)"
		var sched interface{} = nil
		if !schedTime.IsZero() {
			sched = schedTime
		}
		db.Exec(query, session.Code, session.ClassName, session.TeacherID, session.StudentEntryCode, sched, 0)
	}()

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

// RemoveSession deletes a session and logs it
func (sm *SessionManager) RemoveSession(code string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.sessions, code)
}

// JoinParticipant joins a student to a class session, handling registration/reconnection
func (s *ClassSession) JoinParticipant(entryCode string) (*Participant, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Verify Class Active State (Lifecycle control)
	if !s.IsActive {
		return nil, "", fmt.Errorf("Sesi kelas belum dimulai oleh Guru.")
	}

	// 2. Validate Student Entry Code (Kode Khusus / PIN) from database
	db := database.GetDB()
	var studentName string
	if db != nil {
		err := db.QueryRow("SELECT student_name FROM class_students WHERE class_code = ? AND pin_code = ?", s.Code, entryCode).Scan(&studentName)
		if err != nil {
			return nil, "", fmt.Errorf("PIN salah atau Anda tidak terdaftar di kelas ini.")
		}
	} else {
		// Fallback for missing DB (should rarely happen in prod, but safety first)
		if s.StudentEntryCode != "" && entryCode != s.StudentEntryCode {
			return nil, "", fmt.Errorf("Kode Khusus (Entry Code) salah.")
		}
		// If DB is missing and PIN matches global code, we need a name. Since we removed name input, we just use a generic name.
		studentName = "Siswa_" + entryCode
	}

	name := studentName

	p, exists := s.Participants[name]
	if exists {
		if p.Active {
			// Duplicate login: telling the server to kick the old connection
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
		return false, 0, nil
	}

	now := time.Now()
	if now.After(q.EndTime) {
		return false, 0, nil // Timeout
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
		
		timeLeft := q.EndTime.Sub(now)
		totalDuration := time.Duration(q.DurationSeconds) * time.Second
		
		if timeLeft > 0 && totalDuration > 0 {
			speedBonus = int((timeLeft.Seconds() / totalDuration.Seconds()) * 100)
		}
		
		streakBonus := (p.Streak - 1) * 20
		if streakBonus > 100 {
			streakBonus = 100
		}
		if streakBonus < 0 {
			streakBonus = 0
		}

		pointsEarned = baseScore + speedBonus + streakBonus

		// Apply Points Multiplier (Poin x1 atau x2 kustom dari Guru)
		multiplier := s.PointMultiplier
		if multiplier < 1 {
			multiplier = 1
		}
		pointsEarned = pointsEarned * multiplier

		p.Score += pointsEarned
	} else {
		p.Streak = 0
	}

	p.LastActiveTime = now
	s.recalculateLeaderboardNoLock()

	// Persist the student score dynamically to MariaDB in a non-blocking background routine
	go func(classCode, studentName string, score, streak int) {
		db := database.GetDB()
		if db == nil {
			return
		}
		var id int
		err := db.QueryRow("SELECT id FROM submissions WHERE class_code = ? AND student_name = ?", classCode, studentName).Scan(&id)
		if err == sql.ErrNoRows {
			db.Exec("INSERT INTO submissions (class_code, student_name, score, streak) VALUES (?, ?, ?, ?)", classCode, studentName, score, streak)
		} else if err == nil {
			db.Exec("UPDATE submissions SET score = ?, streak = ? WHERE id = ?", score, streak, id)
		}
	}(s.Code, name, p.Score, p.Streak)

	return isCorrect, pointsEarned, nil
}

// StartSession sets class active state to true in-memory and in MariaDB
func (s *ClassSession) StartSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.IsActive = true

	go func(code string) {
		db := database.GetDB()
		if db != nil {
			db.Exec("UPDATE classes SET is_active = 1 WHERE code = ?", code)
		}
	}(s.Code)
}

// EndSession sets class active state to false and marks it in database
func (s *ClassSession) EndSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.IsActive = false

	go func(code string) {
		db := database.GetDB()
		if db != nil {
			db.Exec("UPDATE classes SET is_active = 0 WHERE code = ?", code)
		}
	}(s.Code)
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
	prevRanks := make(map[string]int)
	for _, entry := range s.Leaderboard {
		prevRanks[entry.Name] = entry.Rank
	}

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

	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[i].Score < list[j].Score {
				list[i], list[j] = list[j], list[i]
			}
		}
	}

	for i := range list {
		rank := i + 1
		list[i].Rank = rank
		
		lastRank, hadRank := prevRanks[list[i].Name]
		if hadRank {
			list[i].LastRank = lastRank
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
		Code:             s.Code,
		ClassName:        s.ClassName,
		HostName:         s.HostName,
		TeacherID:        s.TeacherID,
		StudentEntryCode: s.StudentEntryCode,
		Active:           s.Active,
		IsActive:         s.IsActive,
		PointMultiplier:  s.PointMultiplier,
		ScheduledTime:    s.ScheduledTime,
		ActiveSlide:      s.ActiveSlide,
		TotalSlides:      s.TotalSlides,
		CreatedAt:        s.CreatedAt,
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
