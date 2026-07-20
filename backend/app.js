const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const { insertPayment, getPayments } = require('./services/payments');
const { watchInbox, stopInbox, listHistory, getMessage, testAuth } = require('./services/gmail');
const { parsePaymentEmail } = require('./services/gmailParser');
const { getSyncState, saveSyncState, setWatchEnabled, setAllowedSenders, saveSiteStatus, parseAllowedSenders } = require('./services/sync');
const { pullMessages } = require('./services/pubsub');
const { ensureSchema } = require('./db');
const { getGamesCatalog, seedGamesCatalog } = require('./services/games');

dotenv.config();

ensureSchema()
  .then(async () => {
    try {
      const { query } = require('./db');
      const existing = await query('SELECT COUNT(*)::int AS count FROM games');
      if (existing.rows?.[0]?.count === 0) {
        await seedGamesCatalog((text, params) => query(text, params));
      }
    } catch (error) {
      console.warn('Failed to seed games catalog:', error.message || error);
    }
  })
  .catch((error) => {
    console.warn('Failed to ensure database schema:', error.message || error);
  });

const {
  GMAIL_USER_EMAIL,
  NEON_DATABASE_URL,
  PORT = 4000,
  PUBSUB_VERIFICATION_TOKEN,
  PUBSUB_PUSH_AUDIENCE,
} = process.env;

const missingRequiredEnv = [];
if (!GMAIL_USER_EMAIL) missingRequiredEnv.push('GMAIL_USER_EMAIL');
if (!NEON_DATABASE_URL) missingRequiredEnv.push('NEON_DATABASE_URL');

if (missingRequiredEnv.length) {
  console.warn(`Missing required environment variables: ${missingRequiredEnv.join(', ')}`);
}

const app = express();
app.use(cors());
app.use(express.json());

const notificationSubscribers = new Set();
const sendSseEvent = (res, event, data) => {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.warn('Failed to send SSE event:', err.message || err);
  }
};
const notifySubscribers = (payload) => {
  for (const res of Array.from(notificationSubscribers)) {
    try {
      sendSseEvent(res, 'payment-notification', payload);
    } catch (err) {
      notificationSubscribers.delete(res);
    }
  }
};

// Serve root static site (Global Games) from sibling `globalgames` folder
const path = require('path');
const rootStatic = path.join(__dirname, '..', 'globalgames');
const isProduction = process.env.NODE_ENV === 'production';
const rootStaticOptions = isProduction
  ? {}
  : {
      etag: false,
      maxAge: 0,
      setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      },
    };

console.log(`Serving public site from ${rootStatic}`);
if (!isProduction) {
  console.log('Development mode: disabling static cache for globalgames files');
}

app.use(express.static(rootStatic, rootStaticOptions));
// Also serve the same files under /web so the site's <base href="/web/"> works
app.use('/web', express.static(rootStatic, rootStaticOptions));

// Serve /admin
const adminDist = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production') {
  // In production serve built frontend under /admin
  app.use('/admin', express.static(adminDist));
  app.get('/admin/*', (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
} else {
  // In development proxy /admin to Vite dev server running on :5173
  try {
    const { createProxyMiddleware } = require('http-proxy-middleware');
    app.use(
      '/admin',
      createProxyMiddleware({
        target: 'http://localhost:5173',
        changeOrigin: true,
        ws: true,
        pathRewrite: { '^/admin': '' },
      })
    );
  } catch (e) {
    console.warn('http-proxy-middleware not available; /admin will not be proxied in dev.');
  }
}

// Fallback to root index.html for non-API, non-/admin routes (SPA-friendly)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  return res.sendFile(path.join(rootStatic, 'index.html'));
});

// Only block API routes when required env vars are missing. Allow static and admin routes.
app.use((req, res, next) => {
  if (missingRequiredEnv.length === 0) return next();
  // Allow health/env-check even when envs are missing
  if (req.path === '/api/health' || req.path === '/api/env-check' || req.path === '/api/games') return next();
  // If it's an API request, block it and report missing envs
  if (req.path.startsWith('/api')) {
    return res.status(500).json({
      error: 'Missing required environment variables. Set them in Vercel project settings.',
      missing: missingRequiredEnv,
    });
  }
  // For non-API (static) routes, allow serving so the site and assets load
  return next();
});

