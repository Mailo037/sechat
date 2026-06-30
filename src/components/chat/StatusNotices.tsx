import type { SpamGuardState } from "@/types"
import { LockKey, Prohibit } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { formatRemainingTime } from "@/components/chat/chat-format"

export function SpamBanNotice({
  reason,
  remainingMs,
  source,
}: {
  reason?: string
  remainingMs: number
  source?: SpamGuardState["banSource"]
}) {
  const adminBlocked = source === "admin"

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      aria-live="polite"
      className="spam-ban-card"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      role="status"
      transition={{ duration: 0.18 }}
    >
      <div className="spam-ban-title">
        <LockKey weight="bold" />
        <strong>{adminBlocked ? "Admin paused your chat." : "Sechat paused this chat."}</strong>
      </div>
      <p>
        {adminBlocked
          ? reason || "Sending is disabled by an admin."
          : "Sending is temporarily disabled because the spam filter was triggered multiple times."}{" "}
        {adminBlocked && remainingMs > 365 * 24 * 60 * 60 * 1000 ? (
          <span>An admin must restore access.</span>
        ) : (
          <>
            You can continue in <span>{formatRemainingTime(remainingMs)}</span>.
          </>
        )}
      </p>
    </motion.div>
  )
}

export function BanLockdownOverlay({
  reason,
  remainingMs,
}: {
  reason?: string
  remainingMs: number
}) {
  const permanent = remainingMs > 365 * 24 * 60 * 60 * 1000

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-label="Banned from chat"
      aria-live="assertive"
      className="ban-lockdown-overlay"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="alertdialog"
      transition={{ duration: 0.18 }}
    >
      <div className="ban-lockdown-card">
        <span className="ban-lockdown-icon">
          <Prohibit weight="bold" />
        </span>
        <strong>You are banned from this chat.</strong>
        <p>
          {reason || "An admin banned this account."} You cannot read messages,
          react, download media, open links, hear sounds, or join voice chat.
        </p>
        <small>
          {permanent
            ? "An admin must clear the ban before the app unlocks again."
            : `Access returns in ${formatRemainingTime(remainingMs)}.`}
        </small>
      </div>
    </motion.div>
  )
}

export function ComposerStatusNotice({ message }: { message: string }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      aria-live="polite"
      className="spam-ban-card composer-status-card"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      role="status"
      transition={{ duration: 0.16 }}
    >
      <div className="spam-ban-title">
        <LockKey weight="bold" />
        <strong>{message}</strong>
      </div>
    </motion.div>
  )
}
