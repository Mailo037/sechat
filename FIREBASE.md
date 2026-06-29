# Firebase chat setup

This app can run in two modes:

- Local-only: `FIREBASE_ENABLED=false`, messages stay in IndexedDB.
- Firebase-backed: `FIREBASE_ENABLED=true`, messages sync through Firestore.

## Firebase project

1. Create a Firebase project.
2. Add a Web app and copy the Firebase config values into Vercel environment variables.
3. Enable Authentication and turn on anonymous sign-in.
4. Create a Firestore database.
5. Deploy the Firestore rules:

```bash
npm run firebase:deploy:rules
```

## Vercel environment variables

Copy `.env.example` into Vercel Project Settings -> Environment Variables and fill:

```bash
FIREBASE_ENABLED=true
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
FIREBASE_DATABASE_ID=chat
FIREBASE_ROOM_ID=main
WEB_PASSWORD=...
```

The Vite build maps these build-time env vars into the app's internal Firebase
config. Firebase Web config is still browser-visible by design, so Firestore
security rules remain the real protection.

`WEB_PASSWORD` unlocks the in-app admin popup for moderation logs, message
deletion, and manual user timeouts/bans. Because this is a static frontend,
treat it as a UI gate, not a server-side security boundary. For stronger
production moderation, move these actions behind a server/API that verifies an
admin role before writing moderation documents or deleting messages.

## Local emulator mode

If you want to test without writing to production Firebase:

```bash
npm run firebase:emulators
```

Then set:

```bash
FIREBASE_ENABLED=true
FIREBASE_USE_EMULATORS=true
```
