package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

var DB *sql.DB

// InitDB initializes the MariaDB SQL pool and runs schema migrations
func InitDB(dsn string) error {
	var err error
	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database connection: %v", err)
	}

	// Verify database connection health
	if err := DB.Ping(); err != nil {
		return fmt.Errorf("database connection ping failed: %v", err)
	}

	log.Println("[Database] Successfully connected to MariaDB.")

	// Execute migrations
	schemaPath := "./database/schema.sql"
	if err := RunMigrations(schemaPath); err != nil {
		log.Printf("[Database] Migration warning: %v", err)
	}

	if err := RunMigrations("./database/migration_02.sql"); err != nil {
		log.Printf("[Database] Migration 02 warning: %v", err)
	}

	return nil
}

// RunMigrations executes SQL statements from the provided migration file path
func RunMigrations(schemaPath string) error {
	content, err := os.ReadFile(schemaPath)
	if err != nil {
		return fmt.Errorf("failed to read migration file %s: %v", schemaPath, err)
	}

	queries := strings.Split(string(content), ";")
	for _, query := range queries {
		trimmedQuery := strings.TrimSpace(query)
		if trimmedQuery == "" {
			continue
		}

		_, err := DB.Exec(trimmedQuery)
		if err != nil {
			// Ignore database already exists warnings or duplicate columns
			if !strings.Contains(err.Error(), "already exists") && !strings.Contains(err.Error(), "Duplicate column name") {
				return fmt.Errorf("migration query execution failed: %v\nQuery: %s", err, trimmedQuery)
			}
		}
	}

	log.Println("[Database] Schema migrations executed successfully.")
	return nil
}

// GetDB returns the active database connection pool
func GetDB() *sql.DB {
	return DB
}
