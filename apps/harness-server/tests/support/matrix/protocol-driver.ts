import { randomUUID } from 'node:crypto'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { userTextMessage } from '@omne-harness/sdk'
import {
  createClient,
  createHttpProtocolTransport,
  type ClientOf,
  type Credentials,
} from '@omne-harness/sdk/core'
import { sessionProtocol, type ObserveSessionFrame } from '@omne-harness/session-protocol'

type SessionClient = ClientOf<typeof sessionProtocol>
type IdentityClient = ClientOf<typeof identityProtocol>
type SendBody = Parameters<SessionClient['send-input']>[0]
type Tenant = SendBody['tenant']
type Session = SendBody['session']

export type Account = Readonly<{ loginIdentifier: string; credential: string }>

export type HistoryEntry = Readonly<{
  entryId: string
  revision: string
  kind: string
  payload: unknown
}>

export type HistoryRead = Readonly<{
  outcome: string
  entries: readonly HistoryEntry[]
  pages: number
  exhausted: boolean
}>

export type RecordedFrame = Readonly<{ at: number; frame: ObserveSessionFrame }>

export type Observation = Readonly<{
  frames(): readonly RecordedFrame[]
  end(): Promise<string>
  stop(): void
}>

export type ProtocolDriver = Readonly<{
  account: Account
  tenant(): string
  register(): Promise<string>
  login(account?: Account): Promise<string>
  createSession(): Promise<string>
  send(session: string, text: string): Promise<string>
  readHistory(session: string, pageBytes?: number): Promise<HistoryRead>
  readHistoryPage(
    session: string,
    pageBytes: number,
  ): Promise<HistoryRead & { next: string | null }>
  listSessions(): Promise<{ outcome: string; sessions: readonly string[] }>
  listSessionsAsShipped(): Promise<{
    outcome: string
    sessions: readonly string[]
    reasks: number
  }>
  cancelRun(session: string, run: string): Promise<string>
  observe(session: string): Observation
  currentRun(session: string, timeoutMs: number): Promise<string | null>
  rawOutcome(call: 'list-sessions' | 'read-history', session?: string): Promise<string>
  readFrom(session: string, cursor: string): Promise<HistoryRead & { next: string | null }>
  tenantOnly(): TenantOnly
  assumeTenantWithoutLogin(from: TenantOnly): void
  close(): void
}>

export type TenantOnly = Readonly<{ id: TenantId | undefined; text: string | undefined }>

const DEFAULT_PAGE_BYTES = 65_536
const READ_RETRY_MS = 30_000

