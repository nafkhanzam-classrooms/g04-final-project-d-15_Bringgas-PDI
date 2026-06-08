-- MariaDB Database Schema for Bringgas PDI

CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    google_id VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    class_name VARCHAR(255) NOT NULL,
    teacher_id INT NOT NULL,
    student_entry_code VARCHAR(100) NOT NULL,
    scheduled_time DATETIME NULL,
    is_active TINYINT DEFAULT 0,
    presentation_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS question_bank (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    question_text TEXT NOT NULL,
    options TEXT NOT NULL, -- JSON string array e.g. ["A", "B", "C", "D"]
    correct_option VARCHAR(10) NOT NULL, -- e.g. A, B, C, D
    duration_seconds INT DEFAULT 15,
    activity_type VARCHAR(50) DEFAULT 'quiz', -- 'quiz' or 'code'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_code VARCHAR(6) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    score INT DEFAULT 0,
    streak INT DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Feature: Student Roster
CREATE TABLE IF NOT EXISTS class_students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_code VARCHAR(6) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    pin_code VARCHAR(20) NOT NULL,
    FOREIGN KEY (class_code) REFERENCES classes(code) ON DELETE CASCADE,
    UNIQUE(class_code, pin_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Feature: Presentation Files
-- Add presentation_file_path to classes if it doesn't exist
-- Note: MariaDB doesn't have IF NOT EXISTS for columns, we'll handle this in a separate migration script or check in Go, but let's just write the ALTER TABLE statement and catch errors.
-- However, for schema.sql we can just let Go run it. If it fails, we need to handle it. A safer way is to just add it here for future fresh installs. But since it's already running, we need a migration script.

