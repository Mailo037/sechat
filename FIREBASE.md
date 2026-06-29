# Firebase chat setup

This app can run in two modes:

- Local-only: `VITE_FIREBASE_ENABLED=false`, messages stay in IndexedDB.
- Firebase-backed: `VITE_FIREBASE_ENABLED=true`, messages sync through Firestore.

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
VITE_FIREBASE_ENABLED=true
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_ID=chat
VITE_FIREBASE_ROOM_ID=main
```

## Local emulator mode

If you want to test without writing to production Firebase:

```bash
npm run firebase:emulators
```

Then set:

```bash
VITE_FIREBASE_ENABLED=true
VITE_FIREBASE_USE_EMULATORS=true
```
