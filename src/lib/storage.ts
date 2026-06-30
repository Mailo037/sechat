import { openDB, type DBSchema } from "idb"

import type { PersistedChatState } from "@/types"

interface ChatSiteDb extends DBSchema {
  state: {
    key: string
    value: PersistedChatState
  }
}

const DB_NAME = "minimal-chat-site"
const DB_VERSION = 1
export const LOCAL_CHAT_STATE_KEY = "local"

const dbPromise = openDB<ChatSiteDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore("state")
  },
})

export function chatStateKeyForUserId(userId: string) {
  return `user:${userId}`
}

export async function loadChatState(key = LOCAL_CHAT_STATE_KEY) {
  const db = await dbPromise
  return db.get("state", key)
}

export async function saveChatState(
  state: PersistedChatState,
  key = LOCAL_CHAT_STATE_KEY
) {
  const db = await dbPromise
  await db.put("state", state, key)
}

export async function deleteChatState(key: string) {
  const db = await dbPromise
  await db.delete("state", key)
}
