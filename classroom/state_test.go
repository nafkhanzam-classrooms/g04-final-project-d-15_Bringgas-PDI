package classroom

import (
	"testing"
	"time"
)

func TestCreateAndJoinSession(t *testing.T) {
	sm := NewSessionManager()
	session := sm.CreateSession("Jaringan Komputer A", "Pak Budi")

	if session.Code == "" {
		t.Fatal("Expected session code to be generated, got empty")
	}

	if session.ClassName != "Jaringan Komputer A" {
		t.Errorf("Expected class name 'Jaringan Komputer A', got '%s'", session.ClassName)
	}

	// Join Student 1
	p1, status, err := session.JoinParticipant("Siswa 1")
	if err != nil {
		t.Fatalf("Failed to join student: %v", err)
	}

	if status != "join" {
		t.Errorf("Expected join status 'join', got '%s'", status)
	}

	if p1.Name != "Siswa 1" {
		t.Errorf("Expected student name 'Siswa 1', got '%s'", p1.Name)
	}

	// Check total participants
	if len(session.Participants) != 1 {
		t.Errorf("Expected 1 participant, got %d", len(session.Participants))
	}
}

func TestScoreAndLeaderboardCalculation(t *testing.T) {
	sm := NewSessionManager()
	s := sm.CreateSession("Sesi Test", "Guru")

	// Join 3 students
	s.JoinParticipant("Alice")
	s.JoinParticipant("Bob")
	s.JoinParticipant("Charlie")

	// Start Quiz
	s.StartQuestion("Protokol UDP?", []string{"TCP", "UDP", "IP", "DNS"}, "B", 10)

	// Submit answers with simulated timestamps (speed)
	// Alice answers correct immediately (high speed bonus)
	// Bob answers correct slowly (low speed bonus)
	// Charlie answers incorrect (0 points)

	// Since we mock, let's inject manually to verify score math
	s.CurrentQuestion.EndTime = time.Now().Add(10 * time.Second) // 10s total duration

	// Alice submits
	isCorrect, pts, _ := s.SubmitAnswer("Alice", "B")
	if !isCorrect || pts <= 100 {
		t.Errorf("Expected Alice to be correct with speed bonus (>100), got %v (pts: %d)", isCorrect, pts)
	}

	// Bob submits (we delay slightly)
	// To mock delay, we manually override Alice's and Bob's scores to test leaderboard sorting
	s.Participants["Alice"].Score = 180
	s.Participants["Bob"].Score = 120
	s.Participants["Charlie"].Score = 0

	s.RecalculateLeaderboard()

	// Verify leaderboard ranks
	if s.Leaderboard[0].Name != "Alice" || s.Leaderboard[0].Rank != 1 {
		t.Errorf("Expected Alice rank 1, got %s rank %d", s.Leaderboard[0].Name, s.Leaderboard[0].Rank)
	}

	if s.Leaderboard[1].Name != "Bob" || s.Leaderboard[1].Rank != 2 {
		t.Errorf("Expected Bob rank 2, got %s rank %d", s.Leaderboard[1].Name, s.Leaderboard[1].Rank)
	}

	if s.Leaderboard[2].Name != "Charlie" || s.Leaderboard[2].Rank != 3 {
		t.Errorf("Expected Charlie rank 3, got %s rank %d", s.Leaderboard[2].Name, s.Leaderboard[2].Rank)
	}
}

func TestAnswerStreaks(t *testing.T) {
	sm := NewSessionManager()
	s := sm.CreateSession("Sesi Streak", "Guru")

	s.JoinParticipant("Alice")

	// Question 1 Correct
	s.StartQuestion("Q1", []string{"A", "B"}, "A", 10)
	s.SubmitAnswer("Alice", "A")
	if s.Participants["Alice"].Streak != 1 {
		t.Errorf("Expected streak 1, got %d", s.Participants["Alice"].Streak)
	}

	// Question 2 Correct
	s.StartQuestion("Q2", []string{"A", "B"}, "A", 10)
	s.SubmitAnswer("Alice", "A")
	if s.Participants["Alice"].Streak != 2 {
		t.Errorf("Expected streak 2, got %d", s.Participants["Alice"].Streak)
	}

	// Question 3 Incorrect
	s.StartQuestion("Q3", []string{"A", "B"}, "A", 10)
	s.SubmitAnswer("Alice", "B")
	if s.Participants["Alice"].Streak != 0 {
		t.Errorf("Expected streak to reset to 0 after wrong answer, got %d", s.Participants["Alice"].Streak)
	}
}
