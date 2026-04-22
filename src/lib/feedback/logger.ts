/**
 * Client-side feedback logger.
 *
 * Mounted once at the top of the consultant layout, this module installs
 * global listeners that quietly fill ring buffers with recent console
 * output, uncaught errors, and failed network requests. When the user
 * submits the feedback modal we snapshot the buffers and attach them to
 * the email so we can reproduce whatever they were looking at.
 *
 * Everything is in-memory and capped — nothing is persisted.
 */

const MAX_CONSOLE = 200
const MAX_ERRORS = 40
const MAX_NETWORK = 60
const MAX_BODY_CHARS = 2000

type ConsoleEntry = {
  t: string            // ISO timestamp
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  text: string
}

type ErrorEntry = {
  t: string
  message: string
  stack?: string
  source?: 'error' | 'unhandledrejection'
}

type NetworkEntry = {
  t: string
  method: string
  url: string
  status: number
  ms: number
  body?: string        // only captured for non-2xx responses
}

interface FeedbackState {
  console: ConsoleEntry[]
  errors: ErrorEntry[]
  network: NetworkEntry[]
  installed: boolean
}

function push<T>(buf: T[], item: T, max: number) {
  buf.push(item)
  if (buf.length > max) buf.splice(0, buf.length - max)
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  try {
    return JSON.stringify(value, (_k, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack }
      return v
    })
  } catch {
    return String(value)
  }
}

// Strip obvious secrets from URLs (access_token in query, Supabase JWT-looking params).
function redactUrl(raw: string): string {
  try {
    const u = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    for (const key of Array.from(u.searchParams.keys())) {
      if (/token|apikey|key|secret/i.test(key)) u.searchParams.set(key, '[redacted]')
    }
    return u.toString()
  } catch {
    return raw
  }
}

declare global {
  interface Window {
    __elevationFeedback?: FeedbackState
  }
}

function getState(): FeedbackState {
  if (typeof window === 'undefined') {
    return { console: [], errors: [], network: [], installed: true }
  }
  if (!window.__elevationFeedback) {
    window.__elevationFeedback = { console: [], errors: [], network: [], installed: false }
  }
  return window.__elevationFeedback
}

export function installFeedbackLogger() {
  if (typeof window === 'undefined') return
  const state = getState()
  if (state.installed) return
  state.installed = true

  // ── Console patch ──
  const levels: Array<ConsoleEntry['level']> = ['log', 'info', 'warn', 'error', 'debug']
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        push(state.console, {
          t: new Date().toISOString(),
          level,
          text: args.map(safeStringify).join(' '),
        }, MAX_CONSOLE)
      } catch {
        // never let logging break the app
      }
      original(...args)
    }
  }

  // ── Global errors ──
  window.addEventListener('error', (e) => {
    push(state.errors, {
      t: new Date().toISOString(),
      message: e.message || 'Error',
      stack: e.error?.stack,
      source: 'error',
    }, MAX_ERRORS)
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    push(state.errors, {
      t: new Date().toISOString(),
      message: reason instanceof Error ? reason.message : safeStringify(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandledrejection',
    }, MAX_ERRORS)
  })

  // ── Fetch wrapping ──
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const start = performance.now()
    const [input, init] = args
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase()
    const urlRaw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = redactUrl(urlRaw)

    try {
      const res = await originalFetch(...args)
      const ms = Math.round(performance.now() - start)
      const entry: NetworkEntry = { t: new Date().toISOString(), method, url, status: res.status, ms }
      if (!res.ok) {
        try {
          const text = await res.clone().text()
          entry.body = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) + '…[truncated]' : text
        } catch {
          // ignore body read failures
        }
      }
      push(state.network, entry, MAX_NETWORK)
      return res
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      push(state.network, {
        t: new Date().toISOString(),
        method,
        url,
        status: 0,
        ms,
        body: err instanceof Error ? err.message : String(err),
      }, MAX_NETWORK)
      throw err
    }
  }
}

export function snapshotFeedback() {
  const state = getState()
  return {
    console: [...state.console],
    errors: [...state.errors],
    network: [...state.network],
  }
}

export type FeedbackSnapshot = ReturnType<typeof snapshotFeedback>
