import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { FirebaseAuthUser } from "@/lib/firebase/client"
import { cn } from "@/lib/utils"
import type { ModerationSettings, ModerationUser, NotificationSettings, Profile, RoomSettings, SoundKind, SpamModerationLogEntry, UiSoundKind, UserModerationState, UsernameClaim } from "@/types"
import { ArrowBendUpLeft, At, Bell, BellRinging, Broom, Camera, CaretUp, Clock, DotsThreeVertical, GlobeSimple, LockKey, Microphone, Paperclip, PencilSimple, PhoneCall, PhoneDisconnect, Play, Prohibit, ShieldCheck, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import type { FormEvent as ReactFormEvent } from "react"
import { SPAM_BAN_TRIGGER_COUNT, defaultProfile, moderationReasonPresets, uiCuePreviewOptions, uiSoundOptions } from "@/components/chat/chat-constants"
import { formatRemainingTime, formatTime, initials, moderationActionLabel } from "@/components/chat/chat-format"
import { cleanUsernameDisplayName, configuredAdminPassword, useCacheClearAction, writeAdminUnlocked } from "@/components/chat/chat-state"
import type { Panel } from "@/components/chat/chat-types"
import { ChatAvatar } from "@/components/chat/ChatAvatar"
import { exportModerationLog } from "@/components/chat/media-utils"

export function TopLeftDock({
  activePanel,
  adminStatus,
  adminUnlocked,
  authBusy,
  authError,
  authUser,
  blockedUsers,
  moderationLog,
  moderationSettings,
  moderationUsers,
  notificationIcon: NotificationIcon,
  notifications,
  permission,
  profile,
  remoteEnabled,
  roomSettings,
  trustedSites,
  unread,
  usernameBusy,
  usernameClaim,
  usernameDraft,
  usernameError,
  usernameReady,
  voiceChatOpen,
  voiceParticipantIds,
  onAvatarFile,
  onAdminUnlockedChange,
  onBlockUserToggle,
  onBrowserToggle,
  onNotificationSettingsChange,
  onClearUserModeration,
  onClose,
  onModerationSettingsChange,
  onModerateUser,
  onPanelChange,
  onProfileChange,
  onRemoveTrustedSite,
  onRoomSettingsChange,
  onUsernameClaim,
  onUsernameDraftChange,
  onSoundKindToggle,
  onSoundToggle,
  onUiSoundKindChange,
  onUiCuePreview,
  onUiSoundPreview,
  onUiSoundToggle,
  onGoogleSignIn,
  onGoogleSignOut,
  onVoiceToggle,
  onWarnUser,
}: {
  activePanel: Panel
  adminStatus: string | null
  adminUnlocked: boolean
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  blockedUsers: ModerationUser[]
  moderationLog: SpamModerationLogEntry[]
  moderationSettings: ModerationSettings
  moderationUsers: ModerationUser[]
  notificationIcon: typeof Bell
  notifications: NotificationSettings
  permission: string
  profile: Profile
  remoteEnabled: boolean
  roomSettings: RoomSettings
  trustedSites: string[]
  unread: number
  usernameBusy: boolean
  usernameClaim: UsernameClaim | null
  usernameDraft: string
  usernameError: string | null
  usernameReady: boolean
  voiceChatOpen: boolean
  voiceParticipantIds: Set<string>
  onAvatarFile: (file: File | undefined) => void
  onAdminUnlockedChange: (unlocked: boolean) => void
  onBlockUserToggle: (user: { id: string; name: string }) => void
  onBrowserToggle: (enabled: boolean) => void
  onNotificationSettingsChange: (
    settings:
      | NotificationSettings
      | ((current: NotificationSettings) => NotificationSettings)
  ) => void
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onClose: () => void
  onModerationSettingsChange: (
    settings:
      | ModerationSettings
      | ((current: ModerationSettings) => ModerationSettings)
  ) => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"],
    reason?: string
  ) => void | Promise<void>
  onPanelChange: (panel: Exclude<Panel, null>) => void
  onProfileChange: (profile: Profile) => void
  onRemoveTrustedSite: (site: string) => void
  onRoomSettingsChange: (settings: RoomSettings | ((current: RoomSettings) => RoomSettings)) => void
  onUsernameClaim: (name?: string) => Promise<boolean>
  onUsernameDraftChange: (value: string) => void
  onSoundKindToggle: (kind: SoundKind, enabled: boolean) => void
  onSoundToggle: (enabled: boolean) => void
  onUiSoundKindChange: (kind: UiSoundKind) => void
  onUiCuePreview: (kind: UiSoundKind) => void
  onUiSoundPreview: () => void
  onUiSoundToggle: (enabled: boolean) => void
  onGoogleSignIn: () => void | Promise<void>
  onGoogleSignOut: () => void | Promise<void>
  onVoiceToggle: () => void
  onWarnUser: (user: ModerationUser, reason?: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [roomFrameOpen, setRoomFrameOpen] = useState(false)
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false)
  const [adminPasswordDraft, setAdminPasswordDraft] = useState("")
  const [adminError, setAdminError] = useState<string | null>(null)
  const { cacheClearing, cacheStatus, clearBrowserCache } = useCacheClearAction()
  const adminPassword = configuredAdminPassword()

  function openPanel(panel: Exclude<Panel, null>) {
    setMenuOpen(false)
    setAdminOpen(false)
    setRoomFrameOpen(false)
    setNotificationSettingsOpen(false)
    onPanelChange(panel)
  }

  function toggleRoomFrame() {
    setMenuOpen(false)
    setAdminOpen(false)
    setNotificationSettingsOpen(false)
    onClose()
    setRoomFrameOpen((current) => !current)
    setAdminError(null)
  }

  function toggleAdminPanel() {
    setMenuOpen(false)
    setRoomFrameOpen(false)
    setNotificationSettingsOpen(false)
    onClose()
    setAdminOpen((current) => !current)
  }

  function toggleVoiceChat() {
    setMenuOpen(false)
    setAdminOpen(false)
    setRoomFrameOpen(false)
    setNotificationSettingsOpen(false)
    onClose()
    onVoiceToggle()
  }

  function unlockAdmin() {
    if (!adminPassword) {
      setAdminError("WEB_PASSWORD is not configured.")
      return
    }

    if (adminPasswordDraft === adminPassword) {
      onAdminUnlockedChange(true)
      writeAdminUnlocked(true)
      setAdminPasswordDraft("")
      setAdminError(null)
      setAdminOpen(true)
      setRoomFrameOpen(false)
      return
    }

    setAdminError("Wrong password.")
  }

  function lockAdmin() {
    onAdminUnlockedChange(false)
    writeAdminUnlocked(false)
    setAdminPasswordDraft("")
    setAdminError(null)
    setAdminOpen(false)
    setRoomFrameOpen(false)
  }

  const enabledSoundKinds = Object.values(notifications.soundKinds).filter(Boolean)
    .length
  const notificationStatus = notifications.soundsEnabled
    ? `${enabledSoundKinds}/3 sounds on`
    : "Muted"

  return (
    <div className="top-chrome">
      <div className="room-dock">
        <button
          aria-expanded={roomFrameOpen}
          aria-label="Open room overview"
          className={cn("room-info-pill", roomFrameOpen && "active")}
          data-tooltip="Room overview"
          type="button"
          onClick={toggleRoomFrame}
        >
          <strong>Main Chat</strong>
        </button>

        <AnimatePresence>
          {roomFrameOpen ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="admin-panel room-frame-panel"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="room-frame-card">
                <div className="room-frame-title">
                  <GlobeSimple weight="duotone" />
                  <div>
                    <strong>{roomSettings.topic || "Main Chat"}</strong>
                    <span>Single room mode · {roomSettings.role}</span>
                  </div>
                </div>
                <div className="room-frame-grid" aria-label="Room status">
                  <span>
                    <strong>{moderationUsers.length}</strong>
                    <small>People seen</small>
                  </span>
                  <span>
                    <strong>{unread}</strong>
                    <small>Unread</small>
                  </span>
                  <span>
                    <strong>{voiceParticipantIds.size}</strong>
                    <small>In voice</small>
                  </span>
                  <span>
                    <strong>{remoteEnabled ? "Live" : "Local"}</strong>
                    <small>Firebase</small>
                  </span>
                </div>
                <div className="room-future-rail" aria-label="Future room frame">
                  <button className="active" type="button">
                    Main Chat
                  </button>
                  <button disabled type="button">
                    Future rooms
                  </button>
                  <button disabled type="button">
                    Invite links
                  </button>
                </div>
                <p>
                  Room editing, announcements, and moderation now live in the admin modal.
                </p>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={toggleAdminPanel}
                >
                  <ShieldCheck data-icon="inline-start" weight="duotone" />
                  {adminUnlocked ? "Open admin" : "Unlock admin"}
                </Button>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="dock">
        <div className="dock-buttons" aria-label="Chat controls">
          {adminUnlocked ? (
            <Button
              aria-expanded={adminOpen}
              aria-label="Admin panel"
              className={cn("dock-button", adminOpen && "active")}
              data-tooltip="Admin panel"
              size="icon"
              type="button"
              variant="ghost"
              onClick={toggleAdminPanel}
            >
              <span className="icon-motion">
                <ShieldCheck data-icon="inline-start" weight="duotone" />
              </span>
            </Button>
          ) : null}
          <Button
            aria-expanded={voiceChatOpen}
            aria-label={voiceChatOpen ? "Close voice chat" : "Open voice chat"}
            className={cn("dock-button", voiceChatOpen && "active")}
            data-tooltip={voiceChatOpen ? "Close voice chat" : "Voice chat"}
            size="icon"
            type="button"
            variant="ghost"
            onClick={toggleVoiceChat}
          >
            <span className="icon-motion">
              {voiceChatOpen ? (
                <PhoneDisconnect data-icon="inline-start" weight="duotone" />
              ) : (
                <PhoneCall data-icon="inline-start" weight="duotone" />
              )}
            </span>
          </Button>
          <Button
            aria-label="Notifications"
            className={cn("dock-button", activePanel === "notifications" && "active")}
            data-tooltip="Notifications"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => openPanel("notifications")}
          >
            <span className="icon-motion">
              <NotificationIcon data-icon="inline-start" weight="duotone" />
            </span>
            {unread > 0 ? <span className="unread-badge">{Math.min(unread, 9)}</span> : null}
          </Button>
          <Button
            aria-expanded={menuOpen}
            aria-label="More options"
            className={cn("dock-button", menuOpen && "active")}
            data-tooltip="More options"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              setMenuOpen((current) => !current)
              setAdminOpen(false)
              setRoomFrameOpen(false)
              setNotificationSettingsOpen(false)
              if (activePanel) onClose()
            }}
          >
            <span className="icon-motion">
              <DotsThreeVertical data-icon="inline-start" weight="bold" />
            </span>
          </Button>
        </div>

        <Modal
          ariaLabel={adminUnlocked ? "Admin panel" : "Admin unlock"}
          className="admin-modal"
          isOpen={adminOpen}
          onClose={() => setAdminOpen(false)}
        >
          {adminUnlocked ? (
              <AdminPanel
                adminStatus={adminStatus}
                moderationLog={moderationLog}
                moderationSettings={moderationSettings}
                moderationUsers={moderationUsers}
                remoteEnabled={remoteEnabled}
                roomSettings={roomSettings}
                unread={unread}
                voiceParticipantIds={voiceParticipantIds}
                onClose={() => setAdminOpen(false)}
                onClearUserModeration={onClearUserModeration}
                onExportModerationLog={exportModerationLog}
                onLock={lockAdmin}
                onModerationSettingsChange={onModerationSettingsChange}
                onModerateUser={onModerateUser}
                onRoomSettingsChange={onRoomSettingsChange}
                onWarnUser={onWarnUser}
              />
          ) : (
            <AdminGatePanel
              adminError={adminError}
              isConfigured={adminPassword.length > 0}
              isUnlocked={adminUnlocked}
              passwordDraft={adminPasswordDraft}
              onClose={() => setAdminOpen(false)}
              onLock={lockAdmin}
              onOpenAdmin={() => setAdminOpen(true)}
              onPasswordDraftChange={(value) => {
                setAdminPasswordDraft(value)
                setAdminError(null)
              }}
              onUnlock={unlockAdmin}
            />
          )}
        </Modal>

        <Modal
          ariaLabel="Notification settings"
          className="notification-settings-modal"
          isOpen={notificationSettingsOpen}
          onClose={() => setNotificationSettingsOpen(false)}
        >
          <div className="notification-settings-modal-inner">
            <div className="panel-head">
              <div className="panel-title-with-icon panel-title-copy">
                <BellRinging weight="duotone" />
                <div>
                  <strong>Notification settings</strong>
                  <span>Alerts, previews, and app cues</span>
                </div>
              </div>
              <Button
                aria-label="Close notification settings"
                data-tooltip="Close"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => setNotificationSettingsOpen(false)}
              >
                <X data-icon="inline-start" />
              </Button>
            </div>
            <NotificationsPanel
              notifications={notifications}
              permission={permission}
              onBrowserToggle={onBrowserToggle}
              onNotificationSettingsChange={onNotificationSettingsChange}
              onSoundKindToggle={onSoundKindToggle}
              onSoundToggle={onSoundToggle}
              onUiSoundKindChange={onUiSoundKindChange}
              onUiCuePreview={onUiCuePreview}
              onUiSoundPreview={onUiSoundPreview}
              onUiSoundToggle={onUiSoundToggle}
            />
          </div>
        </Modal>

        <AnimatePresence>
          {menuOpen ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="header-menu"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="quick-menu-head">
                <ChatAvatar name={profile.name} src={profile.avatar} size="sm" />
                <div>
                  <strong>Main Chat</strong>
                  <span>Signed in as {profile.name}</span>
                </div>
              </div>

              <div className="quick-menu-grid">
                <button
                  className="quick-menu-card"
                  type="button"
                  onClick={() => openPanel("profile")}
                >
                  <PencilSimple weight="duotone" />
                  <span>Profile</span>
                  <small>Name and picture</small>
                </button>
                <button
                  className="quick-menu-card"
                  type="button"
                  onClick={() => openPanel("notifications")}
                >
                  <NotificationIcon weight="duotone" />
                  <span>Alerts</span>
                  <small>{notificationStatus}</small>
                </button>
              </div>

              <button
                className="quick-menu-row"
                type="button"
                onClick={() => openPanel("trusted")}
              >
                <ShieldCheck weight="duotone" />
                <span>Trusted sites</span>
                <small>{trustedSites.length}</small>
              </button>

              <button
                className="quick-menu-row"
                disabled={cacheClearing}
                type="button"
                onClick={() => void clearBrowserCache()}
              >
                <Broom weight="duotone" />
                <span>{cacheClearing ? "Clearing cache" : "Clear cache"}</span>
                <small>Reload</small>
              </button>

              {cacheStatus ? (
                <p className="quick-menu-status" role="status">
                  {cacheStatus}
                </p>
              ) : null}
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {activePanel ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "control-panel",
                activePanel === "profile" && "profile-control-panel",
                activePanel === "notifications" && "notifications-control-panel"
              )}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              >
              <div className="panel-head">
                <div className="panel-title-with-icon">
                  {activePanel === "profile" ? (
                    <PencilSimple weight="duotone" />
                  ) : activePanel === "trusted" ? (
                    <ShieldCheck weight="duotone" />
                  ) : (
                    <NotificationIcon weight="duotone" />
                  )}
                  <strong>
                    {activePanel === "profile"
                      ? "Your profile"
                      : activePanel === "trusted"
                        ? "Trusted sites"
                        : "Notifications"}
                  </strong>
                </div>
                <Button
                  aria-label="Close panel"
                  data-tooltip="Close panel"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                >
                  <X data-icon="inline-start" />
                </Button>
              </div>

              {activePanel === "profile" ? (
                <ProfilePanel
                  authBusy={authBusy}
                  authError={authError}
                  authUser={authUser}
                  blockedUsers={blockedUsers}
                  profile={profile}
                  usernameBusy={usernameBusy}
                  usernameClaim={usernameClaim}
                  usernameDraft={usernameDraft}
                  usernameError={usernameError}
                  usernameReady={usernameReady}
                  onAvatarFile={onAvatarFile}
                  onGoogleSignIn={onGoogleSignIn}
                  onGoogleSignOut={onGoogleSignOut}
                  onBlockUserToggle={onBlockUserToggle}
                  onProfileChange={onProfileChange}
                  onUsernameClaim={onUsernameClaim}
                  onUsernameDraftChange={onUsernameDraftChange}
                />
              ) : activePanel === "trusted" ? (
                <TrustedSitesPanel
                  trustedSites={trustedSites}
                  onRemoveTrustedSite={onRemoveTrustedSite}
                />
              ) : (
                <NotificationsPanel
                  compact
                  notifications={notifications}
                  permission={permission}
                  onOpenFullSettings={() => setNotificationSettingsOpen(true)}
                  onBrowserToggle={onBrowserToggle}
                  onNotificationSettingsChange={onNotificationSettingsChange}
                  onSoundKindToggle={onSoundKindToggle}
                  onSoundToggle={onSoundToggle}
                  onUiSoundKindChange={onUiSoundKindChange}
                  onUiCuePreview={onUiCuePreview}
                  onUiSoundPreview={onUiSoundPreview}
                  onUiSoundToggle={onUiSoundToggle}
                />
              )}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function AdminGatePanel({
  adminError,
  isConfigured,
  isUnlocked,
  passwordDraft,
  onClose,
  onLock,
  onOpenAdmin,
  onPasswordDraftChange,
  onUnlock,
}: {
  adminError: string | null
  isConfigured: boolean
  isUnlocked: boolean
  passwordDraft: string
  onClose: () => void
  onLock: () => void
  onOpenAdmin: () => void
  onPasswordDraftChange: (value: string) => void
  onUnlock: () => void
}) {
  function submitAdminUnlock(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    onUnlock()
  }

  return (
    <div className="admin-panel-inner">
      <div className="panel-head">
        <div className="panel-title-with-icon admin-panel-title panel-title-copy">
          <LockKey weight="duotone" />
          <div>
            <strong>{isUnlocked ? "Admin unlocked" : "Admin unlock"}</strong>
            <span>{isUnlocked ? "Session is ready" : "Session-only access"}</span>
          </div>
        </div>
        <Button
          aria-label="Close unlock"
          data-tooltip="Close"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      {!isConfigured ? (
        <div className="admin-panel-copy">
          <strong>WEB_PASSWORD is missing.</strong>
          <span>Add it in Vercel or your local env, then rebuild the app.</span>
        </div>
      ) : isUnlocked ? (
        <>
          <div className="admin-panel-copy">
            <strong>Admin is unlocked.</strong>
            <span>Use the shield button beside notifications to open the admin panel.</span>
          </div>
          <div className="admin-panel-actions">
            <Button size="sm" type="button" variant="default" onClick={onOpenAdmin}>
              <ShieldCheck data-icon="inline-start" weight="duotone" />
              Open
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={onLock}>
              <LockKey data-icon="inline-start" weight="duotone" />
              Lock
            </Button>
          </div>
        </>
      ) : (
        <form className="admin-panel-form" onSubmit={submitAdminUnlock}>
          <div className="admin-panel-copy">
            <strong>Enter admin password.</strong>
            <span>Moderation tools stay locked until this session is unlocked.</span>
          </div>
          <Input
            autoComplete="current-password"
            autoFocus
            aria-label="Admin password"
            placeholder="Password"
            type="password"
            value={passwordDraft}
            onChange={(event) => onPasswordDraftChange(event.target.value)}
          />
          {adminError ? <p className="admin-panel-error">{adminError}</p> : null}
          <Button size="sm" type="submit" variant="default">
            Unlock
          </Button>
        </form>
      )}
    </div>
  )
}

