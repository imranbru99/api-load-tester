const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '')
  : (process.env.INTERNAL_API_URL || 'http://localhost:4000');

export async function fetchJson<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error (${res.status}): ${errorText}`);
  }

  return res.json();
}

export function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:4000/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // If behind Nginx on port 80/443, ws connects to /ws on current host
  const host = window.location.port === '3000' ? `${window.location.hostname}:4000` : window.location.host;
  return `${protocol}//${host}/ws`;
}
