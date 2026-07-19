const db = require('../db');

async function insertPayment(payment) {
  const {
    email_id,
    sender,
    amount,
    parsed_amount,
    parsed_customer,
    raw_body,
    transaction_date,
    subject,
    status = 'new',
  } = payment;

  const result = await db.query(
    `INSERT INTO payments (email_id, sender, amount, parsed_amount, parsed_customer, raw_body, transaction_date, subject, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email_id) DO UPDATE
     SET sender = EXCLUDED.sender,
         amount = EXCLUDED.amount,
         parsed_amount = EXCLUDED.parsed_amount,
         parsed_customer = EXCLUDED.parsed_customer,
         raw_body = EXCLUDED.raw_body,
         transaction_date = EXCLUDED.transaction_date,
         subject = EXCLUDED.subject,
         status = EXCLUDED.status
     RETURNING *`,
    [email_id, sender, amount, parsed_amount, parsed_customer, raw_body, transaction_date, subject, status]
  );

  return result.rows[0];
}

async function getPayments() {
  const result = await db.query(
    'SELECT id, email_id, sender, amount, parsed_amount, parsed_customer, raw_body, transaction_date, subject, status, created_at, updated_at FROM payments ORDER BY transaction_date DESC, created_at DESC'
  );
  return result.rows;
}

module.exports = {
  insertPayment,
  getPayments,
};
