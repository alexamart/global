const db = require('../db');

async function insertPayment(payment) {
  const {
    email_id,
    sender,
    amount,
    transaction_date,
    subject,
    status = 'new',
  } = payment;

  const result = await db.query(
    `INSERT INTO payments (email_id, sender, amount, transaction_date, subject, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email_id) DO UPDATE
     SET sender = EXCLUDED.sender,
         amount = EXCLUDED.amount,
         transaction_date = EXCLUDED.transaction_date,
         subject = EXCLUDED.subject,
         status = EXCLUDED.status
     RETURNING *`,
    [email_id, sender, amount, transaction_date, subject, status]
  );

  return result.rows[0];
}

async function getPayments() {
  const result = await db.query(
    'SELECT * FROM payments ORDER BY transaction_date DESC, created_at DESC'
  );
  return result.rows;
}

module.exports = {
  insertPayment,
  getPayments,
};