async function processMessagesFromHistory(historyId, historyResponse, previousMessageId = null, allowedSenders = []) {
  if (!historyResponse || !historyResponse.history) {
    await saveSyncState(historyId, previousMessageId);
    return { processed: [], history: historyResponse, lastMessageId: previousMessageId };
  }

  const addedMessages = historyResponse.history
    .flatMap((item) => item.messages || [])
    .map((message) => message.id);

  const processed = [];
  let lastMessageId = previousMessageId;

  // Process messages in small concurrent batches to avoid long serial waits
  const batchSize = Number(process.env.PAYMENTS_PROCESS_BATCH || 6);
  for (let i = 0; i < addedMessages.length; i += batchSize) {
    const batch = addedMessages.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (messageId) => {
        try {
          const message = await getMessage(messageId);
          const parsed = parsePaymentEmail(message, allowedSenders);
          if (!parsed) {
            console.log(`Skipped message ${messageId} because it did not match payment filters.`);
            return { skipped: true, messageId };
          }
          const payment = await insertPayment(parsed);
          return { skipped: false, payment, messageId };
        } catch (err) {
          console.warn(`Failed processing message ${messageId}:`, err.message || err);
          return { skipped: true, error: err, messageId };
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const v = r.value;
        if (!v || v.skipped) continue;
        processed.push(v.payment);
        lastMessageId = v.messageId;
      } else {
        console.warn('Message processing promise rejected:', r.reason && (r.reason.message || r.reason));
      }
    }
  }

  await saveSyncState(historyId, lastMessageId);
  return { processed, history: historyResponse, lastMessageId };
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/games', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    // Only return enabled games for public API
    try {
      const { query: dbQuery } = require('./db');
      const rows = await dbQuery(
        'SELECT id, name, slug, platforms FROM games WHERE ($1::text = "" OR name ILIKE $1) AND (disabled IS NOT TRUE) ORDER BY name ASC',
        [`%${query}%`]
      );
      if (Array.isArray(rows.rows) && rows.rows.length > 0) {
        return res.json(rows.rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, platforms: Array.isArray(row.platforms) ? row.platforms : [] })));
      }
    } catch (err) {
      // fallback to built-in catalog
    }
    const games = await getGamesCatalog(query);
    return res.json(games);
  } catch (error) {
    console.error('Failed to load games:', error);
    return res.status(500).json({ error: error.message || 'Failed to load games' });
  }
});

// Admin endpoints for managing games
app.get('/api/admin/games', async (req, res) => {
  try {
    const { query } = require('./db');
    const rows = await query('SELECT id, name, slug, platforms, disabled FROM games ORDER BY name ASC');
    return res.json(rows.rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, platforms: Array.isArray(r.platforms) ? r.platforms : [], disabled: Boolean(r.disabled) })));
  } catch (error) {
    console.error('Failed to load admin games:', error);
    return res.status(500).json({ error: error.message || 'Failed to load admin games' });
  }
});

app.post('/api/admin/games', async (req, res) => {
  try {
    const { name, slug, platforms } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const { query } = require('./db');
    const plat = Array.isArray(platforms) ? platforms : [];
    const result = await query(
      'INSERT INTO games (name, slug, platforms, disabled) VALUES ($1, $2, $3, FALSE) ON CONFLICT (name) DO UPDATE SET slug = EXCLUDED.slug, platforms = EXCLUDED.platforms, disabled = FALSE RETURNING id, name, slug, platforms, disabled',
      [name, slug || null, JSON.stringify(plat)]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create/update game:', error);
    return res.status(500).json({ error: error.message || 'Failed to create/update game' });
  }
});

app.patch('/api/admin/games/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { disabled } = req.body || {};
    const { query } = require('./db');
    const result = await query('UPDATE games SET disabled = $1, updated_at = now() WHERE id = $2 RETURNING id, name, slug, platforms, disabled', [Boolean(disabled), id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update game:', error);
    return res.status(500).json({ error: error.message || 'Failed to update game' });
  }
});

app.delete('/api/admin/games/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { query } = require('./db');
    const result = await query('DELETE FROM games WHERE id = $1 RETURNING id, name', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json({ deleted: true, row: result.rows[0] });
  } catch (error) {
    console.error('Failed to delete game:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete game' });
  }
});