export function AdminPanel({
  adminStatus,
  moderationLog,
  moderationSettings,
  moderationUsers,
  remoteEnabled,
  roomSettings,
  unread,
  voiceParticipantIds,
  onClose,
  onClearUserModeration,
  onExportModerationLog,
  onLock,
  onModerationSettingsChange,
  onModerateUser,
  onRoomSettingsChange,
  onWarnUser,
}: {
  adminStatus: string | null
  moderationLog: SpamModerationLogEntry[]
  moderationSettings: ModerationSettings
  moderationUsers: ModerationUser[]
  remoteEnabled: boolean
  roomSettings: RoomSettings
  unread: number
  voiceParticipantIds: Set<string>
  onClose: () => void
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onExportModerationLog: (
    log: SpamModerationLogEntry[],
    format: "csv" | "json"
  ) => void
  onLock: () => void
  onModerationSettingsChange: (
    settings:
      | ModerationSettings
      | ((current: ModerationSettings) => ModerationSettings)
  ) => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"],
    reason?: string
  ) => void | Promise<void>
  onRoomSettingsChange: (settings: RoomSettings | ((current: RoomSettings) => RoomSettings)) => void
  onWarnUser: (user: ModerationUser, reason?: string) => void
}) {
  const [peopleExpanded, setPeopleExpanded] = useState(true)
  const [logExpanded, setLogExpanded] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(false)

  return (
    <div className="admin-panel-inner">
      <div className="panel-head">
        <div className="panel-title-with-icon admin-panel-title panel-title-copy">
          <ShieldCheck weight="duotone" />
          <div>
            <strong>Admin panel</strong>
            <span>Room, safety, and people</span>
          </div>
        </div>
        <Button
          aria-label="Close admin panel"
          data-tooltip="Close"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      <div className="admin-summary-grid" aria-label="Admin status summary">
        <span>
          <strong>{moderationLog.length}</strong>
          <small>Actions</small>
        </span>
        <span>
          <strong>{moderationUsers.length}</strong>
          <small>People</small>
        </span>
        <span>
          <strong>{voiceParticipantIds.size}</strong>
          <small>Voice</small>
        </span>
        <span>
          <strong>{remoteEnabled ? "Live" : "Local"}</strong>
          <small>Sync</small>
        </span>
      </div>

      {adminStatus ? <p className="admin-panel-status">{adminStatus}</p> : null}

      <div className="admin-modal-layout">
        <div className="admin-modal-column">
          <RoomSettingsAdminPanel
            moderationUsers={moderationUsers}
            remoteEnabled={remoteEnabled}
            roomSettings={roomSettings}
            unread={unread}
            voiceParticipantIds={voiceParticipantIds}
            onRoomSettingsChange={onRoomSettingsChange}
          />

          <ModerationSettingsPanel
            expanded={settingsExpanded}
            settings={moderationSettings}
            onSettingsChange={onModerationSettingsChange}
            onToggleExpanded={() => setSettingsExpanded((current) => !current)}
          />
        </div>

        <div className="admin-modal-column">
          <AdminUserModeration
            expanded={peopleExpanded}
            moderationReason={moderationSettings.reasonPreset}
            users={moderationUsers}
            voiceParticipantIds={voiceParticipantIds}
            onClearUserModeration={onClearUserModeration}
            onToggleExpanded={() => setPeopleExpanded((current) => !current)}
            onModerateUser={onModerateUser}
            onWarnUser={onWarnUser}
          />

          <ModerationLogView
            expanded={logExpanded}
            moderationLog={moderationLog}
            onExportModerationLog={onExportModerationLog}
            onToggleExpanded={() => setLogExpanded((current) => !current)}
          />
        </div>
      </div>

      <div className="admin-panel-actions admin-panel-footer">
        <Button size="sm" type="button" variant="outline" onClick={onLock}>
          <LockKey data-icon="inline-start" weight="duotone" />
          Lock
        </Button>
      </div>
    </div>
  )
}

