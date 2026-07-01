import { cn } from "@/lib/utils"
import type { ChatMessage, MessageReaction } from "@/types"
import { ArrowSquareOut, At } from "@phosphor-icons/react"
import { MESSAGE_LINK_HASH_PREFIX } from "@/components/chat/chat-constants"
import type { MessageGroup, TenorGifPreview } from "@/components/chat/chat-types"

export function hasReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  authorId: string
) {
  return Boolean(
    reactions?.some(
      (reaction) => reaction.emoji === emoji && reaction.authorId === authorId
    )
  )
}

export function toggleReactionList(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  authorId: string,
  authorName: string,
  active: boolean
) {
  const current = reactions ?? []
  const withoutReaction = current.filter(
    (reaction) => !(reaction.emoji === emoji && reaction.authorId === authorId)
  )

  if (!active) return withoutReaction

  return [
    ...withoutReaction,
    {
      authorId,
      authorName,
      emoji,
    },
  ]
}

export function updateMessageReaction(
  messages: ChatMessage[],
  messageId: string,
  emoji: string,
  authorId: string,
  authorName: string,
  active: boolean
) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          reactions: toggleReactionList(
            message.reactions,
            emoji,
            authorId,
            authorName,
            active
          ),
        }
      : message
  )
}

export function summarizeReactions(reactions: MessageReaction[] | undefined) {
  const summary = new Map<string, { count: number; reactions: MessageReaction[] }>()
  reactions?.forEach((reaction) => {
    const current = summary.get(reaction.emoji) ?? {
      count: 0,
      reactions: [],
    }
    current.count += 1
    current.reactions.push(reaction)
    summary.set(reaction.emoji, current)
  })

  return Array.from(summary.entries()).map(([emoji, value]) => ({
    emoji,
    ...value,
  }))
}

export function messageElementId(messageId: string) {
  return `${MESSAGE_LINK_HASH_PREFIX}${messageId}`
}

export function messageIdFromHash(hash: string) {
  const cleanHash = hash.replace(/^#/, "")
  if (!cleanHash.startsWith(MESSAGE_LINK_HASH_PREFIX)) return null

  try {
    return decodeURIComponent(cleanHash.slice(MESSAGE_LINK_HASH_PREFIX.length))
  } catch {
    return null
  }
}

export function isVoiceChatHash(hash: string) {
  let cleanHash = hash.replace(/^#/, "").trim()
  if (!cleanHash) return false

  try {
    cleanHash = decodeURIComponent(cleanHash)
  } catch {
    return false
  }

  const target = cleanHash
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split(/[?&]/)[0]
    ?.replace(/_/g, "-")

  return Boolean(
    target &&
      [
        "voice",
        "voice-chat",
        "voicechat",
        "vc",
        "join-voice",
        "join-vc",
      ].includes(target)
  )
}

export function clearMessageLinkHash() {
  if (typeof window === "undefined") return
  if (!messageIdFromHash(window.location.hash)) return

  const url = new URL(window.location.href)
  url.hash = ""
  window.history.replaceState(window.history.state, "", url.toString())
}

export function messageLinkFor(messageId: string) {
  const hash = `${MESSAGE_LINK_HASH_PREFIX}${encodeURIComponent(messageId)}`
  if (typeof window === "undefined") return `#${hash}`

  const url = new URL(window.location.href)
  url.hash = hash
  return url.toString()
}

export function shouldIgnoreLongPress(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("button, input, textarea, select, [data-ignore-long-press]")
    )
  )
}

export function messagePreview(message: ChatMessage) {
  if (message.messageType === "audio") return "Voice message"
  if (message.body.trim()) return message.body

  const firstAttachment = message.attachments?.[0]
  if (!firstAttachment) return ""

  return firstAttachment.kind === "image" ? "Photo" : firstAttachment.name
}

export type MessageTranslationResult =
  | {
      status: "ready"
      text: string
    }
  | {
      message: string
      status: "unavailable" | "error"
    }

type BrowserTranslationAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"

type BrowserTranslationOptions = {
  sourceLanguage: string
  targetLanguage: string
}

type BrowserTranslator = {
  destroy?: () => void
  translate: (input: string) => Promise<string>
}

type BrowserTranslatorApi = {
  availability?: (
    options: BrowserTranslationOptions
  ) => Promise<BrowserTranslationAvailability>
  create: (options: BrowserTranslationOptions) => Promise<BrowserTranslator>
}

type BrowserLanguageDetectionResult = {
  confidence: number
  detectedLanguage: string
}

type BrowserLanguageDetector = {
  destroy?: () => void
  detect: (input: string) => Promise<BrowserLanguageDetectionResult[]>
}

type BrowserLanguageDetectorApi = {
  availability?: () => Promise<BrowserTranslationAvailability>
  create: () => Promise<BrowserLanguageDetector>
}

type BrowserTranslationScope = typeof globalThis & {
  LanguageDetector?: BrowserLanguageDetectorApi
  Translator?: BrowserTranslatorApi
}

const MESSAGE_TRANSLATION_TARGET_LANGUAGE = "en"

export function translateMessagePreview(body: string) {
  const dictionary: Array<[RegExp, string]> = [
    [/\bhallo\b/gi, "hello"],
    [/\bdanke\b/gi, "thanks"],
    [/\bbitte\b/gi, "please"],
    [/\bja\b/gi, "yes"],
    [/\bnein\b/gi, "no"],
    [/\bich\b/gi, "I"],
    [/\bdu\b/gi, "you"],
    [/\bkannst\b/gi, "can"],
    [/\bmachen\b/gi, "do"],
    [/\bfixe?\b/gi, "fix"],
    [/\bnachricht(en)?\b/gi, "message$1"],
    [/\bdatei(en)?\b/gi, "file$1"],
  ]

  const translated = dictionary.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    body
  )
  return translated === body ? null : translated
}

export async function resolveMessageTranslation(
  body: string
): Promise<MessageTranslationResult> {
  const text = body.trim()
  const offlineTranslation = translateMessagePreview(body)
  if (!text) {
    return {
      message: "No text to translate.",
      status: "unavailable",
    }
  }

  try {
    const sourceLanguage = browserTranslationSupported()
      ? await detectMessageLanguage(text)
      : null
    if (sourceLanguage) {
      if (samePrimaryLanguage(sourceLanguage, MESSAGE_TRANSLATION_TARGET_LANGUAGE)) {
        return {
          message: "Already in English.",
          status: "unavailable",
        }
      }

      const browserTranslation = await translateWithBrowser(
        text,
        sourceLanguage,
        MESSAGE_TRANSLATION_TARGET_LANGUAGE
      )
      if (browserTranslation) {
        return {
          status: "ready",
          text: browserTranslation,
        }
      }
    }
  } catch {
    return offlineTranslation
      ? {
          status: "ready",
          text: offlineTranslation,
        }
      : {
          message: "Could not translate this message.",
          status: "error",
      }
  }

  return offlineTranslation
    ? {
        status: "ready",
        text: offlineTranslation,
      }
    : {
        message: "Translation unavailable for this message.",
        status: "unavailable",
      }
}

function browserTranslationSupported() {
  return Boolean((globalThis as BrowserTranslationScope).Translator?.create)
}

async function translateWithBrowser(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
) {
  const translatorApi = (globalThis as BrowserTranslationScope).Translator
  if (!translatorApi?.create) return null

  const source = normalizedLanguageCode(sourceLanguage)
  const target = normalizedLanguageCode(targetLanguage)
  if (!source || !target || samePrimaryLanguage(source, target)) return null

  const availability = translatorApi.availability
    ? await translatorApi.availability({
        sourceLanguage: source,
        targetLanguage: target,
      })
    : "downloadable"
  if (availability === "unavailable") return null

  const translator = await translatorApi.create({
    sourceLanguage: source,
    targetLanguage: target,
  })
  try {
    const translated = (await translator.translate(text)).trim()
    return translated && translated !== text ? translated : null
  } finally {
    translator.destroy?.()
  }
}

