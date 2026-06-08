package main

import (
	"classroom-bringgas/database"
	"fmt"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
)

func RegisterNewRoutes(app *fiber.App, authGuard fiber.Handler) {
	// ==========================================
	// STUDENT ROSTER API
	// ==========================================
	app.Get("/api/teacher/classes/:code/students", authGuard, func(c *fiber.Ctx) error {
		code := c.Params("code")
		rows, err := database.DB.Query("SELECT id, student_name, pin_code FROM class_students WHERE class_code = ?", code)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var students []map[string]interface{}
		for rows.Next() {
			var id int
			var name, pin string
			if err := rows.Scan(&id, &name, &pin); err == nil {
				students = append(students, fiber.Map{
					"id":           id,
					"student_name": name,
					"pin_code":     pin,
				})
			}
		}
		return c.JSON(students)
	})

	app.Post("/api/teacher/classes/:code/students", authGuard, func(c *fiber.Ctx) error {
		code := c.Params("code")
		var req struct {
			Name string `json:"student_name"`
			PIN  string `json:"pin_code"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
		}
		if req.Name == "" || req.PIN == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Name and PIN required"})
		}

		res, err := database.DB.Exec("INSERT INTO class_students (class_code, student_name, pin_code) VALUES (?, ?, ?)", code, req.Name, req.PIN)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to insert student or PIN already exists for this class"})
		}
		id, _ := res.LastInsertId()
		return c.JSON(fiber.Map{"id": id, "student_name": req.Name, "pin_code": req.PIN})
	})

	app.Delete("/api/teacher/classes/:code/students/:id", authGuard, func(c *fiber.Ctx) error {
		id := c.Params("id")
		_, err := database.DB.Exec("DELETE FROM class_students WHERE id = ?", id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	// ==========================================
	// PRESENTATION UPLOAD API
	// ==========================================
	app.Post("/api/teacher/classes/:code/upload", authGuard, func(c *fiber.Ctx) error {
		code := c.Params("code")
		file, err := c.FormFile("presentation")
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Upload failed"})
		}
		
		// Save to ./uploads folder
		filename := fmt.Sprintf("%s_%s", code, file.Filename)
		savePath := filepath.Join("./uploads", filename)
		if err := c.SaveFile(file, savePath); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to save file"})
		}

		// Update database
		// NOTE: Office Online requires an absolute public URL
		publicUrl := "https://guru.lopyta.org/uploads/" + filename
		_, err = database.DB.Exec("UPDATE classes SET presentation_url = ? WHERE code = ?", publicUrl, code)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to update class record"})
		}

		// Update memory session if it's currently loaded
		session := sm.GetSession(code)
		if session != nil {
			session.PresentationUrl = publicUrl
			if repManager != nil {
				repManager.ReplicateSessionState(session)
			}
		}

		return c.JSON(fiber.Map{"url": publicUrl})
	})

	// ==========================================
	// TEACHER API ROUTES
	// ==========================================

	app.Get("/api/teacher/stats", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id")
		var stats struct {
			ActiveClasses int `json:"active_classes"`
			TotalStudents int `json:"total_students"`
		}

		// Count active classes
		database.DB.QueryRow("SELECT COUNT(*) FROM classes WHERE teacher_id = ? AND is_active = 1", teacherID).Scan(&stats.ActiveClasses)

		// Count total students registered in all classes for this teacher
		database.DB.QueryRow(`
			SELECT COUNT(cs.id) 
			FROM class_students cs
			JOIN classes c ON cs.class_code = c.code
			WHERE c.teacher_id = ?
		`, teacherID).Scan(&stats.TotalStudents)

		return c.JSON(stats)
	})

	// ==========================================
	// QUESTION SETS API
	// ==========================================
	app.Get("/api/bank/sets", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id")
		rows, err := database.DB.Query("SELECT id, title, created_at FROM question_sets WHERE teacher_id = ? ORDER BY created_at DESC", teacherID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var sets []map[string]interface{}
		for rows.Next() {
			var id int
			var title, createdAt string
			if err := rows.Scan(&id, &title, &createdAt); err == nil {
				sets = append(sets, fiber.Map{
					"id":         id,
					"title":      title,
					"created_at": createdAt,
				})
			}
		}
		return c.JSON(sets)
	})

	app.Post("/api/bank/sets", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id")
		var req struct {
			Title string `json:"title"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
		}
		res, err := database.DB.Exec("INSERT INTO question_sets (teacher_id, title) VALUES (?, ?)", teacherID, req.Title)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		id, _ := res.LastInsertId()
		return c.JSON(fiber.Map{"id": id, "title": req.Title})
	})

	app.Put("/api/bank/sets/:id", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id")
		setID := c.Params("id")
		var req struct {
			Title string `json:"title"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
		}
		_, err := database.DB.Exec("UPDATE question_sets SET title = ? WHERE id = ? AND teacher_id = ?", req.Title, setID, teacherID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	app.Delete("/api/bank/sets/:id", authGuard, func(c *fiber.Ctx) error {
		teacherID := c.Locals("teacher_id")
		setID := c.Params("id")
		
		// Optional: Cascade delete questions in the set, or let DB handle if ON DELETE CASCADE is set
		// Currently we assume the UI will warn them.
		_, err := database.DB.Exec("DELETE FROM question_sets WHERE id = ? AND teacher_id = ?", setID, teacherID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	// ==========================================
	// SLIDE TRIGGERS API
	// ==========================================
	app.Get("/api/teacher/classes/:code/triggers", authGuard, func(c *fiber.Ctx) error {
		code := c.Params("code")
		rows, err := database.DB.Query(`
			SELECT t.id, t.slide_number, t.question_id, q.question_text
			FROM slide_triggers t
			JOIN question_bank q ON t.question_id = q.id
			WHERE t.class_code = ?
		`, code)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		defer rows.Close()

		var triggers []map[string]interface{}
		for rows.Next() {
			var id, slideNum, qID int
			var qText string
			if err := rows.Scan(&id, &slideNum, &qID, &qText); err == nil {
				triggers = append(triggers, fiber.Map{
					"id":            id,
					"slide_number":  slideNum,
					"question_id":   qID,
					"question_text": qText,
				})
			}
		}
		return c.JSON(triggers)
	})

	app.Post("/api/teacher/classes/:code/triggers", authGuard, func(c *fiber.Ctx) error {
		code := c.Params("code")
		var req struct {
			SlideNumber int `json:"slide_number"`
			QuestionID  int `json:"question_id"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
		}

		// Insert or replace trigger
		_, err := database.DB.Exec(`
			INSERT INTO slide_triggers (class_code, slide_number, question_id) 
			VALUES (?, ?, ?) 
			ON DUPLICATE KEY UPDATE question_id = ?
		`, code, req.SlideNumber, req.QuestionID, req.QuestionID)
		
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"success": true})
	})
	
	app.Delete("/api/teacher/classes/:code/triggers/:id", authGuard, func(c *fiber.Ctx) error {
		id := c.Params("id")
		_, err := database.DB.Exec("DELETE FROM slide_triggers WHERE id = ?", id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"success": true})
	})
}
