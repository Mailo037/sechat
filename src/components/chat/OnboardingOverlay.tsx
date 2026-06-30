import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FirebaseAuthUser } from "@/lib/firebase/client"
import { cn } from "@/lib/utils"
import { Broom, GlobeSimple, ShieldCheck } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCacheClearAction } from "@/components/chat/chat-state"

export function OnboardingOverlay({
  authBusy,
  authError,
  authUser,
  busy,
  error,
  reduceMotion,
  remoteEnabled,
  username,
  onGoogleSignIn,
  onSubmit,
  onUsernameChange,
}: {
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  busy: boolean
  error: string | null
  reduceMotion: boolean
  remoteEnabled: boolean
  username: string
  onGoogleSignIn: () => void | Promise<void>
  onSubmit: (name?: string) => Promise<boolean>
  onUsernameChange: (value: string) => void
}) {
  const { cacheClearing, cacheStatus, clearBrowserCache } = useCacheClearAction()

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="onboarding-backdrop"
      exit={{ opacity: 0 }}
      initial={reduceMotion ? false : { opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.section
        animate={{ opacity: 1, y: 0, scale: 1 }}
        aria-label="Chat onboarding"
        aria-modal="true"
        className="onboarding-card"
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
        role="dialog"
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="onboarding-title">
          <ShieldCheck weight="duotone" />
          <div>
            <strong>Join Main Chat</strong>
            <span>Pick a name. Everything else can wait.</span>
          </div>
        </div>

        <form
          className="onboarding-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit(username)
          }}
        >
          <label htmlFor="onboarding-username">Unique username</label>
          <div className="onboarding-username-row">
            <Input
              autoFocus
              id="onboarding-username"
              maxLength={40}
              placeholder="e.g. Lena or milo_dev"
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
            />
            <Button disabled={busy} type="submit" variant="default">
              {busy ? "Checking" : "Continue"}
            </Button>
          </div>
          <small className={cn("onboarding-status", error && "error")}>
            {error ?? "Names are reserved per chat room."}
          </small>
        </form>

        <div className="onboarding-secondary-actions">
          <div className="auth-card">
            <div>
              <span className="setting-label">
                <GlobeSimple weight="duotone" />
                Google account
              </span>
              <p>
                {authUser && !authUser.isAnonymous
                  ? authUser.email || authUser.displayName || "Connected."
                  : "Optional. Keep this identity on other devices."}
              </p>
              {authError ? <small className="auth-error">{authError}</small> : null}
            </div>
            <Button
              disabled={authBusy || !remoteEnabled || Boolean(authUser && !authUser.isAnonymous)}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void onGoogleSignIn()}
            >
              {authBusy
                ? "Opening"
                : authUser && !authUser.isAnonymous
                  ? "Connected"
                  : "Google"}
            </Button>
          </div>

          <div className="onboarding-cache-card">
            <span className="setting-label">
              <Broom weight="duotone" />
              App cache
            </span>
            <Button
              disabled={cacheClearing}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void clearBrowserCache()}
            >
              {cacheClearing ? "Clearing" : "Clear"}
            </Button>
            {cacheStatus ? (
              <small className="onboarding-status" role="status">
                {cacheStatus}
              </small>
            ) : null}
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}
