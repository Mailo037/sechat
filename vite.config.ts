import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const readEnv = (key: string, fallback = '') =>
    env[key] ?? fallback
  const isEnabled = (key: string) => readEnv(key) === 'true'

  return {
    define: {
      __SECHAT_FIREBASE_CONFIG__: JSON.stringify({
        enabled: isEnabled('FIREBASE_ENABLED'),
        apiKey: readEnv('FIREBASE_API_KEY'),
        authDomain: readEnv('FIREBASE_AUTH_DOMAIN'),
        projectId: readEnv('FIREBASE_PROJECT_ID'),
        storageBucket: readEnv('FIREBASE_STORAGE_BUCKET'),
        messagingSenderId: readEnv('FIREBASE_MESSAGING_SENDER_ID'),
        appId: readEnv('FIREBASE_APP_ID'),
        databaseId: readEnv('FIREBASE_DATABASE_ID'),
        roomId: readEnv('FIREBASE_ROOM_ID', 'main'),
        useEmulators: isEnabled('FIREBASE_USE_EMULATORS'),
        emulatorHost: readEnv('FIREBASE_EMULATOR_HOST', '127.0.0.1'),
      }),
      __SECHAT_WEB_PASSWORD__: JSON.stringify(env.WEB_PASSWORD ?? ''),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
