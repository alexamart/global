const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  PUBSUB_TOPIC,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  throw new Error('Missing Gmail API OAuth environment variables. See .env.example');
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

async function watchInbox() {
  if (!PUBSUB_TOPIC) {
    throw new Error('PUBSUB_TOPIC is required to register Gmail watch.');
  }

  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      labelIds: ['INBOX'],
      topicName: PUBSUB_TOPIC,
    },
  });

  return response.data;
}

async function listHistory(startHistoryId) {
  if (!startHistoryId) {
    throw new Error('startHistoryId is required for Gmail history.list');
  }

  const response = await gmail.users.history.list({
    userId: 'me',
    startHistoryId,
    historyTypes: ['messageAdded'],
    labelId: 'INBOX',
  });

  return response.data;
}

async function getMessage(messageId) {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return response.data;
}

module.exports = {
  watchInbox,
  listHistory,
  getMessage,
};
