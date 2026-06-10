package classroom

import (
	"testing"
	"time"
)

func TestCreateAndJoinSession(t *testing.T) {
	sm := NewSessionManager()
	session := sm.CreateSession("Jaringan Komputer A", "Pak Budi", 1, "CODE12", time.Time{})

	if session.Code == "" {
		t.Fatal("Expected session code to be generated, got empty")
	}

	if session.ClassName != "Jaringan Komputer A" {
		t.Errorf("Expected class name 'Jaringan Komputer A', got '%s'", session.ClassName)
	}

	// Active state check: start session first
	session.StartSession()

	// Join Student 1 (Correct Code)
	p1, status, err := session.JoinParticipant("CODE12")
	if err != nil {
		t.Fatalf("Failed to join student: %v", err)
	}

	if status != "join" {
		t.Errorf("Expected join status 'join', got '%s'", status)
	}

	if p1.Name != "Siswa_CODE12" {
		t.Errorf("Expected student name 'Siswa_CODE12', got '%s'", p1.Name)
	}

	// Check total participants
	if len(session.Participants) != 1 {
		t.Errorf("Expected 1 participant, got %d", len(session.Participants))
	}
}

func TestScoreAndLeaderboardCalculation(t *testing.T) {
	sm := NewSessionManager()
	s := sm.CreateSession("Sesi Test", "Guru", 1, "CODE12", time.Time{})
	s.StartSession()

	// Inject participants manually for isolated leaderboard testing
	s.Participants["Siswa_Alice"] = &Participant{Name: "Siswa_Alice", Active: true}
	s.Participants["Siswa_Bob"] = &Participant{Name: "Siswa_Bob", Active: true}
	s.Participants["Siswa_Charlie"] = &Participant{Name: "Siswa_Charlie", Active: true}

	// Start Quiz
	s.StartQuestion("Protokol UDP?", []string{"TCP", "UDP", "IP", "DNS"}, "B", 10, "quiz")

	// Since we mock, let's inject manually to verify score math
	s.CurrentQuestion.EndTime = time.Now().Add(10 * time.Second) // 10s total duration

	// Alice submits
	isCorrect, pts, _ := s.SubmitAnswer("Siswa_Alice", "B")
	if !isCorrect || pts <= 100 {
		t.Errorf("Expected Alice to be correct with speed bonus (>100), got %v (pts: %d)", isCorrect, pts)
	}

	// Bob submits (we delay slightly)
	s.Participants["Siswa_Alice"].Score = 180
	s.Participants["Siswa_Bob"].Score = 120
	s.Participants["Siswa_Charlie"].Score = 0

	s.RecalculateLeaderboard()

	// Verify leaderboard ranks
	if s.Leaderboard[0].Name != "Siswa_Alice" || s.Leaderboard[0].Rank != 1 {
		t.Errorf("Expected Alice rank 1, got %s rank %d", s.Leaderboard[0].Name, s.Leaderboard[0].Rank)
	}

	if s.Leaderboard[1].Name != "Siswa_Bob" || s.Leaderboard[1].Rank != 2 {
		t.Errorf("Expected Bob rank 2, got %s rank %d", s.Leaderboard[1].Name, s.Leaderboard[1].Rank)
	}

	if s.Leaderboard[2].Name != "Siswa_Charlie" || s.Leaderboard[2].Rank != 3 {
		t.Errorf("Expected Charlie rank 3, got %s rank %d", s.Leaderboard[2].Name, s.Leaderboard[2].Rank)
	}
}

func TestAnswerStreaks(t *testing.T) {
	sm := NewSessionManager()
	s := sm.CreateSession("Sesi Streak", "Guru", 1, "CODE12", time.Time{})
	s.StartSession()

	s.Participants["Siswa_Alice"] = &Participant{Name: "Siswa_Alice", Active: true}

	// Question 1 Correct
	s.StartQuestion("Q1", []string{"A", "B"}, "A", 10, "quiz")
	s.SubmitAnswer("Siswa_Alice", "A")
	if s.Participants["Siswa_Alice"].Streak != 1 {
		t.Errorf("Expected streak 1, got %d", s.Participants["Siswa_Alice"].Streak)
	}

	// Question 2 Correct
	s.StartQuestion("Q2", []string{"A", "B"}, "A", 10, "quiz")
	s.SubmitAnswer("Siswa_Alice", "A")
	if s.Participants["Siswa_Alice"].Streak != 2 {
		t.Errorf("Expected streak 2, got %d", s.Participants["Siswa_Alice"].Streak)
	}

	// Question 3 Incorrect
	s.StartQuestion("Q3", []string{"A", "B"}, "A", 10, "quiz")
	s.SubmitAnswer("Siswa_Alice", "B")
	if s.Participants["Siswa_Alice"].Streak != 0 {
		t.Errorf("Expected streak to reset to 0 after wrong answer, got %d", s.Participants["Siswa_Alice"].Streak)
	}
}
