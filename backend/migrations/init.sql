CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  email_id TEXT NOT NULL UNIQUE,
  sender TEXT,
  amount NUMERIC(12, 2),
  parsed_amount NUMERIC(12, 2),
  parsed_customer TEXT,
  raw_body TEXT,
  transaction_date TIMESTAMPTZ,
  subject TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gmail_sync (
  id SERIAL PRIMARY KEY,
  history_id BIGINT NOT NULL,
  last_message_id TEXT,
  watch_enabled BOOLEAN DEFAULT TRUE,
  allowed_senders TEXT DEFAULT NULL,
  site_closed BOOLEAN DEFAULT FALSE,
  site_closed_until TIMESTAMPTZ DEFAULT NULL,
  site_closed_text TEXT DEFAULT NULL,
  site_hours_start TEXT DEFAULT '10:00',
  site_hours_end TEXT DEFAULT '23:00',
  site_hours TEXT DEFAULT '10:00 - 23:00',
  updated_at TIMESTAMPTZ DEFAULT now()
);
