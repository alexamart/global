const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const { insertPayment, getPayments } = require('./services/payments');
const { watchInbox, listHistory, getMessage } = require('./services/gmail');
const { parsePaymentEmail } = require('./services/gmailParser');
const { getSyncState, saveSyncState } = require('./services/sync');
const { pullMessages } = require('./services/pubsub');

dotenv.config();

const {
  GMAIL_USER_EMAIL,
  NEON_DATABASE_URL,
  PORT = 4000,
  PUBSUB_VERIFICATION_TOKEN,
  PUBSUB_PUSH_AUDIENCE,
} = process.env;

if (!GMAIL_USER_EMAIL || !NEON_DATABASE_URL) {
  throw new Error('Missing required environment variables. See .env.example');
}

const app = express();
app.use(cors());
app.use(express.json());

async function processMessagesFromHistory(historyId, historyResponse, previousMessageId = null) {
  if (!historyResponse || !historyResponse.history) {
    await saveSyncState(historyId, previousMessageId);
    return { processed: [], history: historyResponse, lastMessageId: previousMessageId };
  }

  const addedMessages = historyResponse.history
    .flatMap((item) => item.messages || [])
    .map((message) => message.id);

  const processed = [];
  let lastMessageId = previousMessageId;

  for (const messageId of addedMessages) {
    const message = await getMessage(messageId);
    const parsed = parsePaymentEmail(message);
    const payment = await insertPayment(parsed);
    processed.push(payment);
    lastMessageId = messageId;
  }

  await saveSyncState(historyId, lastMessageId);
  return { processed, history: historyResponse, lastMessageId };
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/watch', async (req, res) => {
  try {
    const data = await watchInbox();
    if (data?.historyId) {
      await saveSyncState(data.historyId, null);
    }
    res.json(data);
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

    const history = await listHistory(startHistoryId);
    const result = await processMessagesFromHistory(startHistoryId, history);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.message) {
      return res.status(400).json({ error: 'Invalid Pub/Sub push payload' });
    }

    if (PUBSUB_VERIFICATION_TOKEN) {
      const token = req.get('x-pubsub-token') || req.get('x-forwarded-token') || req.get('authorization');
      if (!token || (token !== PUBSUB_VERIFICATION_TOKEN && token !== `Bearer ${PUBSUB_VERIFICATION_TOKEN}`)) {
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
    const notification = JSON.parse(messageData);

    const syncState = await getSyncState();
    if (!syncState) {
      return res.status(400).json({ error: 'No sync state available. Call /api/watch first.' });
    }

    const startHistoryId = syncState.history_id;
    const history = await listHistory(startHistoryId);
    const result = await processMessagesFromHistory(startHistoryId, history);

    if (notification.historyId) {
      await saveSyncState(notification.historyId, result.processed[result.processed.length - 1]?.email_id || syncState.last_message_id);
    }

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
    const result = await processMessagesFromHistory(syncState.history_id, history);
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
