-- Switchboard: workspace state for connectors, the people directory and per-workspace
-- preferences. Like every other viewer write, rows are scoped to one workspace and read as
-- copy-on-write over the seed (an absent connection reads as its seed default; an absent
-- workspace_people row reads as the seed person unchanged).

-- Connection JSON (src/shared/platform.ts Connection, minus the activity counts).
CREATE TABLE IF NOT EXISTS connections (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL, -- connector id
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Test sends through a connector (ConnectionActivity JSON). Deliveries and imports are read
-- from the deliveries and runs tables, so they are never written twice.
CREATE TABLE IF NOT EXISTS connection_activity (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connection_activity_ws ON connection_activity(workspace_id, connector_id, created_at DESC);

-- Person JSON: an edit or deactivation of a seed person (same id), or a person added here.
CREATE TABLE IF NOT EXISTS workspace_people (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Small per-workspace preferences (e.g. 'actor': who the viewer is acting as). JSON values.
CREATE TABLE IF NOT EXISTS workspace_prefs (
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, key)
);

-- Where a run came from (upload, paste, a connector id) and the original file type before it
-- was converted to text. Null on seeded history: the API derives the source from the file.
ALTER TABLE runs ADD COLUMN source TEXT;
ALTER TABLE runs ADD COLUMN source_format TEXT;
