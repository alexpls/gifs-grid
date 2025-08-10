package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type GifsResponse struct {
	URLs []string `json:"urls"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type GifPath struct {
	path string
	safe bool
}

type Data struct {
	gifs []*GifPath
}

const GifsDir = "gifs/gifs"

//go:embed index.html
//go:embed assets/*
var publicFs embed.FS

func main() {
	data, err := loadGifPaths()
	if err != nil {
		log.Fatalf("failed to load gif paths: %v", err)
	}

	log.Printf("loaded %d gif filepaths", len(data.gifs))

	mux := http.NewServeMux()

	mux.HandleFunc("/api/gifs", handleRandomGifs(data))
	mux.HandleFunc("/api/gif/", handleSingleGif)

	public := http.FileServer(http.FS(publicFs))
	mux.Handle("/", public)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	log.Printf("API server running on http://localhost:%s", port)

	server := &http.Server{
		Addr:         ":" + port,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
		Handler:      mux,
	}
	log.Fatal(server.ListenAndServe())
}

func handleRandomGifs(data *Data) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Request: %s", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")

		q := r.URL.Query()

		safe := true
		if safeStr := q.Get("safe"); safeStr == "no" {
			safe = false
		}

		n := 10
		if nStr := q.Get("n"); nStr != "" {
			if parsed, err := strconv.Atoi(nStr); err == nil {
				n = parsed
			}
		}

		maxURLs := min(len(data.gifs), n)
		urls := make([]string, 0, maxURLs)

		log.Printf("Handling random gifs. safe: %t, num: %d", safe, maxURLs)

		for len(urls) < maxURLs {
			pick := data.gifs[rand.Intn(len(data.gifs))]
			if safe && !pick.safe {
				continue
			}
			urls = append(urls, "/api/gif"+pick.path)
		}

		json.NewEncoder(w).Encode(GifsResponse{URLs: urls})
	}
}

func handleSingleGif(w http.ResponseWriter, r *http.Request) {
	log.Printf("Request: %s", r.URL.Path)

	filename := strings.TrimPrefix(r.URL.Path, "/api/gif/")

	if !strings.HasSuffix(strings.ToLower(filename), ".gif") {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, `{"error":"Invalid filename"}`, http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(GifsDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, `{"error":"File not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=604800")) // 1 week

	http.ServeFile(w, r, filePath)
}

func loadDir(path string, safe bool) ([]*GifPath, error) {
	files, err := os.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("failed to load %s: %w", path, err)
	}

	gifs := make([]*GifPath, 0)
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		ext := filepath.Ext(file.Name())
		if ext != ".gif" {
			continue
		}

		g := &GifPath{
			path: strings.TrimPrefix(filepath.Join(path, file.Name()), GifsDir),
			safe: safe,
		}
		gifs = append(gifs, g)
	}

	return gifs, nil
}

func loadGifPaths() (*Data, error) {
	safe, err := loadDir(GifsDir, true)
	if err != nil {
		return nil, err
	}

	naughty, err := loadDir(GifsDir+"/nsfw", false)
	if err != nil {
		return nil, err
	}

	return &Data{
		gifs: append(safe, naughty...),
	}, nil
}
