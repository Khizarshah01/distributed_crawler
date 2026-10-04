CREATE TABLE IF NOT EXISTS frontier (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'fetched', 'failed', 'blocked')),

  depth INTEGER NOT NULL DEFAULT 0,

  locked_by TEXT,
  locked_at TIMESTAMPTZ,

  http_status INTEGER,
  error TEXT,
  domain TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frontier_queue
ON frontier (status, id);

CREATE TABLE IF NOT EXISTS hosts (
  domain TEXT PRIMARY KEY,
  in_flight BOOLEAN NOT NULL DEFAULT FALSE,
  next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);