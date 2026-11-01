// The binding registry (G7) of one process: the contributions of trusted loaders, keyed by source
// layer, capability and asset version. `register` runs the origin check, the admission check and
// the write in one synchronous step, so no other register comes between them; that step is the
// local ordering domain. The registry is not durable and keeps no history. A contribution leaves
// only by its own token, whether through `release` or through the end of its caller fiber.
import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access, SourceLayer, ToolCallId, ToolDefinition } from '@omne-harness/tool-contract'
import {
  sameBindingKey,
  sameShape,
  sameSourceLayer,
  shapeOf,
  type ToolAuthority,
  type ToolBindingDrain,
  type ToolBindingEntry,
  type ToolBindingKey,
  type ToolBindingKeyFailure,
  type ToolBindingRegistry,
  type ToolBindingScope,
  type ToolContribution,
  type ToolContributionFailure,
  type ToolLoadedRegistration,
} from '@omne-harness/tool-contract/provider'
import type { Adoption } from '@omne-harness/tool-contract'

export type LocalToolAuthorityFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * The synchronous origin check of a contribution, injected by the assembly. `verify` takes the
 * source layer from the authority, never from the registrant; `admits` checks that the registrant
 * may register at that layer. The Cordis service `toolContributionAuthority` has this shape. This
 * host provides no check of its own, so a registry without one admits nothing.
 */
export interface LocalToolContributionVerifier<P> {
  verify(authority: ToolAuthority): Outcome<ToolAuthority, LocalToolAuthorityFailure>
  admits(
    access: Access<P>,
    layer: SourceLayer,
  ): Outcome<void, Exclude<LocalToolAuthorityFailure, { kind: 'invalid' }>>
}

export type LocalToolBindingRegistryInput<P> = Readonly<{
  /** Absent means every `register` answers `unavailable`. */
  verifier?: LocalToolContributionVerifier<P> | null
  /**
   * The identity of the fiber that is running the `register` call, or null when there is none. The
   * assembly supplies it (for Cordis, the uid of the author plugin fiber). A fiber identity is not
   * reused after the fiber ended.
   */
  fiber(): string | null
}>

/** What the Catalog reads of a live contribution: the entry row, the definition and the executor. */
export type ToolListing = Readonly<{
  entry: ToolBindingEntry
  definition: ToolDefinition
  executor: Adoption
}>

/** The catalog's read of the registry: the live listings that one tenant may access. */
export interface ToolListingSource<P> {
  listings(
    access: Access<P>,
  ): Outcome<readonly ToolListing[], Extract<ToolContributionFailure, { kind: 'unavailable' }>>
}

/** A hold of one call on one key. `release` is idempotent. */
export type ToolBindingPin = Readonly<{ release(): void }>

/**
 * The registry plus the three things that only this host's other parts use: `listings` for the
 * Catalog, `pin` for the resolution of a fixed request, and `retire` for the end of a fiber.
 */
export interface LocalToolBindingRegistry<P, E, B extends ContentBlock>
  extends ToolBindingRegistry<P, E, B>, ToolListingSource<P> {
  /** Holds `key` for `call` until the pin is released: `pins` and `drain` count it. */
  pin(key: ToolBindingKey, call: ToolCallId): Outcome<ToolBindingPin, ToolBindingKeyFailure>
  /** The fiber ended: withdraws its contributions and refuses its later registrations. */
  retire(fiber: string): void
}

type Row<E, B extends ContentBlock> = {
  readonly token: string
  readonly ordinal: string
  readonly fiber: string
  readonly digest: string
  readonly key: ToolBindingKey
  readonly loaded: ToolLoadedRegistration<E, B>
  readonly contribution: ToolContribution
  readonly pinned: Map<symbol, ToolCallId>
  state: 'live' | 'draining'
}

/** G7 access by layer. A workspace entry needs a grant that this host does not read: no access. */
function visibleTo(layer: SourceLayer, tenant: Access<unknown>['tenant']): boolean {
  switch (layer.kind) {
    case 'official':
      return true
    case 'organization':
      return layer.organization.text === tenant.organization.text
    case 'tenant':
      return sameSourceLayer(layer, { kind: 'tenant', tenant })
    case 'workspace':
      return false
    default: {
      const unreachable: never = layer
      return unreachable
    }
  }
}

const tenantUnreadable = fail({
  kind: 'unavailable',
  diagnostic: 'tenant eligibility is unavailable',
} as const)

/** Builds the registry of this process. */
export function createLocalToolBindingRegistry<
  P,
  E = unknown,
  B extends ContentBlock = ContentBlock,
