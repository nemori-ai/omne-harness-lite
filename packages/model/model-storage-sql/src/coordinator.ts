// The send coordinator of the Model records over the SQL storage. `SendCoordinator` is
// synchronous, and the SQL storage answers only inside a run, after an asynchronous read. So the
// coordinator answers from a mirror in the process: a decorator over the storage port of the
// shared commands core records each call document that a run read or committed, and the core,
// run on that decorator, judges a send demand against the mirror inside one synchronous fence.
// The commands and the coordinator share this one mirror and the one core, so they share one
// qualification authority (`core.options.authority`). A call that the mirror does not hold is
// cold: the fence refuses it as `qualification-unavailable`, and `recordMaterialization` with the
// same operation reads the call back into the mirror. Imports no Cordis.
import type { MaterializationReceipt, ModelCallId, ModelFailure } from '@omne-harness/model-contract'
import type { SendDemand } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialSelection, SendCoordinator, SendStart } from '@omne-harness/model'
import type {
  CallDocument,
  CommandWrite,
  ModelCommandCore,
  ModelCommandStorage,
  ModelSendSource,
  RunScope,
  TenantDocuments,
} from '@omne-harness/model/commands'

/** Dispatches claimed by a fence whose send record the mirror has not seen yet. */
export const DEFAULT_MAX_CLAIMS = 1024

export type SendMirrorOptions = Readonly<{
  /**
   * The bytes of call documents that the mirror keeps beside the pinned ones. The most recent
   * document stays even when it alone is larger. Pinned documents are never evicted.
   */
  mirrorBytes: number
  /** Claimed dispatches that the coordinator remembers. Default 1024. */
  maxClaims?: number
}>

export type SendMirror = Readonly<{
  /** The storage port to build the commands core on. It forwards every call to the SQL storage. */
  storage: ModelCommandStorage
  /** The coordinator over `core`, which must run on `storage` of this mirror. */
  coordinator<P>(
    core: ModelCommandCore<P>,
    sources: readonly ModelSendSource<P>[],
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

/** The encoded size of a document; the stream assembly is process state and not counted. */
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

/**
 * The claim table: a dispatch starts at most once in this process. A claim lasts while the
 * dispatch is still `prepared` in the latest mirrored document of its call, and survives the
 * eviction of that document.
 */
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

  /** Drops the claims that `document` shows as recorded or no longer sendable. */
  prune(key: string, document: CallDocument): void {
    const claims = this.calls.get(key)
    if (claims === undefined) return
    const settled = document.state.phase === 'settled'
    for (const dispatch of [...claims.keys()]) {
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

/** The call documents of the process, least recently used first. */
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

  /**
   * A document between `recordMaterialization` and the fence of its dispatch: a dispatch with a
   * materialization, still `prepared`, and not claimed (D3 review N4).
   */
  private pinned(key: string, document: CallDocument): boolean {
    if (document.state.phase === 'settled') return false
    return document.dispatches.some(
      d =>
        d.record.materialization !== null &&
        d.record.send === 'prepared' &&
        !this.claims.has(key, d.record.dispatch),
    )
  }

  /** Keeps `document` unless the mirror already holds a later revision of the call. */
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
    for (const [key, entry] of [...this.entries]) {
      if (this.total <= this.budget) return
      if (key === keep || this.pinned(key, entry.document)) continue
      this.remove(key)
    }
  }
}

/** What one pass of a run read and staged. A run that meets a newer write has several passes. */
type Pass = {
  readonly seen: Map<string, Readonly<{ tenant: string; document: CallDocument }>>
  staged: Readonly<{ tenant: string; call: ModelCallId; document: CallDocument | undefined }> | null
}

/** What the fence lets the core read: one mirrored call of one tenant. */
type FenceView = Readonly<{ tenant: string; call: ModelCallId; document: CallDocument }>

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

  /** Records what the run decided. The mirror never holds a write the storage did not confirm. */
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
      // The pass of the latest `work`: the run commits, if anything, what its last pass staged.
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
        if (tenant !== fence.tenant) return { calls: new Map(), operations: new Map() }
        return { calls: new Map([[fence.call, fence.document]]), operations: new Map() }
      }
      const view = inner.documents(tenant)
      if (pass !== null)
        for (const document of view.calls.values())
          pass.seen.set(callKey(tenant, document.state.call), { tenant, document })
      return view
    },
    reserved: field => inner.reserved(field),
    commit(tenant: string, write: CommandWrite) {
      const status = inner.commit(tenant, write)
      if (pass !== null)
        pass.staged = { tenant, call: write.binding.call, document: write.call }
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
    ): SendCoordinator<P> {
      if (core.storage !== storage)
        throw new TypeError('the commands core does not run on the storage of this mirror')
      const registered = sources.map(source => ({
        ...source,
        profile: structuredClone(source.profile),
        supplier: structuredClone(source.supplier),
        credential: structuredClone(source.credential),
      }))
      const refused = (failure: ModelFailure): SendStart => ({ kind: 'refused', failure })

      /** Runs `work` of the core on the mirrored call, or refuses a cold call. */
      function qualified<T>(
        input: SendDemand<P>,
        work: (call: CallDocument) => Outcome<T, ModelFailure>,
      ): Outcome<T, ModelFailure> {
        const tenant = core.identity(input)
        if (typeof tenant !== 'string') return { failure: tenant }
        const document = mirror.get(callKey(tenant, input.call))
        if (document === undefined) return { failure: QUALIFICATION_UNAVAILABLE }
        fence = { tenant, call: input.call, document }
        try {
          return core.read(input, 'send', work)
        } finally {
          fence = null
        }
      }

      return {
        check: (input, stage) =>
          exclusive(() =>
            qualified(input, call => {
              const failure = core.sendBinding(input, call, stage)
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
              core.currentCredential(input, call, receipt, window, registered),
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
