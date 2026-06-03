package classroom

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"classroom-bringgas/database"
)

// Teacher represents a persistent teacher account in MariaDB
type Teacher struct {
	ID        int       `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	GoogleID  string    `json:"googleId"`
	CreatedAt time.Time `json:"createdAt"`
}

// GetOrCreateTeacher retrieves a teacher by Google ID/email or inserts a new record if they do not exist
func GetOrCreateTeacher(email, name, googleID string) (*Teacher, error) {
	db := database.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database connection is not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var t Teacher
	// Check if teacher exists by Google ID
	query := "SELECT id, email, name, google_id, created_at FROM teachers WHERE google_id = ? OR email = ?"
	err := db.QueryRowContext(ctx, query, googleID, email).Scan(&t.ID, &t.Email, &t.Name, &t.GoogleID, &t.CreatedAt)

	if err == nil {
		// Teacher exists, update name if necessary
		if t.Name != name {
			updateQuery := "UPDATE teachers SET name = ? WHERE id = ?"
			db.ExecContext(ctx, updateQuery, name, t.ID)
			t.Name = name
		}
		return &t, nil
	}

	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("error querying teacher account: %v", err)
	}

	// Teacher does not exist, perform insertion
	insertQuery := "INSERT INTO teachers (email, name, google_id) VALUES (?, ?, ?)"
	res, err := db.ExecContext(ctx, insertQuery, email, name, googleID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert new teacher: %v", err)
	}

	lastID, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve inserted teacher ID: %v", err)
	}

	return &Teacher{
		ID:        int(lastID),
		Email:     email,
		Name:      name,
		GoogleID:  googleID,
		CreatedAt: time.Now(),
	}, nil
}

// GetTeacherByID fetches a teacher account by their primary key
func GetTeacherByID(id int) (*Teacher, error) {
	db := database.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database connection is not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var t Teacher
	query := "SELECT id, email, name, google_id, created_at FROM teachers WHERE id = ?"
	err := db.QueryRowContext(ctx, query, id).Scan(&t.ID, &t.Email, &t.Name, &t.GoogleID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &t, nil
}

// MockLoginTeacher logs in or registers a developer test account to bypass live Google OAuth checks
func MockLoginTeacher(email string) (*Teacher, error) {
	log.Printf("[Auth] Triggering mock developer Google login for email: %s", email)
	mockGoogleID := "mock_google_oauth_sub_" + email
	mockName := "Dosen Bringgas (Local)"

	return GetOrCreateTeacher(email, mockName, mockGoogleID)
}
