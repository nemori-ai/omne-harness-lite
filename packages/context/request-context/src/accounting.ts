// The derived account projection (RQ-14) and its recovery (RQ-15). The durable facts stay in the
// result receiver's log; this index is rebuilt from it and never authorizes cleaning it.
import { judgeCallAccount, type CallAccount } from '@omne-harness/call-account'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeAccountingGeneration,
  windowRatio,
  type Access,
  type AccountingGeneration,
  type AccountingOptions,
  type AccountReceipt,
  type AdoptedRequestFact,
  type ContextAccountingInbox,
  type ContextAccountingInput,
  type ContextRecovery,
  type ContextTarget,
  type GroupToken,
  type RecoveryResult,
  type SourceDecision,
  type SourceRead,
  type WindowUsageValue,
} from '@omne-harness/request-context-contract'
import { createHash } from 'node:crypto'

type Revision = Readonly<{ revision: bigint; fingerprint: string; account: CallAccount }>
type DispatchIndex = { current: Revision | null; revisions: Map<string, string> }
type Index = { dispatches: Map<string, DispatchIndex>; facts: number }
type TargetState = {
  status: 'uninitialized' | 'rebuilding' | 'ready'
  generation: AccountingGeneration | null
  index: Index
}
const ATTEMPTS = 2
const INPUT_ITEMS = ['input', 'cache-read', 'cache-write'] as const

