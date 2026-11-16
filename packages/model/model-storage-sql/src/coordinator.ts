import type {
  MaterializationReceipt,
  ModelCallId,
  ModelFailure,
} from '@omne-harness/model-contract'
import type { SendDemand } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialSelection, SendCoordinator, SendStart } from '@omne-harness/model'
import type {
  CallDocument,
  CommandWrite,
  ModelCommandCore,
  modelCommands,
  ModelCommandStorage,
  ModelSendSource,
  RunScope,
  TenantDocuments,
} from '@omne-harness/model/commands'

export const DEFAULT_MAX_CLAIMS = 1024

export type SendMirrorOptions = Readonly<{
  mirrorBytes: number
  maxClaims?: number
}>

export type SendMirror = Readonly<{
  storage: ModelCommandStorage
  coordinator<P>(
    core: ModelCommandCore<P>,
    sources: readonly ModelSendSource<P>[],
    bound?: NonNullable<Parameters<typeof modelCommands<P>>[1]>,
  ): SendCoordinator<P>
}>

const QUALIFICATION_UNAVAILABLE: ModelFailure = {
  kind: 'unavailable',
  dependency: 'model-send',
  diagnostic: 'qualification-unavailable',
}
const CLAIM_CAPACITY: ModelFailure = {
  kind: 'unavailable',
  dependency: 'model-send',
  diagnostic: 'send-claim-capacity',
}

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} is not a positive safe integer`)
}

const callKey = (tenant: string, call: ModelCallId): string => JSON.stringify([tenant, call])

function documentBytes(document: CallDocument): number {
  const text = JSON.stringify(document, (key, value: unknown) => {
    if (key === 'assembly') return undefined
    if (value instanceof Map) return [...value]
    if (typeof value === 'bigint') return value.toString()
    return value
  })
  return Buffer.byteLength(text, 'utf8')
}

type ClaimState = 'claimed' | SendStart['kind']

class Claims {
  private readonly calls = new Map<string, Map<string, ClaimState>>()
  private count = 0
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  has(key: string, dispatch: string): boolean {
    return this.calls.get(key)?.has(dispatch) === true
  }

  full(): boolean {
    return this.count >= this.limit
  }

  set(key: string, dispatch: string, state: ClaimState): void {
    const claims = this.calls.get(key) ?? new Map<string, ClaimState>()
    if (!claims.has(dispatch)) this.count += 1
    claims.set(dispatch, state)
    this.calls.set(key, claims)
  }

  prune(key: string, document: CallDocument): void {
    const claims = this.calls.get(key)
    if (claims === undefined) return
    const settled = document.state.phase === 'settled'
    for (const dispatch of claims.keys()) {
      const found = document.dispatches.find(d => d.record.dispatch === dispatch)
      if (settled || found === undefined || found.record.send !== 'prepared') {
        claims.delete(dispatch)
        this.count -= 1
      }
    }
    if (claims.size === 0) this.calls.delete(key)
  }
}

type Entry = { readonly document: CallDocument; readonly bytes: number }

class Mirror {
  private readonly entries = new Map<string, Entry>()
  private total = 0
  private readonly budget: number
  private readonly claims: Claims

  constructor(budget: number, claims: Claims) {
    this.budget = budget
    this.claims = claims
  }

  get(key: string): CallDocument | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.document
  }

  private pinned(key: string, document: CallDocument): boolean {
    if (document.state.phase === 'settled') return false
    return document.dispatches.some(
      d =>
        d.record.materialization !== null &&
        d.record.send === 'prepared' &&
        !this.claims.has(key, d.record.dispatch),
    )
  }

  offer(tenant: string, document: CallDocument): void {
    const key = callKey(tenant, document.state.call)
    const current = this.entries.get(key)
    if (
      current !== undefined &&
      BigInt(document.state.revision) < BigInt(current.document.state.revision)
    )
      return
    this.remove(key)
    const entry = { document, bytes: documentBytes(document) }
    this.entries.set(key, entry)
    this.total += entry.bytes
    this.claims.prune(key, document)
    this.evict(key)
  }

  drop(tenant: string, call: ModelCallId): void {
    this.remove(callKey(tenant, call))
  }

  private remove(key: string): void {
    const entry = this.entries.get(key)
    if (entry === undefined) return
    this.entries.delete(key)
    this.total -= entry.bytes
  }

  private evict(keep: string): void {
    for (const [key, entry] of this.entries) {
      if (this.total <= this.budget) return
      if (key === keep || this.pinned(key, entry.document)) continue
      this.remove(key)
    }
  }
}

type Pass = {
  readonly seen: Map<string, Readonly<{ tenant: string; document: CallDocument }>>
  staged: Readonly<{ tenant: string; call: ModelCallId; document: CallDocument | undefined }> | null
}

type FenceView = Readonly<{
  tenant: string
  call: ModelCallId
  document: CallDocument | undefined
}>

const notFound = (failure: ModelFailure): boolean =>
  failure.kind === 'invalid' && failure.field === 'call' && failure.reason === 'not-found'

export function createSendMirror(
  inner: ModelCommandStorage,
  options: SendMirrorOptions,
): SendMirror {
  positive(options.mirrorBytes, 'mirrorBytes')
  const maxClaims = options.maxClaims ?? DEFAULT_MAX_CLAIMS
  positive(maxClaims, 'maxClaims')
  const claims = new Claims(maxClaims)
  const mirror = new Mirror(options.mirrorBytes, claims)
  let pass: Pass | null = null
  let fence: FenceView | null = null
  let busy = false

  function settle<T>(last: Pass, outcome: Outcome<T, ModelFailure>): void {
    const { staged } = last
    if (staged !== null && !('ok' in outcome)) {
      mirror.drop(staged.tenant, staged.call)
      return
    }
    for (const { tenant, document } of last.seen.values()) mirror.offer(tenant, document)
    if (staged?.document !== undefined) mirror.offer(staged.tenant, staged.document)
  }

  const storage: ModelCommandStorage = {
    async run<T>(work: () => Outcome<T, ModelFailure>, scope?: RunScope) {
      const latest: { pass: Pass | null } = { pass: null }
      const outcome = await inner.run(() => {
        latest.pass = { seen: new Map(), staged: null }
        pass = latest.pass
        try {
          return work()
        } finally {
          pass = null
        }
      }, scope)
      if (latest.pass !== null) settle(latest.pass, outcome)
      return outcome
    },
    documents(tenant: string): TenantDocuments {
      if (pass === null && fence !== null) {
        if (tenant !== fence.tenant || fence.document === undefined)
          return { calls: new Map(), operations: new Map() }
        return { calls: new Map([[fence.call, fence.document]]), operations: new Map() }
      }
      const view = inner.documents(tenant)
      if (pass !== null)
        for (const document of view.calls.values())
          pass.seen.set(callKey(tenant, document.state.call), { tenant, document })
      return view
    },
    held: () => inner.held(),
    readBody: (tenant, call) => inner.readBody(tenant, call),
    commit(tenant: string, write: CommandWrite) {
      const status = inner.commit(tenant, write)
      if (pass !== null) pass.staged = { tenant, call: write.binding.call, document: write.call }
      return status
    },
    publish(tenant: string, call: CallDocument) {
      inner.publish(tenant, call)
      if (pass !== null) pass.staged = { tenant, call: call.state.call, document: call }
    },
  }

  function exclusive<T>(work: () => T): T {
    if (busy) throw new TypeError('SQL Model send coordinator reentry')
    busy = true
    try {
      return work()
    } finally {
      busy = false
    }
  }

  return {
    storage,
    coordinator<P>(
      core: ModelCommandCore<P>,
      sources: readonly ModelSendSource<P>[],
      bound?: NonNullable<Parameters<typeof modelCommands<P>>[1]>,
    ): SendCoordinator<P> {
      if (core.storage !== storage)
        throw new TypeError('the commands core does not run on the storage of this mirror')
      const registered = sources.map(source => ({
        ...source,
        profile: structuredClone(source.profile),
        supplier: structuredClone(source.supplier),
      }))
      const refused = (failure: ModelFailure): SendStart => ({ kind: 'refused', failure })

      function qualified<T>(
        input: SendDemand<P>,
        work: (call: CallDocument) => Outcome<T, ModelFailure>,
      ): Outcome<T, ModelFailure> {
        const tenant = core.identity(input)
        if (typeof tenant !== 'string') return { failure: tenant }
        const document = mirror.get(callKey(tenant, input.call))
        fence = { tenant, call: input.call, document }
        let outcome: Outcome<T, ModelFailure>
        try {
          outcome = core.read(input, 'send', work)
        } finally {
          fence = null
        }
        if (document === undefined && 'failure' in outcome && notFound(outcome.failure))
          return { failure: QUALIFICATION_UNAVAILABLE }
        return outcome
      }

      return {
        check: (input, stage) =>
          exclusive(() =>
            qualified(input, call => {
              const failure = core.sendBinding(input, call, stage, bound)
              return failure ? { failure } : { ok: undefined }
            }),
          ),
        withinCurrent: (
          input: SendDemand<P>,
          receipt: MaterializationReceipt,
          window: string,
          start: (selection: CredentialSelection) => SendStart,
        ) =>
          exclusive(() => {
            const checked = qualified<CredentialSelection>(input, call =>
              core.currentCredential(input, call, receipt, window, registered, bound),
            )
            if ('failure' in checked) return refused(checked.failure)
            const tenant = core.identity(input)
            if (typeof tenant !== 'string') return refused(tenant)
            const key = callKey(tenant, input.call)
            if (claims.has(key, input.dispatch))
              return { kind: 'unknown', diagnostic: 'dispatch-already-claimed' }
            if (claims.full()) return refused(CLAIM_CAPACITY)
            claims.set(key, input.dispatch, 'claimed')
            try {
              const result = start(checked.ok)
              claims.set(key, input.dispatch, result.kind)
              return result
            } catch {
              claims.set(key, input.dispatch, 'unknown')
              return { kind: 'unknown', diagnostic: 'transport-start-unknown' }
            }
          }),
      }
    },
  }
}