export function createProtocolDriver(origin: string, account?: Account): ProtocolDriver {
  let credentials: { proof?: string; tenant?: string } = {}
  let tenantId: TenantId | undefined
  const own: Account = account ?? {
    loginIdentifier: `matrix-${randomUUID().slice(0, 8)}`,
    credential: `pw-${randomUUID()}`,
  }
  const transport = createHttpProtocolTransport({
    origin,
    credentials: (): Credentials => credentials,
  })
  const identity: IdentityClient = createClient(identityProtocol, transport)
  const session: SessionClient = createClient(sessionProtocol, transport)
  let reasks = 0
  const asShipped: SessionClient = createClient(sessionProtocol, transport, {
    readRetry: {
      delayMs: (failures, elapsedMs) => {
        if (elapsedMs > READ_RETRY_MS) return null
        reasks = failures
        return Math.min(250 * 2 ** (failures - 1), 4_000)
      },
      wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    },
  })
  const controllers = new Set<AbortController>()
  const tenant = () => credentials.tenant ?? ''
  const tenantValue = () => tenantId as unknown as Tenant
  const target = (id: string) => ({ tenant: tenantValue(), session: id as Session })

  const readPage = async (id: string, cursor: string | null, pageBytes: number) => {
    const body =
      cursor === null
        ? {
            ...target(id),
            cursor: null,
            direction: 'backward' as const,
            pageBytes: String(pageBytes),
          }
        : { ...target(id), cursor }
    return session['read-history'](body as Parameters<SessionClient['read-history']>[0])
  }

  const driver: ProtocolDriver = {
    account: own,
    tenant,
    register: async () => {
      const answer = await identity['register-and-activate']({
        loginIdentifier: own.loginIdentifier,
        credential: own.credential,
      } as never)
      if (answer.outcome !== 'succeeded') return answer.outcome
      return driver.login()
    },
    login: async (other?: Account) => {
      const use = other ?? own
      const answer = await identity['issue-login']({
        loginIdentifier: use.loginIdentifier,
        credential: use.credential,
      } as never)
      if (answer.outcome !== 'succeeded') return answer.outcome
      const body = answer.body as { loginProof: string; tenantId: TenantId }
      const text = tenantCodec.encode(body.tenantId)
      if (!text.ok) return 'tenant-not-encodable'
      tenantId = body.tenantId
      credentials = { proof: body.loginProof, tenant: text.value }
      return 'succeeded'
    },
    createSession: async () => {
      const answer = await session['create-session']({ createCallId: randomUUID(), purpose: '' })
      if (answer.outcome !== 'succeeded')
        throw new Error(`create-session answered ${answer.outcome}`)
      return String((answer.body as { session: string }).session)
    },
    send: async (id, text) => {
      const inputId = randomUUID()
      const answer = await session['send-input']({
        ...target(id),
        acceptId: randomUUID(),
        inputId,
        message: userTextMessage(text, inputId),
      } as SendBody)
      return answer.outcome
    },
    readHistory: async (id, pageBytes = DEFAULT_PAGE_BYTES) => {
      const entries: HistoryEntry[] = []
      let cursor: string | null = null
      let pages = 0
      for (;;) {
        const answer = await readPage(id, cursor, pageBytes)
        if (answer.outcome !== 'succeeded')
          return { outcome: answer.outcome, entries: entries.reverse(), pages, exhausted: false }
        pages += 1
        const page = answer.body
        entries.push(...page.entries)
        if (page.exhausted || page.next === null)
          return {
            outcome: 'succeeded',
            entries: entries.reverse(),
            pages,
            exhausted: page.exhausted,
          }
        cursor = page.next
      }
    },
    readHistoryPage: async (id, pageBytes) => {
      const answer = await readPage(id, null, pageBytes)
      if (answer.outcome !== 'succeeded')
        return { outcome: answer.outcome, entries: [], pages: 0, exhausted: false, next: null }
      const page = answer.body
      return {
        outcome: 'succeeded',
        entries: [...page.entries].reverse(),
        pages: 1,
        exhausted: page.exhausted,
        next: page.next,
      }
    },
    listSessions: async () => {
      const answer = await session['list-sessions']({ tenant: tenantValue(), cursor: null })
      if (answer.outcome !== 'succeeded') return { outcome: answer.outcome, sessions: [] }
      const body = answer.body
      return { outcome: 'succeeded', sessions: body.sessions.map(item => String(item.session)) }
    },
    listSessionsAsShipped: async () => {
      reasks = 0
      const answer = await asShipped['list-sessions']({ tenant: tenantValue(), cursor: null })
      if (answer.outcome !== 'succeeded') return { outcome: answer.outcome, sessions: [], reasks }
      return {
        outcome: 'succeeded',
        sessions: answer.body.sessions.map(item => String(item.session)),
        reasks,
      }
    },
    cancelRun: async (id, run) => {
      const answer = await session['cancel-run']({
        ...target(id),
        run,
        controlId: randomUUID(),
        urgency: 'graceful',
      })
      return answer.outcome
    },
    observe: id => {
      const controller = new AbortController()
      controllers.add(controller)
      const frames: RecordedFrame[] = []
      const began = Date.now()
      const ended = (async () => {
        const stream = session.observe['observe-session'](target(id), { signal: controller.signal })
        try {
          for (;;) {
            const next = await stream.next()
            if (next.done === true) {
              const end = next.value
              return end.kind === 'ended'
                ? `ended:${end.reason}`
                : end.kind === 'refused'
                  ? `refused:${end.outcome}`
                  : end.kind
            }
            frames.push({ at: Date.now() - began, frame: next.value })
          }
        } catch (error: unknown) {
          return `threw:${String(error)}`
        } finally {
          controllers.delete(controller)
        }
      })()
      return { frames: () => [...frames], end: () => ended, stop: () => controller.abort() }
    },
    currentRun: async (id, timeoutMs) => {
      const observation = driver.observe(id)
      const until = Date.now() + timeoutMs
      try {
        while (Date.now() < until) {
          const state = observation
            .frames()
            .map(recorded => recorded.frame)
            .filter(frame => frame.kind === 'state')
            .at(-1)
          if (state !== undefined && state.kind === 'state' && state.run !== null) return state.run
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        return null
      } finally {
        observation.stop()
      }
    },
    readFrom: async (id, cursor) => {
      const answer = await readPage(id, cursor, DEFAULT_PAGE_BYTES)
      if (answer.outcome !== 'succeeded')
        return { outcome: answer.outcome, entries: [], pages: 0, exhausted: false, next: null }
      const page = answer.body
      return {
        outcome: 'succeeded',
        entries: [...page.entries].reverse(),
        pages: 1,
        exhausted: page.exhausted,
        next: page.next,
      }
    },
    tenantOnly: () => ({ id: tenantId, text: credentials.tenant }),
    assumeTenantWithoutLogin: from => {
      tenantId = from.id
      credentials = from.text === undefined ? {} : { tenant: from.text }
    },
    rawOutcome: async (call, id) => {
      if (call === 'list-sessions')
        return (await session['list-sessions']({ tenant: tenantValue(), cursor: null })).outcome
      return (await readPage(id ?? '', null, DEFAULT_PAGE_BYTES)).outcome
    },
    close: () => {
      for (const controller of controllers) controller.abort()
      controllers.clear()
      credentials = {}
    },
  }
  return driver
}
