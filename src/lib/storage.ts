import { openDB, type DBSchema } from "idb"

import type { PersistedChatState } from "@/types"

interface ChatSiteDb extends DBSchema {
  state: {
    key: "chat"
    value: PersistedChatState
  }
}

const DB_NAME = "minimal-chat-site"
const DB_VERSION = 1

const dbPromise = openDB<ChatSiteDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore("state")
  },
})

export async function loadChatState() {
  const db = await dbPromise
  return db.get("state", "chat")
}

export async function saveChatState(state: PersistedChatState) {
  const db = await dbPromise
  await db.put("state", state, "chat")
}
