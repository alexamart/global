const db = require('../db');

async function getSyncState() {
  const result = await db.query(
    'SELECT id, history_id, last_message_id, watch_enabled, allowed_senders, site_closed, site_closed_until, site_closed_text, site_hours_start, site_hours_end, site_hours, updated_at FROM gmail_sync ORDER BY id DESC LIMIT 1'
  );
  return result.rows[0] || null;
}

async function saveSyncState(historyId, lastMessageId = null, watchEnabled = true, allowedSenders = undefined) {
  const existing = await getSyncState();

  if (existing) {
    const resolvedWatchEnabled = watchEnabled === undefined ? existing.watch_enabled : watchEnabled;
    const resolvedAllowedSenders = allowedSenders === undefined ? existing.allowed_senders : allowedSenders;
    const result = await db.query(
      'UPDATE gmail_sync SET history_id = $1, last_message_id = $2, watch_enabled = $3, allowed_senders = $4, updated_at = now() WHERE id = $5 RETURNING *',
      [historyId, lastMessageId, resolvedWatchEnabled, resolvedAllowedSenders, existing.id]
    );
    return result.rows[0];
  }

  const result = await db.query(
    'INSERT INTO gmail_sync (history_id, last_message_id, watch_enabled, allowed_senders) VALUES ($1, $2, $3, $4) RETURNING *',
    [historyId, lastMessageId, watchEnabled, allowedSenders || null]
  );
  return result.rows[0];
}

async function setWatchEnabled(enabled) {
  const existing = await getSyncState();
  if (existing) {
    const result = await db.query(
      'UPDATE gmail_sync SET watch_enabled = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [enabled, existing.id]
    );
    return result.rows[0];
  }

  const result = await db.query(
    'INSERT INTO gmail_sync (history_id, last_message_id, watch_enabled, allowed_senders) VALUES (0, NULL, $1, NULL) RETURNING *',
    [enabled]
  );
  return result.rows[0];
}

async function setAllowedSenders(allowedSenders) {
  const existing = await getSyncState();
  if (existing) {
    const result = await db.query(
      'UPDATE gmail_sync SET allowed_senders = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [allowedSenders, existing.id]
    );
    return result.rows[0];
  }

  const result = await db.query(
    'INSERT INTO gmail_sync (history_id, last_message_id, watch_enabled, allowed_senders) VALUES (0, NULL, TRUE, $1) RETURNING *',
    [allowedSenders]
  );
  return result.rows[0];
}

const normalizeTime = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^([0-9]{1,2}):([0-9]{2})(?:\s*(am|pm))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3];

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null;
  if (ampm) {
    if (hour === 12) {
      hour = ampm === 'am' ? 0 : 12;
    } else if (ampm === 'pm') {
      hour += 12;
    }
  }
  if (hour < 0 || hour > 23) return null;
  return `${hour.toString().padStart(2, '0')}:${match[2]}`;
};

async function saveSiteStatus(siteClosed = false, siteClosedUntil = null, siteHoursStart = '10:00', siteHoursEnd = '23:00', siteClosedText = null) {
  const existing = await getSyncState();
  const closedUntilValue = siteClosedUntil ? String(siteClosedUntil) : null;
  const closedTextValue = siteClosedText ? String(siteClosedText) : null;
  const hoursStartValue = normalizeTime(String(siteHoursStart || '10:00')) || '10:00';
  const hoursEndValue = normalizeTime(String(siteHoursEnd || '23:00')) || '23:00';
  const hoursString = `${hoursStartValue} - ${hoursEndValue}`;

  if (existing) {
    const result = await db.query(
      'UPDATE gmail_sync SET site_closed = $1, site_closed_until = $2, site_closed_text = $3, site_hours_start = $4, site_hours_end = $5, site_hours = $6, updated_at = now() WHERE id = $7 RETURNING *',
      [siteClosed, closedUntilValue, closedTextValue, hoursStartValue, hoursEndValue, hoursString, existing.id]
    );
    return result.rows[0];
  }

  const result = await db.query(
    'INSERT INTO gmail_sync (history_id, last_message_id, watch_enabled, allowed_senders, site_closed, site_closed_until, site_closed_text, site_hours_start, site_hours_end, site_hours) VALUES (0, NULL, TRUE, NULL, $1, $2, $3, $4, $5, $6) RETURNING *',
    [siteClosed, closedUntilValue, closedTextValue, hoursStartValue, hoursEndValue, hoursString]
  );
  return result.rows[0];
}

function parseAllowedSenders(value) {
  if (!value) return [];
  return String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  getSyncState,
  saveSyncState,
  setWatchEnabled,
  setAllowedSenders,
  saveSiteStatus,
  parseAllowedSenders,
};
