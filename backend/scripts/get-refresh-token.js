const { google } = require('googleapis');
const readline = require('readline');
const dotenv = require('dotenv');

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GMAIL_USER_EMAIL,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
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

console.log('1) Visit this URL in a browser:');
console.log(authUrl);
console.log('\n2) Authorize the app and copy the code from the page.');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter the authorization code here: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\nReceived tokens:');
    console.log(JSON.stringify(tokens, null, 2));
    console.log('\nCopy the `refresh_token` value into your backend .env as GOOGLE_REFRESH_TOKEN');
  } catch (err) {
    console.error('Error retrieving access token', err.message);
  } finally {
    rl.close();
  }
});
