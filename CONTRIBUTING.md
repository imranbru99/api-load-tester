# Contributing to API Load Tester (`alt`)

Thank you for your interest in contributing! API Load Tester is an open-source, containerized platform combining the best features of Postman, k6, and Grafana for massive-scale API testing and distributed load generation.

---

## 🛠️ Architecture Overview

The repository is modularized into dedicated services:
- **`backend/`**: Node.js/TypeScript Express server, orchestrator, JS VM sandbox, assertions, and mock server.
- **`load-worker/`**: Scalable Go engine utilizing connection pooling, zero-copy socket drains, and reservoir streaming metrics.
- **`frontend/`**: Next.js 14 App Router, Tailwind CSS, real-time WebSocket charts (Recharts).
- **`cli/`**: `alt` headless runner for CI/CD pipelines.
- **`docker/`**: Nginx reverse proxy, Grafana provisioning, and PostgreSQL init scripts.

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Docker & Docker Compose v2+
- Node.js 20+ / 22+
- Go 1.23+ (optional for local Go compilation)

### 2. Environment Setup
```bash
cp .env.example .env
```

### 3. Spin up Infrastructure & Services
```bash
# Bring up PostgreSQL, Redis, InfluxDB, Grafana
docker compose up -d postgres redis influxdb grafana

# Or run the entire containerized stack
docker compose up -d
```

### 4. Running Services Locally (Hot-Reload)
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev

# CLI
cd cli
npm install
npm run build
npm link
```

---

## 🧪 Testing Guidelines
- Verify all changes compile without TypeScript errors:
  ```bash
  cd backend && npm run build
  cd ../frontend && npm run build
  cd ../cli && npm run build
  ```
- Test Docker image builds using the multi-stage Dockerfiles:
  ```bash
  docker compose build
  ```

---

## 📜 Pull Request Process
1. Fork the repo and create your feature branch: `git checkout -b feature/amazing-feature`.
2. Commit your changes with clear semantic messages.
3. Push to your branch and open a Pull Request.
4. Ensure all CI checks pass.
