package classroom

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// CompilerResponse is the payload returned after compiling/running student code
type CompilerResponse struct {
	Success bool   `json:"success"`
	Output  string `json:"output"` // Combined stdout and stderr
	Error   string `json:"error"`  // Compiler or execution error description
}

// ExecuteCode compiles and runs the provided code string under C, C++, or Python
func ExecuteCode(lang, code, input string) (*CompilerResponse, error) {
	// Create secure local temp directory for execution
	tempDir, err := os.MkdirTemp("", "lopyta_compiler_")
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary sandbox directory: %v", err)
	}
	defer os.RemoveAll(tempDir) // Prune sandbox automatically upon execution

	var srcFileName string
	switch lang {
	case "c":
		srcFileName = "main.c"
	case "cpp":
		srcFileName = "main.cpp"
	case "python":
		srcFileName = "main.py"
	default:
		return &CompilerResponse{
			Success: false,
			Error:   "Unsupported compiler language. Allowed: c, cpp, python",
		}, nil
	}

	srcPath := filepath.Join(tempDir, srcFileName)
	if err := os.WriteFile(srcPath, []byte(code), 0644); err != nil {
		return nil, fmt.Errorf("failed to write source code: %v", err)
	}

	// Setup execution context with a strict 3-second limit to prevent loop locks
	execCtx, execCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer execCancel()

	var cmd *exec.Cmd

	switch lang {
	case "c", "cpp":
		compiler := "gcc"
		if lang == "cpp" {
			compiler = "g++"
		}
		exePath := filepath.Join(tempDir, "main")

		// 1. Compile phase
		compCmd := exec.CommandContext(execCtx, compiler, "-o", exePath, srcPath)
		compOutput, compErr := compCmd.CombinedOutput()
		if compErr != nil {
			return &CompilerResponse{
				Success: false,
				Output:  string(compOutput),
				Error:   "Compilation Error",
			}, nil
		}

		// 2. Run phase
		cmd = exec.CommandContext(execCtx, exePath)

	case "python":
		// Direct execution phase
		cmd = exec.CommandContext(execCtx, "python3", srcPath)
	}

	// Wire up stdin if test input is supplied
	if input != "" {
		stdinPipe, err := cmd.StdinPipe()
		if err == nil {
			go func() {
				defer stdinPipe.Close()
				io.WriteString(stdinPipe, input)
			}()
		}
	}

	// Capture execution output
	output, err := cmd.CombinedOutput()
	if execCtx.Err() == context.DeadlineExceeded {
		return &CompilerResponse{
			Success: false,
			Output:  string(output),
			Error:   "Execution Timeout: Code took longer than 3 seconds to complete (infinite loop warning)",
		}, nil
	}

	if err != nil {
		return &CompilerResponse{
			Success: false,
			Output:  string(output),
			Error:   fmt.Sprintf("Execution Error: %v", err),
		}, nil
	}

	return &CompilerResponse{
		Success: true,
		Output:  string(output),
	}, nil
}
