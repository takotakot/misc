package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
)

// TokenInfo represents the decoded payload of Google OAuth2 token info.
type TokenInfo struct {
	Aud              string      `json:"aud"`
	Azp              string      `json:"azp"`
	Email            string      `json:"email"`
	EmailVerified    interface{} `json:"email_verified"`
	Scope            string      `json:"scope"`
	Exp              string      `json:"exp"`
	Error            string      `json:"error"`
	ErrorDescription string      `json:"error_description"`
}

func getListenAddr() string {
	addr := os.Getenv("OAUTH2_PROXY_HTTP_ADDRESS")
	if addr != "" {
		return addr
	}
	port := os.Getenv("PORT")
	if port != "" {
		if !strings.Contains(port, ":") {
			return ":" + port
		}
		return port
	}
	return ":4180" // Default port matching oauth2-proxy
}

func getUpstreamURL() string {
	upstream := os.Getenv("UPSTREAM_URL")
	if upstream != "" {
		return upstream
	}
	// Attempt to extract upstream from OAUTH2_PROXY_UPSTREAMS
	proxyUpstreams := os.Getenv("OAUTH2_PROXY_UPSTREAMS")
	if proxyUpstreams != "" {
		parts := strings.Split(proxyUpstreams, ",")
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if strings.HasPrefix(part, "http://") || strings.HasPrefix(part, "https://") {
				return part
			}
		}
	}
	return "http://mock-mcp-server:5678" // Fallback default
}

func getClientID() string {
	id := os.Getenv("CLIENT_ID")
	if id == "" {
		id = os.Getenv("OAUTH2_PROXY_CLIENT_ID")
	}
	return id
}

func getClientSecret() string {
	secret := os.Getenv("CLIENT_SECRET")
	if secret == "" {
		secret = os.Getenv("OAUTH2_PROXY_CLIENT_SECRET")
	}
	return secret
}

func getPassthroughMode() bool {
	val := os.Getenv("PASSTHROUGH_MODE")
	val = strings.ToLower(strings.TrimSpace(val))
	return val == "true" || val == "1" || val == "on" || val == "yes"
}

func getAllowedEmails() []string {
	emailsStr := os.Getenv("ALLOWED_EMAILS")
	if emailsStr == "" {
		emailsStr = os.Getenv("OAUTH2_PROXY_ALLOWED_EMAILS")
	}
	if emailsStr == "" {
		return nil
	}
	var emails []string
	for _, email := range strings.Split(emailsStr, ",") {
		email = strings.TrimSpace(email)
		if email != "" {
			emails = append(emails, email)
		}
	}
	return emails
}

func getResourceURL() string {
	resURL := os.Getenv("RESOURCE_URL")
	if resURL != "" {
		return resURL
	}
	redirectURL := os.Getenv("OAUTH2_PROXY_REDIRECT_URL")
	if redirectURL != "" {
		u, err := url.Parse(redirectURL)
		if err == nil {
			return fmt.Sprintf("%s://%s/mcp", u.Scheme, u.Host)
		}
	}
	return "http://localhost:8080/mcp" // Fallback default
}

func extractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		// Convenient fallbacks for query parameters
		if t := r.URL.Query().Get("access_token"); t != "" {
			return t
		}
		if t := r.URL.Query().Get("id_token"); t != "" {
			return t
		}
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
		return parts[1]
	}
	return ""
}

func validateToken(token string, clientID string, allowedEmails []string) (bool, *TokenInfo, error) {
	if token == "" {
		return false, nil, fmt.Errorf("token is empty")
	}

	reqURL := "https://www.googleapis.com/oauth2/v3/tokeninfo"
	u, err := url.Parse(reqURL)
	if err != nil {
		return false, nil, err
	}
	q := u.Query()
	// Detect if JWT (id_token has at least two dots)
	if strings.Count(token, ".") >= 2 {
		q.Set("id_token", token)
	} else {
		q.Set("access_token", token)
	}
	u.RawQuery = q.Encode()

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(u.String())
	if err != nil {
		return false, nil, fmt.Errorf("failed to call tokeninfo: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return false, nil, fmt.Errorf("tokeninfo status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var info TokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return false, nil, fmt.Errorf("failed to decode tokeninfo response: %v", err)
	}

	if info.Error != "" || info.ErrorDescription != "" {
		return false, &info, fmt.Errorf("tokeninfo error: %s - %s", info.Error, info.ErrorDescription)
	}

	// Validate target Client ID
	if clientID != "" {
		if info.Aud != clientID && info.Azp != clientID {
			return false, &info, fmt.Errorf("token client ID mismatch: aud=%q, azp=%q, expected=%q", info.Aud, info.Azp, clientID)
		}
	}

	// Validate email authorization
	if len(allowedEmails) > 0 {
		var emailVerified bool
		if info.EmailVerified != nil {
			switch v := info.EmailVerified.(type) {
			case bool:
				emailVerified = v
			case string:
				emailVerified = (v == "true")
			}
		}

		if info.Email == "" {
			return false, &info, fmt.Errorf("token does not contain email field")
		}

		// If emails filter exists, we generally expect verified emails unless "*"
		isAllAllowed := false
		for _, email := range allowedEmails {
			if email == "*" {
				isAllAllowed = true
				break
			}
		}

		if !isAllAllowed {
			if !emailVerified {
				return false, &info, fmt.Errorf("email %q is not verified by Google", info.Email)
			}

			matched := false
			for _, email := range allowedEmails {
				if strings.EqualFold(email, info.Email) {
					matched = true
					break
				}
			}
			if !matched {
				return false, &info, fmt.Errorf("email %q is not authorized in allowed-emails list", info.Email)
			}
		}
	}

	return true, &info, nil
}

func handleProxy(upstream *url.URL) http.HandlerFunc {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// Ensure Host header matches upstream service
		req.Host = upstream.Host

		// Relay identity headers to upstream
		if email := req.Header.Get("X-Validated-Email"); email != "" {
			req.Header.Set("X-Forwarded-User", email)
			req.Header.Set("X-Forwarded-Email", email)
		}
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
		log.Printf("[ERROR] Proxy error: %v", err)
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("502 Bad Gateway - Upstream unavailable"))
	}

	return func(w http.ResponseWriter, r *http.Request) {
		proxy.ServeHTTP(w, r)
	}
}