>(input: LocalToolBindingRegistryInput<P>): LocalToolBindingRegistry<P, E, B> {
  const rows: Row<E, B>[] = []
  const retired = new Set<string>()
  let minted = 0

  const find = (key: ToolBindingKey): Row<E, B> | undefined =>
    rows.find(row => sameBindingKey(row.key, key))
  const remove = (token: string): boolean => {
    const index = rows.findIndex(row => row.token === token)
    if (index < 0) return false
    rows.splice(index, 1)
    return true
  }
  const visibleRows = (access: Access<P>): Row<E, B>[] | null =>
    tenantCodec.encode(access.tenant).ok
      ? rows.filter(row => visibleTo(row.key.layer, access.tenant))
      : null

  const register: ToolBindingRegistry<P, E, B>['register'] = request => {
    const verifier = input.verifier ?? null
    if (verifier === null)
      return fail({ kind: 'unavailable', diagnostic: 'no contribution verifier is injected' })
    const fiber = input.fiber()
    if (fiber === null || fiber === '')
      return fail({ kind: 'unavailable', diagnostic: 'the caller fiber is unknown' })
    if (retired.has(fiber))
      return fail({ kind: 'unavailable', diagnostic: 'the caller fiber has exited' })
    const access = { principal: request.principal, tenant: request.tenant }
    const verified = verifier.verify(request.authority)
    if ('failure' in verified) return verified
    const admitted = verifier.admits(access, verified.ok.layer)
    if ('failure' in admitted) return admitted
    const key: ToolBindingKey = { layer: verified.ok.layer, asset: verified.ok.asset }
    const { loaded } = request
    if (!sameBindingKey(loaded.key, key)) return fail({ kind: 'invalid', reason: 'key' })
    if (!sameShape(loaded.shape, shapeOf(loaded.definition)))
      return fail({ kind: 'invalid', reason: 'shape' })
    const digest = loaded.executor.digest
    const existing = find(key)
    if (existing !== undefined)
      return existing.fiber === fiber && existing.digest === digest
        ? succeed(existing.contribution)
        : fail({ kind: 'conflict' })
    minted += 1
    const token = randomUUID()
    const contribution: ToolContribution = Object.freeze({
      key,
      token,
      ordinal: String(minted),
      release: () => Object.freeze({ removed: remove(token) }),
    })
    rows.push({
      token,
      ordinal: contribution.ordinal,
      fiber,
      digest,
      key,
      loaded,
      contribution,
      pinned: new Map(),
      state: 'live',
    })
    return succeed(contribution)
  }

  const entryOf = (row: Row<E, B>): ToolBindingEntry =>
    Object.freeze({
      key: row.key,
      ordinal: row.ordinal,
      digest: row.digest,
      shape: row.loaded.shape,
      state: row.state,
      fiber: row.fiber,
    })

  const snapshot = (scope: ToolBindingScope<P>) => {
    if ('scope' in scope) return succeed(Object.freeze(rows.map(entryOf)))
    const visible = visibleRows(scope)
    return visible === null ? tenantUnreadable : succeed(Object.freeze(visible.map(entryOf)))
  }

  const drain = (key: ToolBindingKey): Outcome<ToolBindingDrain, ToolBindingKeyFailure> => {
    const row = find(key)
    if (row === undefined) return fail({ kind: 'unknown-key' })
    return succeed(
      Object.freeze({
        pins: String(row.pinned.size),
        inflight: Object.freeze([...new Set(row.pinned.values())]),
      }),
    )
  }

  const mark =
    (state: Row<E, B>['state']) =>
    (key: ToolBindingKey): Outcome<void, ToolBindingKeyFailure> => {
      const row = find(key)
      if (row === undefined) return fail({ kind: 'unknown-key' })
      row.state = state
      return succeed(undefined)
    }

  return Object.freeze({
    register,
    snapshot,
    pins: key => {
      const row = find(key)
      return row === undefined ? fail({ kind: 'unknown-key' }) : succeed(String(row.pinned.size))
    },
    close: mark('draining'),
    reopen: mark('live'),
    drain,
    listings: access => {
      const visible = visibleRows(access)
      return visible === null
        ? tenantUnreadable
        : succeed(
            Object.freeze(
              visible.map(row =>
                Object.freeze({
                  entry: entryOf(row),
                  definition: row.loaded.definition,
                  executor: row.loaded.executor,
                }),
              ),
            ),
          )
    },
    pin: (key, call) => {
      const row = find(key)
      if (row === undefined) return fail({ kind: 'unknown-key' })
      const hold = Symbol('pin')
      row.pinned.set(hold, call)
      return succeed(Object.freeze({ release: () => void row.pinned.delete(hold) }))
    },
    retire: fiber => {
      retired.add(fiber)
      // `release` changes `rows`: pick the fiber's rows first.
      for (const row of rows.filter(candidate => candidate.fiber === fiber))
        row.contribution.release()
    },
  } satisfies LocalToolBindingRegistry<P, E, B>)
}
