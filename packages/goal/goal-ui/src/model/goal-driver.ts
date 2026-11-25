import type { goalProtocol, GoalIssue, GoalView } from '@omne-harness/goal-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { REFUSAL_WORDS, treeOf } from './panel.ts'

export type GoalClient = ClientOf<typeof goalProtocol>
export type Schedule = (delayMs: number, run: () => void) => () => void
export type CommandKind = 'pause' | 'resume' | 'cancel' | 'settle-by-exit'

export type GoalDriverDeps = Readonly<{
  client: GoalClient
  tenant: TenantId
  session: string
  newId?: () => string
  schedule?: Schedule
  retryMs?: number
}>

export type PanelState = Readonly<{
  read: 'loading' | 'read' | 'denied' | 'not-found' | 'unavailable'
  goal: GoalView | null
  busy: CommandKind | 'revise' | null
  notice: string | null
  issues: readonly GoalIssue[]
}>

const INITIAL: PanelState = { read: 'loading', goal: null, busy: null, notice: null, issues: [] }
const UNSENT = '没有送到服务端，目标没有变。'
const UNKNOWN = '结果不知道。面板重读了目标，以读到的为准。'
const WORDS: Readonly<Record<string, string>> = {
  denied: '你现在不能对这个会话的目标做这件事。',
  'not-found': '找不到这个会话。',
  'basis-unavailable': '服务端现在答不了，目标没有变。',
  'protocol-rejected': '服务端不认这次请求，目标没有变。',
}

const timeout: Schedule = (delayMs, run) => {
  const handle = setTimeout(run, delayMs)
  return () => clearTimeout(handle)
}
const UNWRITTEN = {
  'not-committed': { notice: '这次修改没有写下，可以再提交一次。' },
  invalid: { notice: '正文不合格，没有写下。' },
} as const
const issuesOf = (answer: { readonly body?: unknown }): readonly GoalIssue[] =>
  (answer.body as { readonly issues?: readonly GoalIssue[] } | undefined)?.issues ?? []
const unsent = { outcome: 'unsent' } as const
const sent = <T>(call: () => Promise<T>): Promise<T | typeof unsent> =>
  Promise.resolve()
    .then(call)
    .catch(() => unsent)

/** The goal of one session as a panel holds it: read from the server, read again whenever the server says it changed, and never guessed after a command. */
export class GoalDriver {
  #state: PanelState = INITIAL
  readonly #listeners = new Set<() => void>()
  readonly #deps: GoalDriverDeps
  readonly #where: Readonly<{ tenant: TenantId; session: string }>
  #holders = 0
  #watching: AbortController | null = null
  #retry: (() => void) | null = null

  constructor(deps: GoalDriverDeps) {
    this.#deps = deps
    this.#where = { tenant: deps.tenant, session: deps.session }
  }

  getState = (): PanelState => this.#state
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Keeps the goal fresh while somebody shows it; the last one to let go stops the watching. */
  retain = (): (() => void) => {
    this.#holders += 1
    if (this.#holders === 1) void this.#watch()
    let held = true
    return () => {
      if (!held) return
      held = false
      this.#holders -= 1
      if (this.#holders > 0) return
      this.#watching?.abort()
      this.#watching = null
      this.#retry?.()
      this.#retry = null
    }
  }

  dismiss = (): void => this.#set({ notice: null, issues: [] })

  async command(kind: CommandKind, exit?: string): Promise<void> {
    const goal = this.#state.goal
    if (goal === null || this.#state.busy !== null) return
    this.#set({ busy: kind, notice: null, issues: [] })
    const command = kind === 'settle-by-exit' ? { kind, exit: exit ?? '' } : { kind }
    const body = { ...this.#where, generation: goal.state.generation, command }
    const answer = await sent(() => this.#deps.client['command-goal'](body as never))
    if (answer.outcome === 'conflict') return this.#refused(answer.body.reason, '这件事')
    if (answer.outcome !== 'succeeded') return this.#failed(answer.outcome)
    const after = answer.body.goal
    this.#set({ busy: null, ...(after === null ? {} : { goal: after }) })
    if (after === null) await this.read()
  }

  async revise(changes: readonly unknown[]): Promise<boolean> {
    const tree = treeOf(changes)
    if (this.#state.goal === null || this.#state.busy !== null || tree === undefined) return false
    this.#set({ busy: 'revise', notice: null, issues: [] })
    const operation = (this.#deps.newId ?? (() => crypto.randomUUID()))()
    const proposal = { kind: 'revise' as const, changes: tree }
    const answer = await this.#written({ ...this.#where, operation, proposal, words: null })
    if (answer.outcome === 'succeeded') this.#set({ busy: null, goal: answer.body.goal })
    else if (answer.outcome === 'conflict') await this.#refused(answer.body.reason, '修改')
    else if (answer.outcome === 'not-committed' || answer.outcome === 'invalid')
      this.#set({ busy: null, ...UNWRITTEN[answer.outcome], issues: issuesOf(answer) })
    else await this.#failed(answer.outcome)
    return answer.outcome === 'succeeded'
  }

  /** One write and, when its result is not known, the query of that same write: it is asked after, never sent twice. */
  async #written(body: object) {
    const write = await sent(() => this.#deps.client['write-goal'](body as never))
    if (write.outcome !== 'unknown' && write.outcome !== 'unsent') return write
    const recalled = await sent(() => this.#deps.client['query-write-goal'](body as never))
    const told = recalled.outcome === 'succeeded' || recalled.outcome === 'not-committed'
    return told ? recalled : write
  }

  async #refused(reason: string, what: string): Promise<void> {
    this.#set({ busy: null, notice: REFUSAL_WORDS[reason] ?? `目标现在不接受${what}。` })
    await this.read()
  }

  async read(): Promise<void> {
    const answer = await sent(() => this.#deps.client['read-goal'](this.#where as never))
    if (answer.outcome === 'succeeded') this.#set({ read: 'read', goal: answer.body.goal })
    else if (answer.outcome === 'denied' || answer.outcome === 'not-found')
      this.#set({ read: answer.outcome, goal: null })
    else if (this.#state.read === 'loading') this.#set({ read: 'unavailable' })
  }

  async #failed(outcome: string): Promise<void> {
    if (outcome === 'unknown') {
      this.#set({ busy: null, notice: UNKNOWN })
      await this.read()
      return
    }
    this.#set({ busy: null, notice: outcome === 'unsent' ? UNSENT : (WORDS[outcome] ?? UNSENT) })
  }

  /** Reads at each frame the server sends; when the frames end while somebody still shows the goal, opens them again after a while. */
  async #watch(): Promise<void> {
    const controller = new AbortController()
    this.#watching = controller
    const framed = await this.#followed(controller.signal)
    if (controller.signal.aborted || this.#holders === 0) return
    if (!framed) await this.read()
    const schedule = this.#deps.schedule ?? timeout
    this.#retry = schedule(this.#deps.retryMs ?? 5_000, () => {
      this.#retry = null
      if (this.#holders > 0) void this.#watch()
    })
  }

  /** Whether the server sent a frame before the frames ended or failed. */
  async #followed(signal: AbortSignal): Promise<boolean> {
    let framed = false
    try {
      const frames = this.#deps.client.observe['observe-goal'](this.#where as never, { signal })
      for await (const _frame of frames) {
        framed = true
        if (signal.aborted) break
        await this.read()
      }
    } catch {
      return framed
    }
    return framed
  }

  #set(change: Partial<PanelState>): void {
    this.#state = { ...this.#state, ...change }
    for (const listener of this.#listeners) listener()
  }
}
