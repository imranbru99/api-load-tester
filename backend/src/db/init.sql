-- API Load Tester Database Initialization Schema
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS environments (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collections (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_runs (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    collection_id VARCHAR(64) REFERENCES collections(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary JSONB DEFAULT '{}'::jsonb,
    thresholds JSONB DEFAULT '[]'::jsonb,
    threshold_passed BOOLEAN DEFAULT true,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS test_results (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    request_name VARCHAR(255) NOT NULL,
    method VARCHAR(16) NOT NULL,
    url TEXT NOT NULL,
    status_code INT,
    response_time_ms NUMERIC(10, 2),
    passed BOOLEAN NOT NULL DEFAULT true,
    assertions JSONB DEFAULT '[]'::jsonb,
    response_headers JSONB DEFAULT '{}'::jsonb,
    response_body_sample TEXT,
    error_message TEXT,
    iteration INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mock_endpoints (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    method VARCHAR(16) NOT NULL,
    path VARCHAR(255) NOT NULL,
    status_code INT NOT NULL DEFAULT 200,
    headers JSONB DEFAULT '{"Content-Type": "application/json"}'::jsonb,
    response_body TEXT DEFAULT '{"message": "ok"}',
    delay_ms INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    collection_id VARCHAR(64) REFERENCES collections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'functional',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    webhooks JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collections_workspace ON collections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_environments_workspace ON environments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_workspace ON test_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_mock_endpoints_lookup ON mock_endpoints(workspace_id, method, path);

INSERT INTO workspaces (id, name, description)
VALUES ('default', 'Default Team Workspace', 'Main workspace for API testing and distributed load testing')
ON CONFLICT (id) DO NOTHING;

INSERT INTO environments (id, workspace_id, name, variables, is_active)
VALUES (
    'env-default',
    'default',
    'Local Environment',
    '{"baseUrl": "http://localhost:4000", "apiKey": "alt_secret_token_123", "timeoutMs": "5000"}'::jsonb,
    true
)
ON CONFLICT (id) DO NOTHING;
