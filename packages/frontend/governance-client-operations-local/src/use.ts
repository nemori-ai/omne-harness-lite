import type { CachedRead, LocalRecord, LocalSnapshot } from '@omne-harness-lite/client-local-state'
import { Prepared } from './prepared.ts'
import type { InputPrompt } from '@omne-harness-lite/governance-client-operations'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { checkHealth, options, readLocal, type Runtime } from './actions.ts'
import { CacheKnowledge, cacheContext, tenant } from './cache.ts'
import {
  block,
  canUseCopy,
  defect,
  finish,
  observeOutcome,
  origin,
  reportFrame,
  type ReportFrame,
} from './report.ts'
import { AI16, AI50, OG36, og, READ_OPERATIONS } from './routes.ts'
import { settle } from './settlement.ts'
import {
  ClientUseUsageDefect,
  type ActionInput,
  type ActionReport,
  type GovernanceUse,
} from '@omne-harness-lite/governance-client-operations'
import { canonical, captureAction, validInstant } from './validation.ts'

type SelectedRecord = LocalRecord & { readonly login: NonNullable<LocalRecord['login']> }

export class Use implements GovernanceUse {
  #runtime: Runtime | undefined
  readonly #storeId: string
  #record: SelectedRecord | undefined
  readonly #knowledge = new CacheKnowledge()
  readonly #onClose: () => void
  #account: string | undefined
  #reenter = false
  #closed = false
  #input: Prepared | undefined
  readonly #jobs = new Set<Promise<ActionReport>>()
  #job: Promise<ActionReport> | undefined
  #closing: Promise<void> | undefined

  constructor(runtime: Runtime, snapshot: LocalSnapshot, onClose: () => void) {
    if (snapshot.value?.login === undefined) throw new ClientUseUsageDefect('invalid-use')
    this.#runtime = runtime
    this.#storeId = snapshot.storeId
    this.#record = snapshot.value as SelectedRecord
    this.#account = this.#selection.login.accountId
    this.#onClose = onClose
  }

  get #selection(): SelectedRecord {
    if (this.#record === undefined) throw new ClientUseUsageDefect('closed')
    return this.#record
  }
  get #environment(): Runtime {
    if (this.#runtime === undefined) throw new ClientUseUsageDefect('closed')
    return this.#runtime
  }

