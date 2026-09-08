package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"time"
)

type CommandProcessor struct {
	Executable string
	Args       []string
	Timeout    time.Duration
	MaxOutput  int64
}

func (p CommandProcessor) Process(ctx context.Context, request Request) (json.RawMessage, error) {
	if p.Executable == "" {
		return nil, errors.New("processor executable is required")
	}
	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 15 * time.Minute
	}
	maxOutput := p.MaxOutput
	if maxOutput <= 0 {
		maxOutput = 5 << 20
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	command := exec.CommandContext(ctx, p.Executable, p.Args...)
	input, _ := json.Marshal(request)
	command.Stdin = bytes.NewReader(input)
	var stdout limitedBuffer
	stdout.remaining = maxOutput
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("processor timeout: %w", ctx.Err())
		}
		return nil, fmt.Errorf("processor failed: %w: %s", err, truncate(stderr.String(), 1000))
	}
	if stdout.exceeded {
		return nil, errors.New("processor output exceeded limit")
	}
	output := bytes.TrimSpace(stdout.Buffer.Bytes())
	if !json.Valid(output) {
		return nil, errors.New("processor output is not valid JSON")
	}
	return json.RawMessage(output), nil
}

type limitedBuffer struct {
	bytes.Buffer
	remaining int64
	exceeded  bool
}

func (w *limitedBuffer) Write(p []byte) (int, error) {
	original := len(p)
	if int64(len(p)) > w.remaining {
		p = p[:w.remaining]
		w.exceeded = true
	}
	if len(p) > 0 {
		_, _ = w.Buffer.Write(p)
		w.remaining -= int64(len(p))
	}
	if w.exceeded {
		return original, nil
	}
	return original, nil
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

var _ io.Writer = (*limitedBuffer)(nil)
