-- Agent Ops platform schema (owned by the platform builder).
--
-- One database (binding PLATFORM_DB, D1 'invoca-agent-ops'), separate from every agent's own
-- store. Agents only write here through the SDK → ingest(). Timestamps are ISO-8601 UTC text
-- ("2026-10-21T15:04:05.123Z"), so lexical order is time order and range scans use indexes.
-- `source` is 'live' (real Signal Loop telemetry, real demo viewers) or 'simulated' (seeded
-- six-week org history). Every report keeps the two distinguishable.

-- Seed bookkeeping: simulated window, seed version, last roll-forward.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The registry. `record` is the AgentRecord JSON minus the date fields, which live in their own
-- columns so the roll-forward can move them with the simulated calendar.
CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,
  sort         INTEGER NOT NULL DEFAULT 0,
  record       TEXT NOT NULL,          -- AgentRecord (without lastReview/nextReview/launchedAt)
  profile      TEXT NOT NULL,          -- AgentProfile: success metric, SLO targets, budget, review record, runbook
  last_review  TEXT NOT NULL,
  next_review  TEXT NOT NULL,
  launched_at  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Simulated employees (and nothing about live viewers, who stay anonymous).
CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  department  TEXT NOT NULL,
  title       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS changelog (
  id        TEXT PRIMARY KEY,
  agent_id  TEXT NOT NULL,
  at        TEXT NOT NULL,
  kind      TEXT NOT NULL,
  title     TEXT NOT NULL,
  detail    TEXT NOT NULL,
  actor     TEXT NOT NULL,
  ref       TEXT,
  source    TEXT NOT NULL DEFAULT 'simulated'
);
CREATE INDEX IF NOT EXISTS changelog_agent_at ON changelog (agent_id, at);

CREATE TABLE IF NOT EXISTS usage_events (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  source       TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  actor_id     TEXT NOT NULL,
  actor_role   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  path         TEXT,
  props        TEXT NOT NULL DEFAULT '{}',
  at           TEXT NOT NULL,
  duration_ms  INTEGER
);
CREATE INDEX IF NOT EXISTS usage_at ON usage_events (at);
CREATE INDEX IF NOT EXISTS usage_agent_at ON usage_events (agent_id, at);
CREATE INDEX IF NOT EXISTS usage_source_at ON usage_events (source, at);
CREATE INDEX IF NOT EXISTS usage_actor ON usage_events (actor_id, at);

CREATE TABLE IF NOT EXISTS logs (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  source        TEXT NOT NULL,
  at            TEXT NOT NULL,
  level         TEXT NOT NULL,
  component     TEXT NOT NULL,
  event         TEXT NOT NULL,
  message       TEXT NOT NULL,
  trace_id      TEXT NOT NULL,
  span_id       TEXT,
  run_id        TEXT,
  workspace_id  TEXT,
  duration_ms   INTEGER,
  fields        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS logs_at ON logs (at);
CREATE INDEX IF NOT EXISTS logs_agent_at ON logs (agent_id, at);
CREATE INDEX IF NOT EXISTS logs_event_at ON logs (event, at);
CREATE INDEX IF NOT EXISTS logs_trace ON logs (trace_id);
CREATE INDEX IF NOT EXISTS logs_run ON logs (run_id);
CREATE INDEX IF NOT EXISTS logs_ws_at ON logs (workspace_id, at);

CREATE TABLE IF NOT EXISTS spans (
  trace_id     TEXT NOT NULL,
  span_id      TEXT NOT NULL,
  parent_id    TEXT,
  agent_id     TEXT NOT NULL,
  source       TEXT NOT NULL,
  name         TEXT NOT NULL,
  start        TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  status       TEXT NOT NULL,
  attrs        TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (trace_id, span_id)
);
CREATE INDEX IF NOT EXISTS spans_agent_start ON spans (agent_id, start);

CREATE TABLE IF NOT EXISTS work_units (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL,
  source           TEXT NOT NULL,
  at               TEXT NOT NULL,
  kind             TEXT NOT NULL,
  actor_id         TEXT,
  minutes_saved    REAL NOT NULL,
  human_minutes    REAL NOT NULL,
  ai_cost_usd      REAL NOT NULL,
  outcome          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_at ON work_units (at);
CREATE INDEX IF NOT EXISTS work_agent_at ON work_units (agent_id, at);

-- Historical alerts (seeded incidents). Current alerts are computed from rules at read time.
CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  at           TEXT NOT NULL,
  severity     TEXT NOT NULL,
  rule         TEXT NOT NULL,
  expected     TEXT NOT NULL,
  actual       TEXT NOT NULL,
  status       TEXT NOT NULL,
  owner        TEXT NOT NULL,
  runbook      TEXT NOT NULL,
  trace_id     TEXT,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS alerts_agent_at ON alerts (agent_id, at);

-- Acknowledgements are per viewer workspace, so one panelist never changes another's view.
-- Acknowledging is not resolving: a computed alert resolves only when its rule stops firing.
CREATE TABLE IF NOT EXISTS alert_acks (
  alert_id   TEXT NOT NULL,
  workspace  TEXT NOT NULL,
  at         TEXT NOT NULL,
  note       TEXT,
  PRIMARY KEY (alert_id, workspace)
);

-- Impact assumptions: 'seed' is the baseline; a viewer's edit is an override in their workspace.
CREATE TABLE IF NOT EXISTS assumptions (
  workspace          TEXT PRIMARY KEY,
  loaded_hourly_usd  REAL NOT NULL,
  updated_at         TEXT NOT NULL
);
INSERT OR IGNORE INTO assumptions (workspace, loaded_hourly_usd, updated_at) VALUES ('seed', 85, '2026-09-14T00:00:00.000Z');