async function detectMessageLanguage(text: string) {
  const offlineLanguage = detectMessageLanguageOffline(text)
  if (offlineLanguage) return offlineLanguage
  if (!shouldUseBrowserLanguageDetector(text)) return null

  const detectorApi = (globalThis as BrowserTranslationScope).LanguageDetector
  if (!detectorApi?.create) return null

  const availability = detectorApi.availability
    ? await detectorApi.availability()
    : "downloadable"
  if (availability === "unavailable") return null

  const detector = await detectorApi.create()
  try {
    const [bestMatch] = await detector.detect(text)
    if (!bestMatch || bestMatch.confidence < 0.45) return null
    return normalizedLanguageCode(bestMatch.detectedLanguage)
  } finally {
    detector.destroy?.()
  }
}

function detectMessageLanguageOffline(text: string) {
  if (/[äöüß]/i.test(text)) return "de"

  const normalized = text.toLowerCase()
  const languageHints: Array<[RegExp, string]> = [
    [/\b(der|die|das|und|nicht|ich|du|wir|bitte|danke|hallo|morgen|abend)\b/, "de"],
    [/\b(el|la|los|las|hola|gracias|por favor|que|estoy|eres|buenos)\b|[¿¡ñ]/, "es"],
    [/\b(le|la|les|bonjour|merci|s'il|vous|nous|avec|pourquoi)\b|[ç]/, "fr"],
    [/\b(il|lo|la|gli|ciao|grazie|per favore|sono|sei|buongiorno)\b/, "it"],
    [/\b(de|het|een|hallo|dank je|alsjeblieft|niet|voor|waarom)\b/, "nl"],
    [/\b(olá|obrigado|obrigada|por favor|você|não|bom dia)\b|[ãõ]/, "pt"],
  ]

  return languageHints.find(([pattern]) => pattern.test(normalized))?.[1] ?? null
}

function shouldUseBrowserLanguageDetector(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return text.trim().length >= 24 && words.length >= 4
}

function normalizedLanguageCode(language: string) {
  const cleanLanguage = language.trim()
  if (!cleanLanguage) return null
  return cleanLanguage.split("-").filter(Boolean).slice(0, 2).join("-").toLowerCase()
}

function samePrimaryLanguage(left: string, right: string) {
  return left.split("-")[0] === right.split("-")[0]
}

export function replyChainFor(messages: ChatMessage[], messageId: string) {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const chain: ChatMessage[] = []
  let current = byId.get(messageId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.replyToId ? byId.get(current.replyToId) : undefined
  }

  return chain
}

export function replyRootIdFor(messages: ChatMessage[], messageId: string) {
  return replyChainFor(messages, messageId)[0]?.id ?? messageId
}

export function groupMessages(messages: ChatMessage[]) {
  const groups: MessageGroup[] = []

  for (const message of messages) {
    const lastGroup = groups.at(-1)
    if (lastGroup && lastGroup.authorId === message.authorId) {
      lastGroup.messages.push(message)
      continue
    }

    groups.push({
      id: message.id,
      authorId: message.authorId,
      messages: [message],
    })
  }

  return groups
}

export function renderRichText(
  body: string,
  ownName: string,
  onExternalLink: (url: string, displayUrl: string) => void
) {
  const linkPattern = /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.)[^\s<)]+)\)|(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  body.replace(linkPattern, (...args) => {
    const match = args[0] as string
    const markdownLabel = args[1] as string | undefined
    const markdownUrl = args[2] as string | undefined
    const index = args.at(-2) as number

    if (index > lastIndex) {
      parts.push(...renderInlineRichText(body.slice(lastIndex, index), ownName, `t-${index}`))
    }

    const { displayUrl, trailing, url } = normalizeUrlToken(markdownUrl ?? match)
    if (url) {
      const label = markdownLabel ?? displayUrl
      parts.push(
        <button
          className="external-link"
          key={`url-${index}`}
          type="button"
          onClick={() => onExternalLink(url, label)}
        >
          {markdownLabel
            ? renderInlineRichText(markdownLabel, ownName, `url-label-${index}`)
            : displayUrl}
          <ArrowSquareOut weight="bold" />
        </button>
      )
    } else {
      parts.push(...renderInlineRichText(match, ownName, `u-${index}`))
    }

    if (trailing) {
      parts.push(trailing)
    }
    lastIndex = index + match.length
    return match
  })

  if (lastIndex < body.length) {
    parts.push(...renderInlineRichText(body.slice(lastIndex), ownName, "tail"))
  }

  return parts.length ? parts : body
}

