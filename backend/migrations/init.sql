CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  email_id TEXT NOT NULL UNIQUE,
  sender TEXT,
  amount NUMERIC(12, 2),
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
  updated_at TIMESTAMPTZ DEFAULT now()
);