function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`
}
function fingerprint(account: CallAccount): string {
  return createHash('sha256').update(canonical(account)).digest('base64url')
}
function keyOf(target: ContextTarget): string | null {
  const tenant = tenantCodec.encode(target.tenant)
  return tenant.ok ? `${tenant.value}\u0000${target.scope.ref}` : null
}
function emptyIndex(): Index {
  return { dispatches: new Map(), facts: 0 }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function positiveSafe(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

type Applied =
  | Readonly<{ kind: 'applied'; change: 'inserted' | 'duplicate' | 'superseded' }>
  | Readonly<{ kind: 'conflict'; field: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The receive rules shared by ordinary delivery and replay: idempotency, then capacity, then write. */
function apply(
  index: Index,
  input: ContextAccountingInput,
  limits: AccountingOptions<unknown>['limits'],
): Applied {
  const key = `${input.call.call}\u0000${input.dispatch}`
  const revision = input.account.revision
  const print = fingerprint(input.account)
  const dispatch = index.dispatches.get(key)
  const known = dispatch?.revisions.get(revision)
  if (known !== undefined)
    return known === print
      ? { kind: 'applied', change: 'duplicate' }
      : { kind: 'conflict', field: 'account' }
  if (index.facts >= limits.maxFactsPerTarget)
    return { kind: 'unavailable', diagnostic: 'capacity' }
  if ((dispatch?.revisions.size ?? 0) >= limits.maxRevisionsPerDispatch)
    return { kind: 'unavailable', diagnostic: 'capacity' }
  const entry = dispatch ?? { current: null, revisions: new Map<string, string>() }
  entry.revisions.set(revision, print)
  index.dispatches.set(key, entry)
  index.facts++
  const value = BigInt(revision)
  if (entry.current !== null && entry.current.revision > value)
    return { kind: 'applied', change: 'superseded' }
  entry.current = { revision: value, fingerprint: print, account: input.account }
  return { kind: 'applied', change: 'inserted' }
}

/** Shape, account legality and the internal tenant relation of one fact. */
function factFailure(input: unknown): Readonly<{
  kind: 'invalid'
  field: string
  reason: 'unsupported-format' | 'tenant-mismatch' | 'invalid-account'
}> | null {
  if (
    !record(input) ||
    input.kind !== 'account' ||
    !record(input.origin) ||
    !record(input.target) ||
    !record(input.call) ||
    typeof input.dispatch !== 'string' ||
    !record(input.committed)
  )
    return { kind: 'invalid', field: 'input', reason: 'unsupported-format' }
  return null
}
function accountFailure(input: ContextAccountingInput) {
  const judged = judgeCallAccount(input.account)
  if (
    'rejected' in judged ||
    input.origin.producer !== 'model' ||
    judged.ok.subject.kind !== 'model_call' ||
    judged.ok.subject.id !== input.call.call
  )
    return { kind: 'invalid' as const, field: 'input.account', reason: 'invalid-account' as const }
  return null
}
function decision(value: Exclude<SourceDecision, { kind: 'allowed' }>) {
  return value
}

/** The complete known input amount in tokens of one account, or null. */
function knownInput(account: CallAccount): bigint | null {
  let total = 0n
  for (const name of INPUT_ITEMS) {
    const item = account.usage.find(usage => usage.name === name)
    if (item === undefined || item.state !== 'known' || item.unit !== 'token') return null
    if (!/^(0|[1-9][0-9]*)$/u.test(item.lexeme)) return null
    total += BigInt(item.lexeme)
  }
  return total
}

/** Creates the account projection: an inbox for result receivers and a recovery port for hosts. */
export function createContextAccounting<P>(
  options: AccountingOptions<P>,
): Readonly<{ inbox: ContextAccountingInbox<P>; recovery: ContextRecovery<P> }> {
  const { limits } = options
  if (
    !record(limits) ||
    !positiveSafe(limits.maxTargets) ||
    !positiveSafe(limits.maxFactsPerTarget) ||
    !positiveSafe(limits.maxRevisionsPerDispatch)
  )
    throw new TypeError('Accounting limits must be positive safe integers')
  const states = new Map<string, TargetState>()
  let generations = 0
  const nextGeneration = (): AccountingGeneration => {
    generations++
    const value = decodeAccountingGeneration(`accounting_${generations}`)
    if ('failure' in value) throw new Error('Accounting generation invalid')
    return value.ok
  }

  function valueOf(fact: AdoptedRequestFact | null, state: TargetState): WindowUsageValue {
    if (fact === null) return { kind: 'not-fixed' }
    const candidate = fact.candidate
    if (fact.accounting.kind === 'unique') {
      const current = state.index.dispatches.get(
        `${fact.call.call}\u0000${fact.accounting.dispatch}`,
      )?.current
      const used = current === null || current === undefined ? null : knownInput(current.account)
      if (used !== null)
        return {
          kind: 'actual',
          candidate,
          usedTokens: used.toString(),
          windowTokens: fact.windowTokens,
          ratio: windowRatio(used.toString(), fact.windowTokens),
        }
    }
    if (fact.forecast !== null)
      return {
        kind: 'estimate',
        candidate,
        usedTokens: fact.forecast.usedTokens,
        windowTokens: fact.windowTokens,
        ratio: windowRatio(fact.forecast.usedTokens, fact.windowTokens),
      }
    return { kind: 'unmeasured', candidate, windowTokens: fact.windowTokens }
  }

  async function eligible(
    access: Access<P>,
    target: ContextTarget,
  ): Promise<SourceRead<never> | null> {
    const checked = await options.readEligibility.check({ access, target, operation: 'accounts' })
    return checked.kind === 'allowed' ? null : checked
  }

  const inbox: ContextAccountingInbox<P> = {
    async receive({ access, input }): Promise<AccountReceipt> {
      if (access === null || access === undefined)
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      const shape = factFailure(input)
      if (shape !== null) return shape
      if (!tenantEquals(access.tenant, input.target.tenant)) return { kind: 'denied' }
      if (!tenantEquals(input.call.tenant, input.target.tenant))
        return { kind: 'invalid', field: 'input.call.tenant', reason: 'tenant-mismatch' }
      const authority = await options.sourceAuthority.check({ access, input })
      if (authority.kind !== 'allowed') return decision(authority)
      const account = accountFailure(input)
      if (account !== null) return account
      const key = keyOf(input.target)
      const state = key === null ? undefined : states.get(key)
      // The state and generation are checked after the asynchronous checks, right before the write.
      if (state === undefined || state.status === 'uninitialized')
        return { kind: 'unavailable', diagnostic: 'uninitialized' }
      if (state.status === 'rebuilding' || state.generation === null)
        return { kind: 'unavailable', diagnostic: 'rebuilding' }
      const applied = apply(state.index, input, limits)
      if (applied.kind !== 'applied') return applied
      return { kind: 'received', generation: state.generation, change: applied.change }
    },
    async usage({ access, target }): Promise<SourceRead<WindowUsageValue>> {
      if (access === null || access === undefined)
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (!tenantEquals(access.tenant, target.tenant)) return { kind: 'denied' }
      const key = keyOf(target)
      const read = { access, target }
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const refused = await eligible(access, target)
        if (refused !== null) return refused
        const before = await options.adoptedSource.readCount(read)
        if (before.kind !== 'value') return before
        const source = await options.adoptedSource.readSource(read)
        if (source.kind !== 'value') return source
        const after = await options.adoptedSource.readCount(read)
        if (after.kind !== 'value') return after
        if (before.value !== after.value) continue
        const fact = source.value
        if (
          fact !== null &&
          (!tenantEquals(fact.target.tenant, target.tenant) ||
            !tenantEquals(fact.call.tenant, target.tenant) ||
            fact.target.scope.ref !== target.scope.ref)
        )
          return { kind: 'invalid', field: 'adopted', reason: 'source-evidence-conflict' }
        const state = key === null ? undefined : states.get(key)
        if (state === undefined || state.status !== 'ready')
          return { kind: 'unavailable', diagnostic: state?.status ?? 'uninitialized' }
        const generation = state.generation
        const value = valueOf(fact, state)
        const again = await eligible(access, target)
        if (again !== null) return again
        const last: SourceRead<GroupToken> = await options.adoptedSource.readCount(read)
        if (last.kind !== 'value') return last
        if (last.value !== before.value) continue
        // Publication: generation and readiness are checked with no await before returning.
        if (state.status !== 'ready' || state.generation !== generation)
          return { kind: 'unavailable', diagnostic: 'Account projection changed' }
        return { kind: 'value', value }
      }
      return { kind: 'unavailable', diagnostic: 'unstable-input:adopted' }
    },
  }

  const recovery: ContextRecovery<P> = {
    async rebuildAccounts({ access, target, replay }): Promise<RecoveryResult> {
      if (!record(access) || access.scope !== 'system' || typeof access.grant !== 'string')
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      const key = keyOf(target)
      if (key === null)
        return { kind: 'invalid', field: 'target.tenant', reason: 'unsupported-format' }
      const check = () =>
        options.recoveryAuthority.check({
          access,
          target,
          snapshot: replay.snapshot,
          operation: 'rebuild-accounts',
        })
      const first = await check()
      if (first.kind !== 'allowed') return decision(first)
      const existing = states.get(key)
      if (existing?.status === 'rebuilding')
        return { kind: 'unavailable', diagnostic: 'rebuilding' }
      if (existing === undefined && states.size >= limits.maxTargets)
        return { kind: 'unavailable', diagnostic: 'capacity' }
      const state: TargetState = existing ?? {
        status: 'uninitialized',
        generation: null,
        index: emptyIndex(),
      }
      states.set(key, state)
      state.status = 'rebuilding'
      state.generation = null
      const fail = (result: RecoveryResult): RecoveryResult => {
        // The old complete index is kept, but a not-ready target never serves it.
        state.status = 'uninitialized'
        return result
      }
      const staging = emptyIndex()
      try {
        for await (const fact of replay.facts) {
          const shape = factFailure(fact)
          if (shape !== null) return fail(shape)
          if (
            !tenantEquals(fact.target.tenant, target.tenant) ||
            fact.target.scope.ref !== target.scope.ref
          )
            return fail({ kind: 'invalid', field: 'replay.target', reason: 'tenant-mismatch' })
          if (!tenantEquals(fact.call.tenant, target.tenant))
            return fail({ kind: 'invalid', field: 'replay.call.tenant', reason: 'tenant-mismatch' })
          const verified = await options.recoveryAuthority.checkFact({
            access,
            target,
            snapshot: replay.snapshot,
            input: fact,
          })
          if (verified.kind !== 'allowed') return fail(decision(verified))
          const account = accountFailure(fact)
          if (account !== null) return fail(account)
          const applied = apply(staging, fact, limits)
          if (applied.kind !== 'applied') return fail(applied)
        }
      } catch (error) {
        fail({ kind: 'unavailable', diagnostic: 'replay' })
        return {
          kind: 'unavailable',
          diagnostic: `Replay did not end normally: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
      const last = await check()
      if (last.kind !== 'allowed') return fail(decision(last))
      state.index = staging
      state.generation = nextGeneration()
      state.status = 'ready'
      return { kind: 'rebuilt', generation: state.generation }
    },
  }
  return { inbox, recovery }
}
