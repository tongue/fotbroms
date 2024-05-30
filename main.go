package main

import (
	"crypto/sha256"
	"embed"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/sessions"
	"github.com/tongue/fotbroms/middleware"
)

const (
	port = "3000"
)

var (
	//go:embed scripts
	content embed.FS

	templates = template.Must(template.ParseGlob("templates/*.html"))

	key   = []byte("super-secret-key") // this is just a random string
	store = sessions.NewCookieStore(key)
)

type App struct {
	VideoName string
	VideoPath string
}

type Handler struct{}

func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	p := App{}
	renderTemplate(w, "index", p)
}

func (h *Handler) PutVideo(w http.ResponseWriter, r *http.Request) {
	fn := r.Header.Get("File-Name")
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error reading body: %v", err))
		return
	}

	path, err := persistDataAsFile(b, fn)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error persisting data: %v", err))
		return
	}

	session, err := store.Get(r, "app")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error getting session: %v", err))
		return
	}

	session.Values["videoPath"] = path
	session.Values["videoName"] = fn

	err = session.Save(r, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error saving session: %v", err))
		return
	}

	w.Write([]byte(path))
}

func (h *Handler) App(w http.ResponseWriter, r *http.Request) {
	video, videoHeader, err := r.FormFile("video")
	b, err := io.ReadAll(video)
	fn := videoHeader.Filename

	path, err := persistDataAsFile(b, fn)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error persisting data: %v", err))
		return
	}

	session, err := store.Get(r, "app")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error getting session: %v", err))
		return
	}

	session.Values["videoPath"] = path
	session.Values["videoName"] = fn

	err = session.Save(r, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error saving session: %v", err))
		return
	}

	p := App{VideoPath: path, VideoName: fn}

	renderTemplate(w, "index", p)
}

func (h *Handler) VideoPartial(w http.ResponseWriter, r *http.Request) {
	session, err := store.Get(r, "app")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		log.Println(fmt.Printf("Error getting session: %v", err))
		return
	}

	path := session.Values["videoPath"].(string)
	name := session.Values["videoName"].(string)

	p := App{VideoPath: path, VideoName: name}
	renderTemplate(w, "video", p)
}

func persistDataAsFile(data []byte, fileName string) (string, error) {
	hash := sha256.New()
	hash.Write(data)

	ext := filepath.Ext(fileName)
	dir := "./uploads"

	err := os.MkdirAll(dir, os.ModePerm)
	if err != nil {
		return "", err
	}

	path := fmt.Sprintf(dir + "/%x%s", hash.Sum(nil), ext)

	err = os.WriteFile(path, data, 0666)
	if err != nil {
		return "", err
	}
	return path, err
}

func renderTemplate(w http.ResponseWriter, tmpl string, data interface{}) {
	err := templates.ExecuteTemplate(w, tmpl, data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func main() {
	handler := &Handler{}

	mux := http.NewServeMux()
	mux.Handle("GET /scripts/", http.StripPrefix("/", http.FileServer(http.FS(content))))

	mux.HandleFunc("GET /video", handler.VideoPartial)

	mux.HandleFunc("GET /", handler.Start)
	mux.HandleFunc("PUT /", handler.PutVideo)
	mux.HandleFunc("POST /", handler.App)

	server := http.Server{
		Addr:    ":" + port,
		Handler: middleware.Logging(mux),
	}

	log.Println(fmt.Printf("Server is running on port %s\n", port))
	log.Fatal(server.ListenAndServe())
}