export function RoomSettingsAdminPanel({
  moderationUsers,
  remoteEnabled,
  roomSettings,
  unread,
  voiceParticipantIds,
  onRoomSettingsChange,
}: {
  moderationUsers: ModerationUser[]
  remoteEnabled: boolean
  roomSettings: RoomSettings
  unread: number
  voiceParticipantIds: Set<string>
  onRoomSettingsChange: (settings: RoomSettings | ((current: RoomSettings) => RoomSettings)) => void
}) {
  return (
    <section className="admin-room-settings">
      <div className="admin-room-head">
        <div className="room-frame-title">
          <GlobeSimple weight="duotone" />
          <div>
            <strong>{roomSettings.topic || "Main Chat"}</strong>
            <span>Single room frame · {roomSettings.role}</span>
          </div>
        </div>
        <span className="admin-room-meta">
          <Badge variant="outline">{remoteEnabled ? "Firebase live" : "Local only"}</Badge>
          <small>
            {moderationUsers.length} seen · {voiceParticipantIds.size} voice · {unread} unread
          </small>
        </span>
      </div>

      <div className="room-frame-fields">
        <label>
          <span>Topic</span>
          <Input
            value={roomSettings.topic}
            onChange={(event) => {
              const topic = event.currentTarget.value
              onRoomSettingsChange((current) => ({
                ...current,
                topic,
              }))
            }}
          />
        </label>
        <label>
          <span>Announcement</span>
          <Textarea
            rows={4}
            value={roomSettings.announcement}
            onChange={(event) => {
              const announcement = event.currentTarget.value
              onRoomSettingsChange((current) => ({
                ...current,
                announcement,
              }))
            }}
          />
        </label>
      </div>

      <div className="room-frame-switches">
        <label>
          <Switch
            checked={roomSettings.compactMode}
            onCheckedChange={(checked) =>
              onRoomSettingsChange((current) => ({
                ...current,
                compactMode: checked,
              }))
            }
          />
          <span>Compact mode</span>
        </label>
        <label>
          <Switch
            checked={roomSettings.reducedData}
            onCheckedChange={(checked) =>
              onRoomSettingsChange((current) => ({
                ...current,
                reducedData: checked,
              }))
            }
          />
          <span>Reduced data</span>
        </label>
        <label>
          <Switch
            checked={roomSettings.archived}
            onCheckedChange={(checked) =>
              onRoomSettingsChange((current) => ({
                ...current,
                archived: checked,
              }))
            }
          />
          <span>Archive frame</span>
        </label>
      </div>

      <div className="room-future-rail" aria-label="Future room frame">
        <button className="active" type="button">
          Main Chat
        </button>
        <button disabled type="button">
          Future rooms
        </button>
        <button disabled type="button">
          Invite links
        </button>
      </div>
      <p>
        Single-room mode: future rooms and invite links stay parked here.
      </p>
    </section>
  )
}

