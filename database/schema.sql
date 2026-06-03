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
