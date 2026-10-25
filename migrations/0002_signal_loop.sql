-- Signal Loop schema. Workspaces: seeded history lives in workspace 'seed'; each viewer gets
-- their own workspace id (cookie sl_ws). Reads = seed ∪ own; writes go to own rows only, and
-- edits to seed rows are stored as per-workspace overlays.
-- Raw evidence is immutable and content-addressed (no R2 on this account).

CREATE TABLE IF NOT EXISTS raw_files (
  sha256 TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_files (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  featured INTEGER NOT NULL,
  sort_key TEXT NOT NULL,
  data TEXT NOT NULL -- LibraryFile JSON
);
CREATE INDEX IF NOT EXISTS library_featured ON library_files(featured, sort_key);
CREATE INDEX IF NOT EXISTS library_sha ON library_files(sha256);

CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS routing_rules (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  priority INTEGER NOT NULL,
  data TEXT NOT NULL, -- RoutingRule JSON
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_id TEXT,
  filename TEXT NOT NULL,
  account_id TEXT,
  call_id TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  mode_reason TEXT,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  prompt_version TEXT NOT NULL,
  insight_count INTEGER NOT NULL DEFAULT 0,
  dropped_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  injection_flagged INTEGER NOT NULL DEFAULT 0,
  actionable INTEGER,
  error TEXT,
  workflow_id TEXT,
  replay_of TEXT, -- library file id whose recording this run replays
  format TEXT,
  screen TEXT, -- ScreenOutput JSON
  key_scope TEXT NOT NULL DEFAULT 'runtime' -- 'build' for seeded backfill runs
);
CREATE INDEX IF NOT EXISTS runs_ws_created ON runs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_ws_sha ON runs(workspace_id, sha256);
CREATE INDEX IF NOT EXISTS runs_status ON runs(status, mode);

CREATE TABLE IF NOT EXISTS run_steps (
  run_id TEXT NOT NULL,
  key TEXT NOT NULL,
  idx INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  summary TEXT,
  detail TEXT,
  offset_ms INTEGER, -- replay: when this step starts, relative to the run's created_at
  PRIMARY KEY (run_id, key)
);

CREATE TABLE IF NOT EXISTS transcripts (
  run_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  turns TEXT NOT NULL, -- Turn[] JSON (redacted)
  redactions TEXT NOT NULL -- Redaction[] JSON (masked previews only)
);

-- token → original value. Never selected by any API route.
CREATE TABLE IF NOT EXISTS redaction_vault (run_id TEXT PRIMARY KEY, vault TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  account_id TEXT,
  type TEXT NOT NULL,
  product_area TEXT NOT NULL,
  status TEXT NOT NULL,
  theme_id TEXT,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL -- Insight JSON
);
CREATE INDEX IF NOT EXISTS insights_ws_status ON insights(workspace_id, status);
CREATE INDEX IF NOT EXISTS insights_run ON insights(run_id);
CREATE INDEX IF NOT EXISTS insights_theme ON insights(theme_id);
CREATE INDEX IF NOT EXISTS insights_ws_created ON insights(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  type TEXT NOT NULL,
  product_area TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_id TEXT,
  created_at TEXT NOT NULL,
  vector TEXT -- number[] JSON (768-d); also upserted to Vectorize when available
);
CREATE INDEX IF NOT EXISTS themes_ws ON themes(workspace_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  insight_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  ticket_state TEXT,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL -- Delivery JSON
);
CREATE INDEX IF NOT EXISTS deliveries_ws ON deliveries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deliveries_insight ON deliveries(insight_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  csm_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL -- Notification JSON
);
CREATE INDEX IF NOT EXISTS notifications_ws ON notifications(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  insight_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL, -- ReviewRecord JSON
  response TEXT, -- cached response for idempotent replays
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS reviews_insight ON reviews(insight_id);

-- Copy-on-write edits a viewer makes to seed rows (insight review, ticket state).
CREATE TABLE IF NOT EXISTS overlays (
  workspace_id TEXT NOT NULL,
  entity TEXT NOT NULL, -- 'insight' | 'delivery'
  entity_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entity, entity_id)
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  workspace_id TEXT,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  fallback INTEGER NOT NULL DEFAULT 0,
  schema_retry INTEGER NOT NULL DEFAULT 0,
  key_scope TEXT NOT NULL, -- 'runtime' counts against the $15 budget; 'build' is seeded history
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_calls_scope ON ai_calls(key_scope, created_at);
CREATE INDEX IF NOT EXISTS ai_calls_created ON ai_calls(created_at);
CREATE INDEX IF NOT EXISTS ai_calls_run ON ai_calls(run_id);

CREATE TABLE IF NOT EXISTS budget_reservations (
  run_id TEXT PRIMARY KEY,
  est_usd REAL NOT NULL,
  created_ms INTEGER NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dlq (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  workspace_id TEXT,
  step TEXT NOT NULL,
  error TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dlq_created ON dlq(created_at DESC);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  prompt_version TEXT NOT NULL,
  role TEXT NOT NULL, -- 'promoted' | 'candidate' | 'history'
  created_at TEXT NOT NULL,
  data TEXT NOT NULL -- EvalRun JSON
);

-- ReplayRecording JSON, split into parts (D1 caps one SQL statement at 100 KB).
CREATE TABLE IF NOT EXISTS replays (
  file_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (file_id, part)
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  before TEXT,
  after TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_log(created_at DESC);