  run(input: unknown): Promise<ActionReport> {
    return this.#track(() => this.#run(input))
  }
  runPrepared(input: unknown, prompt: InputPrompt): Promise<ActionReport> {
    return this.#track(() => {
      const prepared = Prepared.capture(input, prompt)
      return prepared === undefined ? this.#run(undefined) : this.runCaptured(prepared)
    })
  }
  /** Root and use share this captured interaction, including its cancellation signal. */
  runCaptured(prepared: Prepared): Promise<ActionReport> {
    return this.#track(() => this.#run(prepared.intent, prepared)).finally(() => prepared.release())
  }
  #track(work: () => Promise<ActionReport>): Promise<ActionReport> {
    if (this.#closed) return Promise.reject(new ClientUseUsageDefect('closed'))
    const completion = Promise.withResolvers<ActionReport>()
    const job = completion.promise
    this.#jobs.add(job)
    void job.then(
      () => this.#jobs.delete(job),
      () => this.#jobs.delete(job),
    )
    try {
      completion.resolve(work())
    } catch (error) {
      completion.reject(error)
    }
    return job
  }
  #run(input: unknown, prepared?: Prepared): Promise<ActionReport> {
    if (this.#closed) return Promise.reject(new ClientUseUsageDefect('closed'))
    const action = prepared?.intent ?? captureAction(input)
    const frame = reportFrame(action)
    const expected =
      action?.action === 'invoke' ? tenant(action.payload['expectedTenant']) : undefined
    frame.origin = {
      ...origin(this.#selection),
      accountId: this.#account ?? null,
      ...(expected === undefined ? {} : { expectedTenant: expected }),
    }
    frame.use = this.#reenter ? 'reenter-required' : 'active'
    if (action?.action !== 'invoke' && action?.action !== 'logout') {
      block(frame, 'invalid-input')
      return Promise.resolve(finish(frame))
    }
    if (this.#reenter) {
      block(frame, 'reenter-required')
      return Promise.resolve(finish(frame))
    }
    if (this.#job !== undefined) {
      block(frame, 'busy')
      return Promise.resolve(finish(frame))
    }
    this.#input = prepared
    const completion = Promise.withResolvers<ActionReport>()
    const work = completion.promise
    this.#job = work
    work.then(
      () => {
        this.#job = undefined
        this.#input = undefined
      },
      () => {
        this.#job = undefined
        this.#input = undefined
      },
    )
    try {
      completion.resolve(
        this.#perform(action, frame, prepared).then(() => {
          frame.use = this.#reenter ? 'reenter-required' : this.#closed ? 'ended' : 'active'
          return finish(frame)
        }),
      )
    } catch (error) {
      completion.reject(error)
    }
    return work
  }

  close(): Promise<void> {
    if (this.#closing !== undefined) return this.#closing
    this.#closed = true
    const completion = Promise.withResolvers<void>()
    this.#closing = completion.promise
    this.#input?.cancel()
    Promise.allSettled([...this.#jobs]).then(() => {
      this.#onClose()
      this.#runtime = undefined
      this.#record = undefined
      this.#knowledge.clear()
      completion.resolve()
    }, completion.reject)
    return this.#closing
  }

  #sameSelection(snapshot: LocalSnapshot): boolean {
    const current = snapshot.value
    return (
      snapshot.storeId === this.#storeId &&
      current?.login !== undefined &&
      canonical(current.center) === canonical(this.#selection.center) &&
      current.login.presentation === this.#selection.login.presentation &&
      current.login.handle === this.#selection.login.handle
    )
  }
  #copyView(frame: ReportFrame, copy: CachedRead): void {
    frame.view = {
      source: 'copy',
      data: { operation: copy.operation, reply: { result: copy.result } },
      acquiredAt: copy.acquiredAt,
      query: { operation: copy.operation, payload: copy.payload },
      ...(copy.tenant === undefined ? {} : { tenant: copy.tenant }),
    }
  }
  #readCopy(
    operation: string,
    payload: Readonly<Record<string, unknown>>,
    result: unknown,
    frame: ReportFrame,
  ): CachedRead | undefined {
    let acquiredAt: unknown
    try {
      acquiredAt = this.#environment.observedAt()
    } catch {
      acquiredAt = undefined
    }
    if (!validInstant(acquiredAt)) {
      frame.local = { status: 'not-installed', reason: 'unavailable' }
      return undefined
    }
    if (this.#account === undefined) return undefined
    const context = cacheContext(operation, payload, this.#account)
    if (context !== undefined && context.account !== this.#account) return undefined
    return {
      centerId: this.#selection.center.centerId,
      accountId: this.#account,
      operation,
      payload,
      result,
      acquiredAt,
      ...(context === undefined ? {} : { tenant: context }),
    }
  }
  async #request(
    operation: string,
    payload: Readonly<Record<string, unknown>>,
    frame: ReportFrame,
    stage: 'identity' | 'operation',
  ): Promise<GovernanceOutcome | undefined> {
    try {
      const result = await this.#environment.exchange(
        options(this.#environment, this.#selection.center),
        {
          protocolVersion: '2',
          presentedLoginState: this.#selection.login.presentation,
          operation,
          payload,
        },
      )
      observeOutcome(frame, operation, result, stage)
      return result
    } catch {
      defect(frame, stage)
      return undefined
    }
  }

  async #perform(
    action: Extract<ActionInput, { action: 'invoke' }> | { action: 'logout' },
    frame: ReportFrame,
    prepared?: Prepared,
  ): Promise<void> {
    const before = await readLocal(this.#environment, frame)
    if (before === undefined) return
    if (!this.#sameSelection(before)) {
      this.#reenter = true
      block(frame, 'selection-changed')
      return
    }
    const record = before.value as SelectedRecord
    if (record.login.accountId !== undefined) {
      if (this.#account !== undefined && this.#account !== record.login.accountId) {
        defect(frame, 'local-read')
        this.#reenter = true
        return
      }
      this.#account = record.login.accountId
    }
    const operation = action.action === 'logout' ? AI16 : action.operation
    let payload =
      action.action === 'logout'
        ? { loginStateHandle: this.#selection.login.handle }
        : action.payload
    const expected = tenant(payload['expectedTenant'])
    frame.origin = {
      ...origin(this.#selection),
      accountId: this.#account ?? null,
      ...(expected === undefined ? {} : { expectedTenant: expected }),
    }
    const selfLogout =
      operation === AI16 && payload['loginStateHandle'] === this.#selection.login.handle
    const isRead = READ_OPERATIONS.has(operation)
    if (
      isRead &&
      action.action === 'invoke' &&
      action.readMode !== 'refresh' &&
      this.#account !== undefined
    ) {
      const copy = this.#knowledge.find(record, operation, payload, this.#account)
      if (copy !== undefined) {
        if (
          prepared !== undefined &&
          ((await prepared.complete(frame, record.center.endpoint, 'local-selection')) ===
            undefined ||
            !prepared.continueAllowed(frame))
        )
          return
        this.#copyView(frame, copy)
        return
      }
    }
    if (
      (await checkHealth(this.#environment, record.center, record.center.centerId, frame)) ===
      undefined
    ) {
      if (prepared !== undefined && !prepared.continueAllowed(frame)) return
      if (isRead && canUseCopy(frame) && this.#account !== undefined) {
        const copy = this.#knowledge.find(record, operation, payload, this.#account)
        if (copy !== undefined) this.#copyView(frame, copy)
      }
      return
    }
    if (prepared !== undefined && !prepared.continueAllowed(frame)) return
    const additions: CachedRead[] = []
    let clear = false
    let target: GovernanceOutcome | undefined
    if (
      this.#account === undefined &&
      (prepared !== undefined || (!selfLogout && operation !== OG36))
    ) {
      const identity = await this.#request(OG36, {}, frame, 'identity')
      if (identity?.kind === 'reply' && 'result' in identity.reply) {
        const current = tenant(identity.reply.result)
        if (current === undefined) {
          defect(frame, 'identity')
          return
        }
        this.#account = current.account
        frame.origin = { ...frame.origin, accountId: current.account }
        const copy = this.#readCopy(OG36, {}, identity.reply.result, frame)
        if (copy !== undefined) additions.push(copy)
      } else {
        clear = identity?.kind === 'entry-answer' && identity.answer === 'login-state-rejected'
        if (clear) this.#reenter = true
        if (clear) await this.#save(before, record, [], true, frame)
        return
      }
    }
    if (prepared !== undefined) {
      const complete = await prepared.complete(frame, record.center.endpoint, 'verified-center')
      if (complete === undefined || !prepared.continueAllowed(frame)) {
        await this.#save(before, record, additions, false, frame)
        return
      }
      if (complete.action === 'invoke') payload = complete.payload
    }
    target = await this.#request(operation, payload, frame, 'operation')
    if (target?.kind === 'reply') {
      if (operation === OG36 && 'result' in target.reply) {
        const current = tenant(target.reply.result)
        if (
          current === undefined ||
          (this.#account !== undefined && this.#account !== current.account)
        ) {
          defect(frame, 'operation')
          this.#reenter = true
          return
        }
        this.#account = current.account
        frame.origin = { ...frame.origin, accountId: current.account }
      }
      // Knowledge takes effect before local timestamp or persistence can fail.
      if (this.#account !== undefined)
        this.#knowledge.observe(record, operation, payload, target.reply, this.#account)
      // An observation prepared earlier in this action is older than the target
      // decision too. In particular, switching cannot save the previous choice.
      if (
        (operation === og(37) && 'result' in target.reply) ||
        ('failure' in target.reply && target.reply.failure === 'expectedTenantMismatch')
      ) {
        for (let i = additions.length - 1; i >= 0; i--)
          if (additions[i]?.operation === OG36) additions.splice(i, 1)
      }
      if ('result' in target.reply) {
        frame.view = {
          source: 'online',
          data: frame.remote.reply!,
          ...(isRead ? { query: { operation, payload } } : {}),
        }
        if (isRead) {
          const copy = this.#readCopy(operation, payload, target.reply.result, frame)
          if (copy !== undefined) {
            additions.push(copy)
            frame.view = {
              ...frame.view,
              acquiredAt: copy.acquiredAt,
              ...(copy.tenant === undefined ? {} : { tenant: copy.tenant }),
            }
          }
        }
        clear = selfLogout || operation === AI50
      }
    } else if (target?.kind === 'entry-answer' && target.answer === 'login-state-rejected')
      clear = true
    if (clear || ((selfLogout || operation === AI50) && frame.remote.status === 'unknown'))
      this.#reenter = true
    if (isRead && canUseCopy(frame) && this.#account !== undefined) {
      const copy = this.#knowledge.find(record, operation, payload, this.#account)
      if (copy !== undefined) this.#copyView(frame, copy)
    }
    await this.#save(before, record, additions, clear, frame)
  }

  async #save(
    before: LocalSnapshot,
    record: SelectedRecord,
    additions: readonly CachedRead[],
    clear: boolean,
    frame: ReportFrame,
  ): Promise<void> {
    // Failure to represent the observation time prevents this combined replacement.
    // The in-use invalidation knowledge and already known remote fact still stand.
    if (frame.local.status === 'not-installed' && !clear) return
    const value: LocalRecord = clear
      ? { center: record.center, cache: [] }
      : this.#knowledge.prepare(
          {
            ...record,
            login: {
              ...record.login,
              ...(this.#account === undefined ? {} : { accountId: this.#account }),
            },
          },
          additions,
        )
    if (canonical(value) === canonical(record)) return
    const current = await settle(this.#environment.state, before, value, frame)
    if (frame.local.status === 'installed') this.#knowledge.installed(additions)
    if (current !== undefined && !this.#sameSelection(current)) this.#reenter = true
  }
}