// Dev-only debug endpoint to verify Gmail OAuth credentials.
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/gmail-auth', async (req, res) => {
    try {
      const profile = await testAuth();
      return res.json({ ok: true, profile });
    } catch (err) {
      console.error('Debug gmail-auth failed:', err && (err.message || err));
      return res.status(500).json({ ok: false, error: err && (err.message || String(err)) });
    }
  });
}

app.get('/api/env-check', (req, res) => {
  res.json({
    hasGmailUserEmail: Boolean(process.env.GMAIL_USER_EMAIL),
    hasNeonDatabaseUrl: Boolean(process.env.NEON_DATABASE_URL),
    vercelEnv: process.env.VERCEL_ENV || null,
    projectId: process.env.VERCEL_PROJECT_ID || null,
  });
});

app.post('/api/watch', async (req, res) => {
  try {
    const data = await watchInbox();
    if (data?.historyId) {
      const syncState = await saveSyncState(data.historyId, null, true);
      return res.json(syncState);
    }
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/allowed-senders', async (req, res) => {
  try {
    const { senders } = req.body || {};
    const raw = Array.isArray(senders) ? senders.join('\n') : String(senders || '');
    const normalized = parseAllowedSenders(raw);
    const syncState = await setAllowedSenders(normalized.join('\n'));
    res.json(syncState);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/allowed-senders', async (req, res) => {
  try {
    const syncState = await getSyncState();
    res.json({ senders: parseAllowedSenders(syncState?.allowed_senders || process.env.ALLOWED_SENDERS || '') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/site-status', async (req, res) => {
  try {
    const { site_closed, site_closed_until, site_closed_text, site_hours_start, site_hours_end } = req.body || {};
    const syncState = await saveSiteStatus(
      Boolean(site_closed),
      site_closed_until || null,
      String(site_hours_start || '10:00'),
      String(site_hours_end || '23:00'),
      site_closed_text || null
    );
    res.json(syncState);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/site-status', async (req, res) => {
  try {
    const syncState = await getSyncState();
    const hoursStart = syncState?.site_hours_start || '10:00';
    const hoursEnd = syncState?.site_hours_end || '23:00';
    res.json({
      site_closed: Boolean(syncState?.site_closed),
      site_closed_until: syncState?.site_closed_until || null,
      site_closed_text: syncState?.site_closed_text || null,
      site_hours_start: hoursStart,
      site_hours_end: hoursEnd,
      site_hours: `${hoursStart} - ${hoursEnd}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/watch/start', async (req, res) => {
  try {
    const data = await watchInbox();
    if (data?.historyId) {
      const syncState = await saveSyncState(data.historyId, null, true);
      return res.json(syncState);
    }
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/watch/stop', async (req, res) => {
  try {
    await stopInbox();
  } catch (error) {
    console.warn('Gmail stopInbox failed:', error.message || error);
  }

  try {
    const syncState = await setWatchEnabled(false);
    res.json(syncState);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/refresh', async (req, res) => {
  try {
    const { history_id } = req.body;
    let startHistoryId = history_id;

    if (!startHistoryId) {
      const syncState = await getSyncState();
      if (!syncState) {
        return res.status(400).json({ error: 'history_id is required when no sync state exists' });
      }
      startHistoryId = syncState.history_id;
    }

    let history;
    try {
      history = await listHistory(startHistoryId);
    } catch (err) {
      console.error('Gmail history.list failed:', err && (err.message || err));
      return res.status(502).json({
        error: 'Failed to fetch Gmail history',
        message: err && (err.message || String(err)),
      });
    }
    const syncState = await getSyncState();
    const allowedSenders = parseAllowedSenders(syncState?.allowed_senders || process.env.ALLOWED_SENDERS || '');
    const result = await processMessagesFromHistory(startHistoryId, history, null, allowedSenders);
    res.json(result);
  } catch (error) {
    console.error('Unexpected /api/payments/refresh error:', error && (error.message || error));
    res.status(500).json({ error: error && (error.message || String(error)) });
  }
});

app.get('/api/notifications/subscribe', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');

  notificationSubscribers.add(res);
  req.on('close', () => {
    notificationSubscribers.delete(res);
  });
});

app.post('/api/notifications', async (req, res) => {
  try {
    console.info('[pubsub] /api/notifications called');
    console.debug('[pubsub] headers:', {
      authorization: req.get('authorization'),
      token: req.get('x-pubsub-token') || req.get('x-forwarded-token'),
    });
    const body = req.body;
    console.debug('[pubsub] body received:', body && typeof body === 'object' ? { message: body.message && { attributes: body.message.attributes, data: Boolean(body.message.data) } } : body);

    if (!body || !body.message) {
      console.warn('[pubsub] invalid push payload');
      return res.status(400).json({ error: 'Invalid Pub/Sub push payload' });
    }

    if (PUBSUB_VERIFICATION_TOKEN) {
      const token = req.get('x-pubsub-token') || req.get('x-forwarded-token') || req.get('authorization');
      if (!token || (token !== PUBSUB_VERIFICATION_TOKEN && token !== `Bearer ${PUBSUB_VERIFICATION_TOKEN}`)) {
        console.warn('[pubsub] invalid verification token');
        return res.status(403).json({ error: 'Invalid Pub/Sub verification token' });
      }
    }

    if (PUBSUB_PUSH_AUDIENCE) {
      const authHeader = req.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Pub/Sub push token' });
      }
      const jwt = authHeader.slice(7);
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken: jwt, audience: PUBSUB_PUSH_AUDIENCE });
      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(401).json({ error: 'Invalid Pub/Sub push token' });
      }
    }

    const messageData = Buffer.from(body.message.data || '', 'base64').toString('utf8');
    console.debug('[pubsub] decoded message data:', messageData);
    const notification = JSON.parse(messageData);

    console.info('[pubsub] push notification received', { historyId: notification.historyId, messageId: notification.messageId });

    const syncState = await getSyncState();
    if (!syncState) {
      console.warn('[pubsub] no sync state available');
      return res.status(400).json({ error: 'No sync state available. Call /api/watch first.' });
    }

    const startHistoryId = syncState.history_id;
    const history = await listHistory(startHistoryId);
    const allowedSenders = parseAllowedSenders(syncState?.allowed_senders || process.env.ALLOWED_SENDERS || '');
    const result = await processMessagesFromHistory(startHistoryId, history, null, allowedSenders);

    if (notification.historyId) {
      await saveSyncState(notification.historyId, result.processed[result.processed.length - 1]?.email_id || syncState.last_message_id);
    }

    if (result.processed.length) {
      notifySubscribers({
        notification: {
          historyId: notification.historyId,
          messageId: notification.messageId,
        },
        payments: result.processed,
      });
    }

    console.info('[pubsub] notification processed', { processed: result.processed.length, lastMessageId: result.lastMessageId });
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pubsub/pull', async (req, res) => {
  try {
    const { subscription_name } = req.body;
    if (!subscription_name) {
      return res.status(400).json({ error: 'subscription_name is required' });
    }

    const messages = await pullMessages(subscription_name);
    if (!messages.length) {
      return res.json({ pulled: 0, processed: 0, messages: [] });
    }

    const syncState = await getSyncState();
    if (!syncState) {
      return res.status(400).json({ error: 'No sync state available. Call /api/watch first.' });
    }

    const history = await listHistory(syncState.history_id);
    const allowedSenders = parseAllowedSenders(syncState?.allowed_senders || process.env.ALLOWED_SENDERS || '');
    const result = await processMessagesFromHistory(syncState.history_id, history, null, allowedSenders);
    res.json({ pulled: messages.length, ...result, messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sync', async (req, res) => {
  try {
    const syncState = await getSyncState();
    res.json(syncState || {});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const payments = await getPayments();
    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
