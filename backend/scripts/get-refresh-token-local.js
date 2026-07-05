const { google } = require('googleapis');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: scopes,
});

// Helpful debug output: explicitly print client_id and redirect_uri used
console.log('OAuth client_id:', GOOGLE_CLIENT_ID);
console.log('OAuth redirect_uri:', REDIRECT_URI);
console.log('\nOpen this URL in your browser to authorize the app:');
console.log(authUrl);
console.log('\nIf redirected, the script will capture the code on http://localhost:3000 and exchange it for tokens.');

const app = express();

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send('Missing code in query string');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\nReceived tokens:\n');
    console.log(JSON.stringify(tokens, null, 2));
    console.log('\nCopy the `refresh_token` value into your backend .env as GOOGLE_REFRESH_TOKEN');
    res.send('<h2>Authorization complete</h2><p>You can close this window and check the terminal for the refresh token.</p>');
  } catch (err) {
    console.error('Error retrieving access token', err);
    res.status(500).send('Error retrieving access token. See terminal.');
  } finally {
    setTimeout(() => process.exit(0), 1500);
  }
});

app.listen(PORT, () => {
  console.log(`Listening for OAuth callback on http://localhost:${PORT}/oauth2callback`);
});
