const db = require('../db');

async function getSyncState() {
  const result = await db.query(
    'SELECT id, history_id, last_message_id, updated_at FROM gmail_sync ORDER BY id DESC LIMIT 1'
  );
  return result.rows[0] || null;
}

async function saveSyncState(historyId, lastMessageId = null) {
  const existing = await getSyncState();

  if (existing) {
    const result = await db.query(
      'UPDATE gmail_sync SET history_id = $1, last_message_id = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [historyId, lastMessageId, existing.id]
    );
    return result.rows[0];
  }

  const result = await db.query(
    'INSERT INTO gmail_sync (history_id, last_message_id) VALUES ($1, $2) RETURNING *',
    [historyId, lastMessageId]
  );
  return result.rows[0];
}

module.exports = {
  getSyncState,
  saveSyncState,
};
