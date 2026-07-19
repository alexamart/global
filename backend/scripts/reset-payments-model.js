const db = require('../db');

async function resetPaymentsModel() {
  try {
    await db.query('DROP TABLE IF EXISTS payments;');
    await db.query(`
      CREATE TABLE payments (
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
    `);
    console.log('Payments model reset successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to reset payments model:', error);
    process.exit(1);
  }
}

resetPaymentsModel();