export function ModerationSettingsPanel({
  expanded,
  settings,
  onSettingsChange,
  onToggleExpanded,
}: {
  expanded: boolean
  settings: ModerationSettings
  onSettingsChange: (
    settings:
      | ModerationSettings
      | ((current: ModerationSettings) => ModerationSettings)
  ) => void
  onToggleExpanded: () => void
}) {
  return (
    <div className={cn("admin-user-panel", !expanded && "collapsed")}>
      <button
        aria-expanded={expanded}
        className="admin-section-toggle"
        type="button"
        onClick={onToggleExpanded}
      >
        <span className="setting-label">
          <ShieldCheck weight="duotone" />
          Safety settings
        </span>
        <span className="admin-section-meta">
          {settings.slowModeSeconds > 0 ? `${settings.slowModeSeconds}s slow` : "Live"}
          <CaretUp className={cn(!expanded && "collapsed")} weight="bold" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="admin-section-content moderation-settings-panel"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="reason-preset-grid">
              {moderationReasonPresets.map((reason) => (
                <button
                  aria-pressed={settings.reasonPreset === reason}
                  className={cn(settings.reasonPreset === reason && "active")}
                  key={reason}
                  type="button"
                  onClick={() =>
                    onSettingsChange((current) => ({
                      ...current,
                      reasonPreset: reason,
                    }))
                  }
                >
                  {reason}
                </button>
              ))}
            </div>
            <label className="admin-range-row">
              <span>Warning expires after {settings.warningExpiresMinutes}m</span>
              <input
                aria-label="Warning expiration minutes"
                max="60"
                min="1"
                type="range"
                value={settings.warningExpiresMinutes}
                onChange={(event) => {
                  const warningExpiresMinutes = Number(event.currentTarget.value)
                  onSettingsChange((current) => ({
                    ...current,
                    warningExpiresMinutes,
                  }))
                }}
              />
            </label>
            <label className="admin-range-row">
              <span>Slow mode {settings.slowModeSeconds}s</span>
              <input
                aria-label="Slow mode seconds"
                max="120"
                min="0"
                step="5"
                type="range"
                value={settings.slowModeSeconds}
                onChange={(event) => {
                  const slowModeSeconds = Number(event.currentTarget.value)
                  onSettingsChange((current) => ({
                    ...current,
                    slowModeSeconds,
                  }))
                }}
              />
            </label>
            <div className="word-filter-settings">
              <div className="ui-sound-options">
                {(["off", "warn", "block"] as const).map((mode) => (
                  <button
                    aria-pressed={settings.wordFilterMode === mode}
                    className={cn(settings.wordFilterMode === mode && "active")}
                    key={mode}
                    type="button"
                    onClick={() =>
                      onSettingsChange((current) => ({
                        ...current,
                        wordFilterMode: mode,
                      }))
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <Textarea
                aria-label="Word filter list"
                placeholder="one blocked word per line"
                rows={3}
                value={settings.wordFilterWords.join("\n")}
                onChange={(event) => {
                  const wordFilterWords = event.currentTarget.value
                    .split(/\n|,/)
                    .map((item) => item.trim().toLowerCase())
                    .filter(Boolean)

                  onSettingsChange((current) => ({
                    ...current,
                    wordFilterWords,
                  }))
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function AdminUserModeration({
  expanded,
  moderationReason,
  users,
  voiceParticipantIds,
  onClearUserModeration,
  onToggleExpanded,
  onModerateUser,
  onWarnUser,
}: {
  expanded: boolean
  moderationReason: string
  users: ModerationUser[]
  voiceParticipantIds: Set<string>
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onToggleExpanded: () => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"],
    reason?: string
  ) => void | Promise<void>
  onWarnUser: (user: ModerationUser, reason?: string) => void
}) {
  const [pendingModeration, setPendingModeration] = useState<{
    action: Extract<UserModerationState["action"], "ban" | "timeout">
    userId: string
  } | null>(null)

  return (
    <div className={cn("admin-user-panel", !expanded && "collapsed")}>
      <button
        aria-expanded={expanded}
        className="admin-section-toggle"
        type="button"
        onClick={onToggleExpanded}
      >
        <span className="setting-label">
          <Prohibit weight="duotone" />
          People
        </span>
        <span className="admin-section-meta">
          {users.length}
          <CaretUp className={cn(!expanded && "collapsed")} weight="bold" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="admin-section-content"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {users.length > 0 ? (
              <div className="admin-user-list">
                {users.slice(0, 10).map((user) => {
                  const restriction = user.moderation
                  const restricted = Boolean(restriction)
                  const pendingAction =
                    pendingModeration?.userId === user.id
                      ? pendingModeration.action
                      : null
                  const restrictionLabel =
                    restriction?.action === "ban"
                      ? "Banned"
                      : restriction
                        ? `Muted · ${formatRemainingTime(
                            restriction.bannedUntil - Date.now()
                          )}`
                        : ""

                  return (
                    <div
                      className={cn(
                        "admin-user-row",
                        restriction?.action === "ban" && "is-banned",
                        restriction?.action === "timeout" && "is-muted"
                      )}
                      key={user.id}
                    >
                      <ChatAvatar name={user.name} size="sm" src={user.avatar} />
                      <span className="admin-user-main">
                        <span className="admin-user-name-line">
                          <strong>{user.isSelf ? `${user.name} (you)` : user.name}</strong>
                          {restriction ? (
                            <span
                              className={cn(
                                "admin-user-status",
                                restriction.action === "ban" ? "banned" : "muted"
                              )}
                            >
                              {restriction.action === "ban" ? (
                                <Prohibit weight="bold" />
                              ) : (
                                <Clock weight="bold" />
                              )}
                              {restrictionLabel}
                            </span>
                          ) : null}
                        </span>
                        <small>
                          {user.messageCount} message{user.messageCount === 1 ? "" : "s"} ·{" "}
                          {formatTime(user.lastSeenAt)}
                          {voiceParticipantIds.has(user.id) ? " · in voice" : ""}
                        </small>
                      </span>
                      <div className="admin-user-actions">
                        {restricted ? (
                          <Button
                            aria-label={`Clear restrictions for ${user.name}`}
                            className="admin-user-clear-button"
                            data-tooltip="Clear timeout or ban"
                            disabled={user.isSelf}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                            onClick={() => void onClearUserModeration(user)}
                          >
                            <ShieldCheck data-icon="inline-start" weight="duotone" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              aria-label={`Warn ${user.name}`}
                              data-tooltip="Warn"
                              disabled={user.isSelf}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                              onClick={() => onWarnUser(user, moderationReason)}
                            >
                              <BellRinging data-icon="inline-start" weight="duotone" />
                            </Button>
                            {pendingAction ? (
                              <span className="admin-user-confirm-actions" role="group" aria-label={`Confirm ${pendingAction === "ban" ? "ban" : "mute"} for ${user.name}`}>
                                <Button
                                  disabled={user.isSelf}
                                  size="xs"
                                  type="button"
                                  variant={pendingAction === "ban" ? "destructive" : "outline"}
                                  onClick={() => {
                                    void onModerateUser(user, pendingAction, moderationReason)
                                    setPendingModeration(null)
                                  }}
                                >
                                  {pendingAction === "ban" ? "Ban" : "Mute"}
                                </Button>
                                <Button
                                  aria-label="Cancel moderation action"
                                  data-tooltip="Cancel"
                                  size="icon-xs"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setPendingModeration(null)}
                                >
                                  <X data-icon="inline-start" />
                                </Button>
                              </span>
                            ) : (
                              <>
                                <Button
                                  aria-label={`Mute ${user.name} for 15 minutes`}
                                  data-tooltip="Mute for 15 minutes"
                                  disabled={user.isSelf}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    setPendingModeration({ action: "timeout", userId: user.id })
                                  }
                                >
                                  <Clock data-icon="inline-start" weight="duotone" />
                                </Button>
                                <Button
                                  aria-label={`Ban ${user.name}`}
                                  data-tooltip="Ban"
                                  disabled={user.isSelf}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    setPendingModeration({ action: "ban", userId: user.id })
                                  }
                                >
                                  <Prohibit data-icon="inline-start" weight="duotone" />
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="moderation-empty">No people to moderate yet.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function ModerationLogView({
  expanded,
  moderationLog,
  onExportModerationLog,
  onToggleExpanded,
}: {
  expanded: boolean
  moderationLog: SpamModerationLogEntry[]
  onExportModerationLog: (
    log: SpamModerationLogEntry[],
    format: "csv" | "json"
  ) => void
  onToggleExpanded: () => void
}) {
  return (
    <div className={cn("moderation-log-panel", !expanded && "collapsed")}>
      <button
        aria-expanded={expanded}
        className="admin-section-toggle"
        type="button"
        onClick={onToggleExpanded}
      >
        <span className="setting-label">
          <ShieldCheck weight="duotone" />
          Moderation log
        </span>
        <span className="admin-section-meta">
          {moderationLog.length}
          <CaretUp className={cn(!expanded && "collapsed")} weight="bold" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="admin-section-content"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {moderationLog.length > 0 ? (
              <>
                <div className="moderation-export-actions">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onExportModerationLog(moderationLog, "json")}
                  >
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onExportModerationLog(moderationLog, "csv")}
                  >
                    CSV
                  </Button>
                </div>
                <div className="moderation-log-list">
                  {moderationLog.slice(0, 40).map((entry) => (
                    <div className="moderation-log-entry" key={entry.id}>
                      <strong>{moderationActionLabel(entry.action)}</strong>
                      <span>{entry.reason}</span>
                      <small>
                        {formatTime(entry.at)}
                        {entry.bannedUntil && entry.action === "warn"
                          ? ` · expires ${formatRemainingTime(entry.bannedUntil - Date.now())}`
                          : ""}
                        {entry.strikes > 0
                          ? ` - strike ${entry.strikes}/${SPAM_BAN_TRIGGER_COUNT}`
                          : ""}
                      </small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="moderation-empty">No spam actions yet.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function ProfilePanel({
  authBusy,
  authError,
  authUser,
  blockedUsers,
  profile,
  usernameBusy,
  usernameClaim,
  usernameDraft,
  usernameError,
  usernameReady,
  onAvatarFile,
  onBlockUserToggle,
  onGoogleSignIn,
  onGoogleSignOut,
  onProfileChange,
  onUsernameClaim,
  onUsernameDraftChange,
}: {
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  blockedUsers: ModerationUser[]
  profile: Profile
  usernameBusy: boolean
  usernameClaim: UsernameClaim | null
  usernameDraft: string
  usernameError: string | null
  usernameReady: boolean
  onAvatarFile: (file: File | undefined) => void
  onBlockUserToggle: (user: { id: string; name: string }) => void
  onGoogleSignIn: () => void | Promise<void>
  onGoogleSignOut: () => void | Promise<void>
  onProfileChange: (profile: Profile) => void
  onUsernameClaim: (name?: string) => Promise<boolean>
  onUsernameDraftChange: (value: string) => void
}) {
  const hasAvatar = profile.avatar.trim().length > 0
  const displayedInitials = initials(profile.name) || "Y"
  const usernameChanged =
    cleanUsernameDisplayName(usernameDraft) !== cleanUsernameDisplayName(profile.name)
  const googleConnected = Boolean(authUser && !authUser.isAnonymous)

  return (
    <div className="profile-form">
      <div className="profile-card profile-hero-card">
        <ChatAvatar name={profile.name} src={profile.avatar} size="lg" />
        <form
          className="field-stack profile-username-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onUsernameClaim(usernameDraft)
          }}
        >
          <label htmlFor="profile-name">Unique username</label>
          <div className="profile-username-row">
            <Input
              id="profile-name"
              maxLength={40}
              placeholder="Pick a username"
              value={usernameDraft}
              onChange={(event) => onUsernameDraftChange(event.target.value)}
            />
            <Button
              disabled={usernameBusy || (usernameReady && !usernameChanged)}
              size="sm"
              type="submit"
              variant="outline"
            >
              {usernameBusy ? "Saving" : "Save"}
            </Button>
          </div>
          <small className={cn("profile-username-status", usernameError && "error")}>
            {usernameError ??
              (usernameReady && usernameClaim
                ? `Reserved as @${usernameClaim.key}`
                : "Required before chatting.")}
          </small>
        </form>
      </div>

      <div className="profile-detail-grid profile-preference-grid">
        <label>
          <span>Custom status</span>
          <Input
            maxLength={80}
            placeholder="Available, busy, building..."
            value={profile.statusText ?? ""}
            onChange={(event) =>
              onProfileChange({ ...profile, statusText: event.target.value })
            }
          />
        </label>
        <label>
          <span>Accent color</span>
          <input
            aria-label="Profile accent color"
            type="color"
            value={profile.accentColor ?? defaultProfile.accentColor}
            onChange={(event) =>
              onProfileChange({ ...profile, accentColor: event.target.value })
            }
          />
        </label>
        <span className="profile-joined-at">
          Joined {formatTime(profile.joinedAt ?? Date.now())}
        </span>
      </div>

      <div className="auth-card profile-auth-card">
        <div>
          <span className="setting-label">
            <GlobeSimple weight="duotone" />
            Google account
          </span>
          <p>
            {googleConnected
              ? authUser?.email || authUser?.displayName || "Connected with Google."
              : "Login or sign up with Google."}
          </p>
          {authError ? <small className="auth-error">{authError}</small> : null}
        </div>
        <Button
          disabled={authBusy}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void (googleConnected ? onGoogleSignOut() : onGoogleSignIn())}
        >
          {authBusy ? "Working" : googleConnected ? "Sign out" : "Google"}
        </Button>
      </div>

      <div className="profile-blocked-panel">
        <div className="profile-blocked-head">
          <span className="setting-label">
            <Prohibit weight="duotone" />
            Blocked users
          </span>
          <small>{blockedUsers.length}</small>
        </div>
        {blockedUsers.length > 0 ? (
          <div className="profile-blocked-list">
            {blockedUsers.map((user) => (
              <div className="profile-blocked-row" key={user.id}>
                <ChatAvatar name={user.name} size="sm" src={user.avatar} />
                <span>
                  <strong>{user.name}</strong>
                  <small>Messages hidden</small>
                </span>
                <Button
                  size="xs"
                  type="button"
                  variant="ghost"
                  onClick={() => onBlockUserToggle(user)}
                >
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <small className="profile-blocked-empty">No blocked users.</small>
        )}
      </div>

      {hasAvatar ? (
        <div className="profile-avatar-state has-photo">
          <span className="profile-photo-thumb">
            <img alt="Current profile picture" src={profile.avatar} />
          </span>
          <div>
            <strong>Profile photo set</strong>
            <span>Upload a new one or remove it.</span>
          </div>
          <button
            aria-label="Remove profile picture"
            className="profile-avatar-remove"
            data-tooltip="Remove profile picture"
            type="button"
            onClick={() => onProfileChange({ ...profile, avatar: "" })}
          >
            <X data-icon="inline-start" />
          </button>
        </div>
      ) : (
        <>
          <div className="profile-avatar-state">
            <span className="profile-initials-chip">{displayedInitials}</span>
            <div>
              <strong>Using initials</strong>
              <span>No photo is set yet.</span>
            </div>
          </div>

          <div className="field-stack">
            <label htmlFor="profile-avatar">Profile picture URL</label>
            <Input
              id="profile-avatar"
              placeholder="Paste image URL or leave empty"
              value={profile.avatar}
              onChange={(event) =>
                onProfileChange({
                  ...profile,
                  avatar: event.target.value,
                })
              }
            />
          </div>
        </>
      )}

      <div className="profile-actions">
        <label className="file-button" htmlFor="avatar-file">
          <Camera weight="duotone" />
          Upload picture
        </label>
        <input
          hidden
          accept="image/*"
          id="avatar-file"
          type="file"
          onChange={(event) => onAvatarFile(event.target.files?.[0])}
        />
      </div>
    </div>
  )
}

export function NotificationsPanel({
  compact = false,
  notifications,
  permission,
  onOpenFullSettings,
  onBrowserToggle,
  onNotificationSettingsChange,
  onSoundKindToggle,
  onSoundToggle,
  onUiSoundKindChange,
  onUiCuePreview,
  onUiSoundPreview,
  onUiSoundToggle,
}: {
  compact?: boolean
  notifications: NotificationSettings
  permission: string
  onOpenFullSettings?: () => void
  onBrowserToggle: (enabled: boolean) => void
  onNotificationSettingsChange: (
    settings:
      | NotificationSettings
      | ((current: NotificationSettings) => NotificationSettings)
  ) => void
  onSoundKindToggle: (kind: SoundKind, enabled: boolean) => void
  onSoundToggle: (enabled: boolean) => void
  onUiSoundKindChange: (kind: UiSoundKind) => void
  onUiCuePreview: (kind: UiSoundKind) => void
  onUiSoundPreview: () => void
  onUiSoundToggle: (enabled: boolean) => void
}) {
  const reduceMotion = useReducedMotion()
  const showAlertCategories =
    notifications.soundsEnabled || notifications.browserEnabled
  const enabledSoundKindCount = Object.values(notifications.soundKinds).filter(Boolean).length
  const previewCount = [
    notifications.attachmentPreviews ?? true,
    notifications.voicePreviews ?? true,
    notifications.mentionSummary ?? true,
  ].filter(Boolean).length
  const browserStatus = notifications.browserEnabled
    ? permission === "granted"
      ? "On"
      : "Pending"
    : "Off"
  const permissionText =
    permission === "granted"
      ? "Permission granted."
      : permission === "denied"
        ? "Blocked in browser settings."
        : permission === "unsupported"
          ? "This browser does not expose notifications."
          : "Permission needed."

  return (
    <div className={cn("settings-stack", compact && "settings-stack-compact", !compact && "notification-settings-stack")}>
      {!compact ? (
        <div className="notification-summary-grid" aria-label="Notification summary">
          <span>
            <strong>{(notifications.roomEnabled ?? true) ? "On" : "Off"}</strong>
            <small>Room</small>
          </span>
          <span>
            <strong>{browserStatus}</strong>
            <small>Browser</small>
          </span>
          <span>
            <strong>{notifications.soundsEnabled ? `${enabledSoundKindCount}/3` : "Off"}</strong>
            <small>Alerts</small>
          </span>
          <span>
            <strong>{previewCount}/3</strong>
            <small>Previews</small>
          </span>
        </div>
      ) : null}

      <div className="notification-settings-section notification-routing-section">
        <div className="settings-row">
          <div>
            <span className="setting-label">
              <GlobeSimple weight="duotone" />
              Main Chat notifications
            </span>
            <p>Per-room switch for this single-room frame.</p>
          </div>
          <Switch
            aria-label="Toggle Main Chat notifications"
            checked={notifications.roomEnabled ?? true}
            onCheckedChange={(checked) =>
              onNotificationSettingsChange((current) => ({
                ...current,
                roomEnabled: checked,
              }))
            }
          />
        </div>

        <div className="settings-row">
          <div>
            <span className="setting-label">
              <Bell weight="duotone" />
              Browser notifications
            </span>
            <p>{permissionText} Uses the same categories below when this tab is not active.</p>
          </div>
          <Switch
            aria-label="Toggle browser notifications"
            checked={notifications.browserEnabled}
            disabled={permission === "denied" || permission === "unsupported"}
            onCheckedChange={onBrowserToggle}
          />
        </div>

        <div className="settings-row">
          <div>
            <span className="setting-label">
              {notifications.soundsEnabled ? (
                <SpeakerHigh weight="duotone" />
              ) : (
                <SpeakerSlash weight="duotone" />
              )}
              Notification sounds
            </span>
            <p>Master switch for all chat tones.</p>
          </div>
          <Switch
            aria-label="Toggle notification sounds"
            checked={notifications.soundsEnabled}
            onCheckedChange={onSoundToggle}
          />
        </div>

        <AnimatePresence initial={false}>
          {showAlertCategories ? (
            <motion.div
              animate={{ height: "auto", opacity: 1, x: 0 }}
              aria-label="Alert categories"
              className="sound-kind-list"
              exit={{
                borderWidth: 0,
                height: 0,
                opacity: 0,
                paddingBottom: 0,
                paddingTop: 0,
                x: -20,
              }}
              initial={
                reduceMotion
                  ? false
                  : {
                      borderWidth: 0,
                      height: 0,
                      opacity: 0,
                      paddingBottom: 0,
                      paddingTop: 0,
                      x: -20,
                    }
              }
              key="sound-kind-list"
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="sound-kind-head">
                <strong>Alert categories</strong>
                <span>Filters sound and Chrome popups</span>
              </div>
              <div className="sound-kind-row">
                <span className="setting-label">
                  <Bell weight="duotone" />
                  General chat
                </span>
                <Switch
                  aria-label="Toggle general chat sound"
                  checked={notifications.soundKinds.message}
                  onCheckedChange={(enabled) => onSoundKindToggle("message", enabled)}
                />
              </div>
              <div className="sound-kind-row">
                <span className="setting-label">
                  <ArrowBendUpLeft weight="duotone" />
                  Replies
                </span>
                <Switch
                  aria-label="Toggle reply sound"
                  checked={notifications.soundKinds.reply}
                  onCheckedChange={(enabled) => onSoundKindToggle("reply", enabled)}
                />
              </div>
              <div className="sound-kind-row">
                <span className="setting-label">
                  <At weight="duotone" />
                  Mentions
                </span>
                <Switch
                  aria-label="Toggle mention sound"
                  checked={notifications.soundKinds.ping}
                  onCheckedChange={(enabled) => onSoundKindToggle("ping", enabled)}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {compact ? (
        <>
          <Button
            className="notification-more-button"
            size="sm"
            type="button"
            variant="outline"
            onClick={onOpenFullSettings}
          >
            <BellRinging data-icon="inline-start" weight="duotone" />
            More settings
          </Button>
          <p className="status-copy compact-status-copy">
            Keywords, previews, button sounds, and tone previews are in the full
            notification modal.
          </p>
        </>
      ) : (
        <>
          <div className="notification-settings-section notification-keyword-section">
            <div className="settings-row stacked-setting-row">
              <div>
                <span className="setting-label">
                  <At weight="duotone" />
                  Keyword alerts
                </span>
                <p>Comma-separated words that should behave like mentions.</p>
              </div>
              <Input
                aria-label="Keyword alerts"
                placeholder="build, urgent, mailo"
                value={(notifications.keywordAlerts ?? []).join(", ")}
                onChange={(event) => {
                  const keywordAlerts = event.currentTarget.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 20)

                  onNotificationSettingsChange((current) => ({
                    ...current,
                    keywordAlerts,
                  }))
                }}
              />
            </div>
          </div>

          <div className="sound-kind-list notification-preview-list notification-settings-section">
            <div className="sound-kind-head">
              <strong>Notification previews</strong>
              <span>Attachment and voice details in Chrome notifications.</span>
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <Paperclip weight="duotone" />
                Attachment previews
              </span>
              <Switch
                aria-label="Toggle attachment notification previews"
                checked={notifications.attachmentPreviews ?? true}
                onCheckedChange={(checked) =>
                  onNotificationSettingsChange((current) => ({
                    ...current,
                    attachmentPreviews: checked,
                  }))
                }
              />
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <Microphone weight="duotone" />
                Voice previews
              </span>
              <Switch
                aria-label="Toggle voice notification previews"
                checked={notifications.voicePreviews ?? true}
                onCheckedChange={(checked) =>
                  onNotificationSettingsChange((current) => ({
                    ...current,
                    voicePreviews: checked,
                  }))
                }
              />
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <BellRinging weight="duotone" />
                Mention summary
              </span>
              <Switch
                aria-label="Toggle mention summary"
                checked={notifications.mentionSummary ?? true}
                onCheckedChange={(checked) =>
                  onNotificationSettingsChange((current) => ({
                    ...current,
                    mentionSummary: checked,
                  }))
                }
              />
            </div>
          </div>

          <div className="notification-settings-section notification-cue-section">
            <div className="settings-row">
              <div>
                <span className="setting-label">
                  {notifications.uiSoundsEnabled ? (
                    <SpeakerHigh weight="duotone" />
                  ) : (
                    <SpeakerSlash weight="duotone" />
                  )}
                  Button sounds
                </span>
                <p>Short confirmation cues for send, discard, and file actions.</p>
              </div>
              <Switch
                aria-label="Toggle button confirmation sounds"
                checked={notifications.uiSoundsEnabled}
                onCheckedChange={onUiSoundToggle}
              />
            </div>

            <AnimatePresence initial={false}>
              {notifications.uiSoundsEnabled ? (
                <motion.div
                  animate={{ height: "auto", opacity: 1, x: 0 }}
                  className="ui-sound-picker"
                  exit={{
                    borderWidth: 0,
                    height: 0,
                    opacity: 0,
                    paddingBottom: 0,
                    paddingTop: 0,
                    x: -20,
                  }}
                  initial={
                    reduceMotion
                      ? false
                      : {
                          borderWidth: 0,
                          height: 0,
                          opacity: 0,
                          paddingBottom: 0,
                          paddingTop: 0,
                          x: -20,
                        }
                  }
                  key="ui-sound-picker"
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="ui-sound-picker-head">
                    <div>
                      <span>Confirmation tone</span>
                      <small>General button feedback is louder now.</small>
                    </div>
                  </div>
                  <div className="ui-sound-options">
                    {uiSoundOptions.map((option) => (
                      <button
                        aria-pressed={notifications.uiSound === option.kind}
                        className={cn(
                          "ui-sound-option",
                          notifications.uiSound === option.kind && "active"
                        )}
                        key={option.kind}
                        type="button"
                        onClick={() => onUiSoundKindChange(option.kind)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="ui-cue-preview-row">
                    <Button size="sm" type="button" variant="ghost" onClick={onUiSoundPreview}>
                      <Play data-icon="inline-start" weight="fill" />
                      General
                    </Button>
                    {uiCuePreviewOptions.map((option) => (
                      <Button
                        key={option.kind}
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => onUiCuePreview(option.kind)}
                      >
                        <Play data-icon="inline-start" weight="fill" />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="status-copy notification-modal-note">
            Browser alerts only appear after permission is granted. Sound playback may
            start after your first click in this tab.
          </p>
        </>
      )}
    </div>
  )
}

export function TrustedSitesPanel({
  trustedSites,
  onRemoveTrustedSite,
}: {
  trustedSites: string[]
  onRemoveTrustedSite: (site: string) => void
}) {
  return (
    <div className="trusted-sites-panel">
      <div className="trusted-sites-list">
        {trustedSites.length > 0 ? (
          trustedSites.map((site) => (
            <Badge
              className="trusted-site-badge"
              data-tooltip={site}
              key={site}
              variant="outline"
            >
              <TrustedSiteIcon site={site} />
              <span className="trusted-site-url">{formatTrustedSiteLabel(site)}</span>
              <button
                aria-label={`Remove ${site}`}
                type="button"
                onClick={() => onRemoveTrustedSite(site)}
              >
                <X data-icon="inline-start" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="trusted-sites-empty">No trusted sites</span>
        )}
      </div>
    </div>
  )
}

export function TrustedSiteIcon({ site }: { site: string }) {
  const [failed, setFailed] = useState(false)
  const faviconUrl = useMemo(() => getTrustedSiteFaviconUrl(site), [site])

  useEffect(() => {
    setFailed(false)
  }, [faviconUrl])

  if (!faviconUrl || failed) {
    return (
      <span className="trusted-site-icon trusted-site-icon-fallback">
        <GlobeSimple weight="bold" />
      </span>
    )
  }

  return (
    <span className="trusted-site-icon">
      <img
        alt=""
        src={faviconUrl}
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function getTrustedSiteFaviconUrl(site: string) {
  try {
    const parsed = new URL(site)
    return `${parsed.origin}/favicon.ico`
  } catch {
    return null
  }
}

function formatTrustedSiteLabel(site: string) {
  try {
    const parsed = new URL(site)
    const hostname = parsed.hostname.replace(/^www\./i, "")
    return parsed.port ? `${hostname}:${parsed.port}` : hostname
  } catch {
    return site
  }
}
