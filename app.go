package main

import (
	"context"
	"log"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("Wails Desktop App Started (App Struct)")
}

// ChangeSlide exposes a method to change the PPT slide via Wails
func (a *App) ChangeSlide(direction int) {
	log.Printf("Wails App.ChangeSlide called with direction: %d", direction)
	// TODO: Add actual PowerPoint/OS interaction here (e.g., simulating PageUp/PageDown)
}
