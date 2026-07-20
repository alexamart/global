const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function ensureSchema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payments (
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
    );`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      platforms JSONB DEFAULT '[]'::jsonb,
      disabled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );`
  );
  await pool.query(
    'ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS watch_enabled BOOLEAN DEFAULT TRUE;'
  );
  await pool.query(
    'ALTER TABLE games ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE;'
  );
  await pool.query(
    'ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS allowed_senders TEXT DEFAULT NULL;'
  );
  await pool.query(
    'ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS site_closed BOOLEAN DEFAULT FALSE;'
  );
  await pool.query(
    'ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS site_closed_until TIMESTAMPTZ DEFAULT NULL;'
  );
  await pool.query(
    "ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS site_closed_text TEXT DEFAULT NULL;"
  );
  await pool.query(
    "ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS site_hours_start TEXT DEFAULT '10:00';"
  );
  await pool.query(
    "ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS site_hours_end TEXT DEFAULT '23:00';"
  );
  await pool.query(
    "ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS site_hours TEXT DEFAULT '10:00 - 23:00';"
  );  await pool.query(
    'ALTER TABLE payments ADD COLUMN IF NOT EXISTS parsed_amount NUMERIC(12, 2);'
  );
  await pool.query(
    'ALTER TABLE payments ADD COLUMN IF NOT EXISTS parsed_customer TEXT;'
  );
  await pool.query(
    'ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_body TEXT;'
  );
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  ensureSchema,
};
