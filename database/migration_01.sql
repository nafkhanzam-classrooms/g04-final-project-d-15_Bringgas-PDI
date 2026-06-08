-- Migration Script 01: Adding Wails Architecture Features

-- 1. Student Roster Table
CREATE TABLE IF NOT EXISTS class_students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_code VARCHAR(6) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    pin_code VARCHAR(20) NOT NULL,
    FOREIGN KEY (class_code) REFERENCES classes(code) ON DELETE CASCADE,
    UNIQUE(class_code, pin_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Question Sets
CREATE TABLE IF NOT EXISTS question_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Slide Triggers
CREATE TABLE IF NOT EXISTS slide_triggers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_code VARCHAR(6) NOT NULL,
    slide_number INT NOT NULL,
    question_id INT NOT NULL,
    FOREIGN KEY (class_code) REFERENCES classes(code) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE,
    UNIQUE(class_code, slide_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Modify existing tables
-- Safely add columns if they don't exist
SET @dbname = DATABASE();

-- Add presentation_file_path to classes
SET @tablename = 'classes';
SET @columnname = 'presentation_file_path';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 1",
  CONCAT("ALTER TABLE ", @tablename, " ADD ", @columnname, " VARCHAR(255) NULL;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add set_id to question_bank
SET @tablename = 'question_bank';
SET @columnname = 'set_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 1",
  CONCAT("ALTER TABLE ", @tablename, " ADD ", @columnname, " INT NULL;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add foreign key for set_id
-- We assume it doesn't exist if we just added the column, but MariaDB might complain if we run it twice. We will just ignore the error if it exists.
-- A simple way in MariaDB is just to let it fail if it already exists, or better, we do it safely:
SELECT count(*) INTO @fk_exists FROM information_schema.table_constraints WHERE table_schema = @dbname AND table_name = 'question_bank' AND constraint_name = 'fk_question_bank_set';
SET @preparedStatement = IF(@fk_exists > 0, 'SELECT 1', 'ALTER TABLE question_bank ADD CONSTRAINT fk_question_bank_set FOREIGN KEY (set_id) REFERENCES question_sets(id) ON DELETE SET NULL;');
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