export function getTenorGifPreviews(body: string) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const previews: TenorGifPreview[] = []
  const seen = new Set<string>()

  body.replace(urlPattern, (match) => {
    const { displayUrl, url } = normalizeUrlToken(match)
    const preview = url ? tenorGifPreviewFromUrl(url, displayUrl) : null
    if (preview && !seen.has(preview.id)) {
      seen.add(preview.id)
      previews.push(preview)
    }
    return match
  })

  return previews.slice(0, 4)
}

export function textWithoutTenorLinks(body: string) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi

  return body.replace(urlPattern, (match) => {
    const { trailing, url } = normalizeUrlToken(match)
    return url && tenorGifPreviewFromUrl(url, match) ? trailing : match
  })
}

export function tenorGifPreviewFromUrl(url: string, displayUrl: string) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (hostname !== "tenor.com") return null

    const segments = parsed.pathname.split("/").filter(Boolean)
    if (!segments.includes("view")) return null

    const lastSegment = segments.at(-1) ?? ""
    const idMatch =
      lastSegment.match(/(?:^|-)gif-(\d{6,})$/i) ??
      lastSegment.match(/(?:^|-)(\d{6,})$/)
    const id = idMatch?.[1]
    if (!id) return null

    return {
      displayUrl,
      embedUrl: `https://tenor.com/embed/${id}`,
      id,
      sourceUrl: parsed.toString(),
    }
  } catch {
    return null
  }
}

export function renderInlineRichText(text: string, ownName: string, keyPrefix: string) {
  const tokenPattern = /(?:`[^`\n]+`|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|@[A-Za-z0-9_][A-Za-z0-9_.-]{0,31})/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  text.replace(tokenPattern, (match, index: number) => {
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index))
    }

    const key = `${keyPrefix}-${index}`
    if (match.startsWith("`")) {
      nodes.push(<code key={key}>{match.slice(1, -1)}</code>)
    } else if (match.startsWith("**")) {
      nodes.push(<strong key={key}>{match.slice(2, -2)}</strong>)
    } else if (match.startsWith("*")) {
      nodes.push(<em key={key}>{match.slice(1, -1)}</em>)
    } else {
      const mentionName = match.slice(1)
      const isOwnMention =
        ownName.trim().length > 0 &&
        mentionName.toLowerCase() === ownName.trim().toLowerCase()
      nodes.push(
        <span className={cn("mention", isOwnMention && "own-mention")} key={key}>
          <At weight="bold" />
          {mentionName}
        </span>
      )
    }

    lastIndex = index + match.length
    return match
  })

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length ? nodes : [text]
}

export function normalizeUrlToken(token: string) {
  let rawUrl = token
  let trailing = ""

  while (/[.,!?;:)\]}]$/.test(rawUrl)) {
    trailing = `${rawUrl.at(-1)}${trailing}`
    rawUrl = rawUrl.slice(0, -1)
  }

  try {
    const withProtocol = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { displayUrl: token, trailing: "", url: null }
    }

    return {
      displayUrl: rawUrl,
      trailing,
      url: parsed.toString(),
    }
  } catch {
    return { displayUrl: token, trailing: "", url: null }
  }
}

export function originFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.origin
  } catch {
    return null
  }
}

export function openExternalLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}
