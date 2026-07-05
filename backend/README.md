# Global Backend

This backend handles Gmail API watch notifications and writes payment data to Neon.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your Google and Neon credentials
3. Run `npm install`
4. Run `npm start`

## Environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GMAIL_USER_EMAIL`
- `GCP_PROJECT_ID`
- `PUBSUB_TOPIC`
- `PUBSUB_VERIFICATION_TOKEN` (optional) — set a shared token and configure your Pub/Sub push to include it as header `x-pubsub-token` for simple verification
- `PUBSUB_PUSH_AUDIENCE` (optional) — set to your push endpoint URL when using Pub/Sub OIDC token verification
- `NEON_DATABASE_URL`
- `PORT`

## Gmail API

- Use OAuth client credentials
- Call `/api/watch` to register the mailbox watch
- Use `history.list` after notifications to fetch new messages

## Pub/Sub notifications

1. Create a Pub/Sub topic in Google Cloud.
2. Grant Gmail publish permission:
   - `serviceAccount:gmail-api-push@system.gserviceaccount.com`
3. Create a push subscription for your topic with endpoint `https://<host>/api/notifications`.
4. If using a shared verification token, configure the subscription to include header `x-pubsub-token: <your-token>`.
5. If using Pub/Sub OIDC authentication, set the push subscription audience to the same URL as `PUBSUB_PUSH_AUDIENCE` and enable OIDC token delivery.
6. Call `/api/watch` to register Gmail watch.
7. Use `/api/notifications` for Pub/Sub push notifications.

## Starting the backend

- `npm install`
- `npm run init-db`
- `npm start`

## Generating a refresh token (recommended local redirect)

Google no longer supports the out-of-band (`urn:ietf:wg:oauth:2.0:oob`) flow for many projects. Use a local redirect instead:

1. In Google Cloud Console, open `APIs & Services` > `Credentials` and edit your OAuth 2.0 Client ID.
2. Add an **Authorized redirect URI**: `http://localhost:3000/oauth2callback` and save.
3. Ensure your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `backend/.env`.
4. Run:

```bash
cd backend
node scripts/get-refresh-token-local.js
```

5. Open the printed URL in your browser, authorize, and the script will print the `refresh_token` to the terminal. Put that value into `backend/.env` as `GOOGLE_REFRESH_TOKEN` and restart the backend.

## Endpoints

- `GET /api/health`
- `POST /api/watch`
- `POST /api/payments/refresh`
- `POST /api/notifications`
- `POST /api/pubsub/pull`
- `GET /api/payments`
- `GET /api/sync`
