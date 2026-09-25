package sender

import (
	"bytes"
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/net/http2"
)

type ClientManager struct {
	httpClient *http.Client
	wsDialer   *websocket.Dialer
	bodyPool   sync.Pool
}

func NewClientManager(keepAlive bool, maxConns int, timeout time.Duration) *ClientManager {
	if maxConns <= 0 {
		maxConns = 10000
	}

	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          maxConns,
		MaxIdleConnsPerHost:   maxConns / 2,
		MaxConnsPerHost:       maxConns,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DisableKeepAlives:     !keepAlive,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true, // Allow self-signed certs during local/staging tests
		},
	}

	_ = http2.ConfigureTransport(tr)

	wsDialer := &websocket.Dialer{
		NetDialContext:   dialer.DialContext,
		HandshakeTimeout: 5 * time.Second,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	return &ClientManager{
		httpClient: &http.Client{
			Transport: tr,
			Timeout:   timeout,
		},
		wsDialer: wsDialer,
		bodyPool: sync.Pool{
			New: func() interface{} {
				return new(bytes.Buffer)
			},
		},
	}
}

// SendHTTPRequest fires an HTTP/1.1 or HTTP/2 request with zero-copy drain
func (cm *ClientManager) SendHTTPRequest(
	ctx context.Context,
	method, urlStr string,
	headers map[string]string,
	body []byte,
) (statusCode int, latencyMs float64, bytesRead int64, err error) {
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, urlStr, bodyReader)
	if err != nil {
		return 0, 0, 0, err
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := cm.httpClient.Do(req)
	latency := float64(time.Since(start).Microseconds()) / 1000.0

	if err != nil {
		return 0, latency, 0, err
	}
	defer resp.Body.Close()

	// Drain body directly to io.Discard to reuse TCP socket without memory allocations
	drained, _ := io.Copy(io.Discard, resp.Body)

	return resp.StatusCode, latency, drained, nil
}

// SendWebSocketProbe performs a WebSocket handshake and optional ping/frame
func (cm *ClientManager) SendWebSocketProbe(
	ctx context.Context,
	urlStr string,
	headers map[string]string,
	payload []byte,
) (statusCode int, latencyMs float64, bytesRead int64, err error) {
	reqHeader := make(http.Header)
	for k, v := range headers {
		reqHeader.Set(k, v)
	}

	start := time.Now()
	conn, resp, err := cm.wsDialer.DialContext(ctx, urlStr, reqHeader)
	latency := float64(time.Since(start).Microseconds()) / 1000.0

	if err != nil {
		if resp != nil {
			return resp.StatusCode, latency, 0, err
		}
		return 0, latency, 0, err
	}
	defer conn.Close()

	var sentBytes int64 = 0
	if len(payload) > 0 {
		_ = conn.WriteMessage(websocket.TextMessage, payload)
		sentBytes = int64(len(payload))
	} else {
		_ = conn.WriteMessage(websocket.PingMessage, []byte{})
	}

	return 101, latency, sentBytes + 128, nil
}

func IsWebSocketURL(urlStr string) bool {
	return strings.HasPrefix(urlStr, "ws://") || strings.HasPrefix(urlStr, "wss://")
}
