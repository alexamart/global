const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

const DEFAULT_TIMEOUT_MS = Number(process.env.GMAIL_API_TIMEOUT_MS || 10000);

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Gmail API timeout after ${ms}ms`)), ms);
    promise
      .then((r) => {
        clearTimeout(t);
        resolve(r);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

function getOauthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing Gmail API OAuth environment variables. See .env.example');
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

function getGmail() {
  return google.gmail({ version: 'v1', auth: getOauthClient() });
}

async function watchInbox() {
  if (!process.env.PUBSUB_TOPIC) {
    throw new Error('PUBSUB_TOPIC is required to register Gmail watch.');
  }

  const gmail = getGmail();
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      labelIds: ['INBOX'],
      topicName: process.env.PUBSUB_TOPIC,
    },
  });
  return response.data;
}

async function stopInbox() {
  const gmail = getGmail();
  await withTimeout(gmail.users.stop({ userId: 'me' }));
}

async function listHistory(startHistoryId) {
  if (!startHistoryId) {
    throw new Error('startHistoryId is required for Gmail history.list');
  }

  const gmail = getGmail();
  console.debug(`[gmail] listHistory startHistoryId=${startHistoryId}`);
  try {
    const response = await withTimeout(
      gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX',
      })
    );
    console.debug(`[gmail] listHistory got ${response.data?.history?.length ?? 0} history items`);
    return response.data;
  } catch (err) {
    const reason = (err && (err.message || err.toString())) || 'unknown error';
    const details = err && err.errors ? JSON.stringify(err.errors) : null;
    const e = new Error(`Gmail history.list failed: ${reason}${details ? ` - ${details}` : ''}`);
    e.original = err;
    console.error('[gmail] listHistory error', e.message);
    throw e;
  }
}

async function getMessage(messageId) {
  const gmail = getGmail();
  console.debug(`[gmail] getMessage messageId=${messageId}`);
  try {
    const response = await withTimeout(
      gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })
    );
    return response.data;
  } catch (err) {
    const reason = (err && (err.message || err.toString())) || 'unknown error';
    console.error(`[gmail] getMessage failed ${messageId}: ${reason}`);
    const e = new Error(`Gmail messages.get failed for ${messageId}: ${reason}`);
    e.original = err;
    throw e;
  }
}

module.exports = {
  watchInbox,
  stopInbox,
  listHistory,
  getMessage,
  // Attempt a lightweight authenticated call to verify OAuth credentials
  async testAuth() {
    const gmail = getGmail();
    try {
      const response = await withTimeout(gmail.users.getProfile({ userId: 'me' }));
      return response.data;
    } catch (err) {
      const reason = (err && (err.message || err.toString())) || 'unknown error';
      const e = new Error(`Gmail testAuth failed: ${reason}`);
      e.original = err;
      throw e;
    }
  },
};