func main() {
	listenAddr := getListenAddr()
	upstreamStr := getUpstreamURL()
	clientID := getClientID()
	clientSecret := getClientSecret()
	passthrough := getPassthroughMode()
	allowedEmails := getAllowedEmails()
	resourceURL := getResourceURL()

	log.Printf("Starting small-oauth2-proxy...")
	log.Printf("Listen Address:   %s", listenAddr)
	log.Printf("Upstream URL:     %s", upstreamStr)
	log.Printf("Passthrough Mode: %t", passthrough)
	log.Printf("Client ID:        %s", clientID)
	if clientSecret != "" {
		log.Printf("Client Secret:    [SET]")
	} else {
		log.Printf("Client Secret:    [UNSET]")
	}
	if len(allowedEmails) > 0 {
		log.Printf("Allowed Emails:   %v", allowedEmails)
	} else {
		log.Printf("Allowed Emails:   * (No email restriction)")
	}
	log.Printf("Resource URL:     %s", resourceURL)

	// Validate configuration
	if !passthrough {
		if clientID == "" {
			log.Fatalf("[FATAL] Configuration error: CLIENT_ID is required when PASSTHROUGH_MODE is off")
		}
		if clientSecret == "" {
			log.Fatalf("[FATAL] Configuration error: CLIENT_SECRET is required when PASSTHROUGH_MODE is off")
		}
	} else {
		if clientID == "" || clientSecret == "" {
			log.Printf("[WARN] Running in PASSTHROUGH_MODE without Client ID or Client Secret configured. Authentication checks are bypassed.")
		}
	}

	upstream, err := url.Parse(upstreamStr)
	if err != nil {
		log.Fatalf("[FATAL] Invalid upstream URL %q: %v", upstreamStr, err)
	}

	proxyHandler := handleProxy(upstream)

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		method := r.Method

		log.Printf("[INFO] Request: %s %s from %s", method, path, r.RemoteAddr)

		// Sanitize sensitive upstream identity headers on all incoming requests to prevent header spoofing/injection
		r.Header.Del("X-Validated-Email")
		r.Header.Del("X-Forwarded-User")
		r.Header.Del("X-Forwarded-Email")

		// Add CORS headers for all responses to allow frontend clients to interact with protected resources
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Forwarded-User, X-Forwarded-Email, X-Validated-Email")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")

		// CORS preflight requests bypass token check and get CORS headers
		if method == http.MethodOptions {
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// 1. Return response for /.well-known/oauth-protected-resource
		if path == "/.well-known/oauth-protected-resource" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)

			resp := map[string]interface{}{
				"resource":              resourceURL,
				"authorization_servers": []string{"https://accounts.google.com"},
				"scopes_supported":      []string{"email"},
			}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[ERROR] Failed to encode oauth-protected-resource response: %v", err)
			}
			return
		}

		// 2. Authorize and Proxy /mcp routes
		if strings.HasPrefix(path, "/mcp") {
			if passthrough {
				log.Printf("[INFO] Passthrough mode enabled - forwarding request directly without authentication check")
				proxyHandler(w, r)
				return
			}

			token := extractBearerToken(r)
			if token == "" {
				log.Printf("[WARN] Unauthorized check failed from %s: missing Bearer token", r.RemoteAddr)
				w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token", error_description="Bearer token is missing"`)
				http.Error(w, "401 Unauthorized - Bearer token missing", http.StatusUnauthorized)
				return
			}

			ok, info, err := validateToken(token, clientID, allowedEmails)
			if !ok || err != nil {
				// Log detailed failure to standard logger for host/developer review
				log.Printf("[WARN] Unauthorized check failed from %s: %v", r.RemoteAddr, err)

				// Hide dynamic internal/external detailed details from user to prevent info leak
				w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token", error_description="Access token verification failed"`)
				http.Error(w, "401 Unauthorized - Invalid or expired token", http.StatusUnauthorized)
				return
			}

			log.Printf("[INFO] Authenticated request to %s: user=%s, client_id(aud)=%s", path, info.Email, info.Aud)

			// Inject validated email header
			r.Header.Set("X-Validated-Email", info.Email)

			proxyHandler(w, r)
			return
		}

		// 3. Fallback 404 for any other path
		log.Printf("[WARN] Action block: path %s not allowed", path)
		http.Error(w, "404 Not Found - URL path not allowed by proxy config (only /mcp... or /.well-known/... permitted)", http.StatusNotFound)
	})

	server := &http.Server{
		Addr:         listenAddr,
		Handler:      http.DefaultServeMux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("Listening and serving on %s", listenAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[FATAL] Server crashed: %v", err)
	}
}
