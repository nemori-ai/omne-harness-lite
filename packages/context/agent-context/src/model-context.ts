// agentModelContext (AG-13): reads the model-readable Runtime Context for one execution attachment.
// The block material of the latest full read stays in this process; a read after it is lost is a
// full read. The evidence it hands out names its execution in its key, so a later instance can tell
// whose it is, but only the minting instance can resolve it to material.
import type { Failure, ModelContextRead, ModelContextReader } from '@omne-harness/agent-contract'
import { succeed, fail } from '@omne-harness/operation-result'
import type {
  Access,
  BlockMaterial,
  ContextReadGroup,
  ContextTarget,
  SnapshotMaterial,
} from '@omne-harness/request-context-contract'
import type { ContextHolderParts } from '@omne-harness/request-context-cordis-contract'
import type {
  ChangesResult,
  ContextReader,
  EligibilityId,
  PerRequestEntry,
  ReaderEligibilityHandoff,
  ReaderOperations,
  SnapshotResult,
} from '@omne-harness/runtime-context-contract'
import type { ContextMaterials, LatestRead, Place } from './materials.ts'
import { digest, tenantText } from './records.ts'
import { failureOfRead, recipientText, unavailable } from './translate.ts'

export type AgentModelContextOptions<P> = Readonly<{
  materials: ContextMaterials<P>
  /** From the leased holder parts: the history resolution and the narrow adoption source. */
  parts: Pick<ContextHolderParts<P>, 'resolveHistory' | 'adopted'>
  /** The reader eligibility handoff of the scope holder (K-RC). */
  eligibility: ReaderEligibilityHandoff<P>
  /** The Runtime Context reader face, bound to the model consumer class. */
  runtimeContext: ReaderOperations
}>

type ReadInput<P> = Parameters<ModelContextReader<P>['read']>[0]
type Answer<T> = Readonly<{ ok: T }> | Readonly<{ failure: Failure }>
type Read = SnapshotResult | ChangesResult

const RC = 'runtime-context'

/** The answer of a read that gave no material: never a success and never an older value. */
function failureOfReadOutcome(read: Exclude<Read, { kind: 'success' }>): Failure {
  switch (read.kind) {
    case 'refused':
      return read.reason === 'unauthorized'
        ? { kind: 'denied', action: 'read-runtime-context' }
        : unavailable(read.reason, RC)
    case 'missing':
      return unavailable('required-block-missing', RC)
    case 'unknown':
      return unavailable(read.cause, RC)
    case 'cursor-invalidated':
      return unavailable('cursor-invalidated', RC)
  }
}

/** The per-request blocks with a value; a missing or unknown one fails the read. */
function perRequestOf(entries: readonly PerRequestEntry[]): Answer<readonly BlockMaterial[]> {
  const blocks: BlockMaterial[] = []
  for (const entry of entries) {
    if (entry.kind === 'none') continue
    if (entry.kind !== 'value') return { failure: unavailable(`per-request-${entry.kind}`, RC) }
    blocks.push({
      key: entry.key,
      revision: entry.evidence.revision,
      value: entry.value,
      previous: null,
      volatility: 'per-request',
    })
  }
  return { ok: blocks }
}

export function createAgentModelContext<P>(
  options: AgentModelContextOptions<P>,
): ModelContextReader<P> {
  const { materials, parts, eligibility, runtimeContext } = options

  async function current(access: Access<P>, target: ContextTarget): Promise<Answer<EligibilityId>> {
    const handed = await eligibility.current({
      principal: access.principal,
      tenant: access.tenant,
      scope: target.scope,
      consumer: 'model',
    })
    switch (handed.kind) {
      case 'current':
        return { ok: handed.eligibility }
      case 'absent':
        return { failure: unavailable('eligibility-absent', 'runtime-context-holder') }
      case 'refused':
        return { failure: { kind: 'denied', action: 'read-eligibility' } }
      case 'unknown':
        return { failure: unavailable('eligibility-unknown', 'runtime-context-holder') }
      case 'unavailable':
        return { failure: unavailable(handed.diagnostic, 'runtime-context-holder') }
    }
  }

  /**
   * The reader of the current eligibility: the kept one when the eligibility did not change, else a
   * new bind. A bind refused as unauthorized means the eligibility was replaced; the handoff is
   * asked once more, and a second refusal is the answer.
   */
  async function readerOf(
    access: Access<P>,
    target: ContextTarget,
    latest: LatestRead | undefined,
  ): Promise<Answer<Readonly<{ reader: ContextReader; eligibility: EligibilityId }>>> {
    let id = await current(access, target)
    if ('failure' in id) return id
    if (latest !== undefined && latest.eligibility.eligibility === id.ok.eligibility)
      return { ok: { reader: latest.reader, eligibility: id.ok } }
    let bound = await runtimeContext.bind(id.ok)
    if (bound.kind === 'refused' && bound.reason === 'unauthorized') {
      const again = await current(access, target)
      if ('failure' in again) return again
      if (again.ok.eligibility !== id.ok.eligibility) {
        id = again
        bound = await runtimeContext.bind(again.ok)
      }
    }
    switch (bound.kind) {
      case 'bound':
        return { ok: { reader: bound.reader, eligibility: id.ok } }
      case 'refused':
        return {
          failure:
            bound.reason === 'unauthorized'
              ? { kind: 'denied', action: 'read-runtime-context' }
              : unavailable(bound.reason, RC),
        }
      case 'unknown':
        return { failure: unavailable(bound.cause, RC) }
    }
  }

  /** True when the adopted coverage is the one the narrow adoption source holds as fixed now. */
  async function adoptedHolds(input: ReadInput<P>, target: ContextTarget): Promise<boolean> {
    if (input.adopted === null) return false
    const access = { principal: input.principal, tenant: input.tenant }
    const fact = await parts.adopted.readSource({ access, target })
    return (
      fact.kind === 'value' &&
      fact.value !== null &&
      digest(fact.value.coverage) === input.adopted.digest
    )
  }

  function snapshotOf(read: Extract<SnapshotResult, { kind: 'success' }>, id: EligibilityId) {
    const material: SnapshotMaterial = {
      scope: read.value.scope,
      eligibility: id,
      revision: read.value.viewRevision,
      blocks: read.value.blocks.flatMap(block =>
        block.state.kind === 'value'
          ? [
              {
                key: block.key,
                revision: block.revision,
                value: block.state.value,
                previous: null,
                volatility: block.volatility,
              },
            ]
          : [],
      ),
    }
    return material
  }

  /**
   * The checks on the evidence this owner minted, before any read. Evidence names its tenant, so a
   * foreign one is denied. The adopted coverage must be ours and belong to this execution.
   */
  function evidenceRefusal(input: ReadInput<P>, tenant: string): Failure | null {
    for (const evidence of [input.adopted, input.transition]) {
      const key = evidence === null ? null : materials.key(evidence)
      if (key !== null && key.tenant !== tenant) return { kind: 'denied', action: 'read' }
    }
    if (input.adopted === null) return null
    const key = materials.key(input.adopted)
    if (key === null) return { kind: 'invalid', field: 'adopted', reason: 'foreign-evidence' }
    return key.execution === input.advance.execution
      ? null
      : { kind: 'invalid', field: 'adopted', reason: 'other-execution' }
  }

  async function read(input: ReadInput<P>): ReturnType<ModelContextReader<P>['read']> {
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const tenant = tenantText(input.tenant)
    if (tenant === null) return fail({ kind: 'denied', action: 'read' })
    const refused = evidenceRefusal(input, tenant)
    if (refused !== null) return fail(refused)
    const resolved = await parts.resolveHistory({ access, evidence: input.history })
    if (resolved.kind !== 'value')
      return fail(failureOfRead(resolved, 'history-holder', 'resolve-history'))
    const target = resolved.value.target
    if (tenantText(target.tenant) !== tenant) return fail({ kind: 'denied', action: 'read' })
    const place: Place = {
      tenant,
      scope: target.scope.ref,
      execution: input.advance.execution,
      attachment: input.advance.executionAttachment,
    }
    const latest = materials.latest(place)
    const reader = await readerOf(access, target, latest)
    if ('failure' in reader) return fail(reader.failure)
    const recipient = recipientText(input.recipient)
    const incremental =
      latest !== undefined &&
      latest.reader === reader.ok.reader &&
      latest.recipient === recipient &&
      input.transition === null &&
      (await adoptedHolds(input, target))
    const taken = await take(reader.ok, incremental ? latest : undefined)
    if ('failure' in taken) {
      // A reader that no entry holds ends here; a kept one stays with its entry.
      if (latest?.reader !== reader.ok.reader) void reader.ok.reader.end().catch(() => undefined)
      if (taken.ended) materials.dropScope(tenant, target.scope.ref)
      return fail(taken.failure)
    }
    const { group, cursor, content } = taken.ok
    materials.setLatest(place, {
      eligibility: reader.ok.eligibility,
      reader: reader.ok.reader,
      cursor,
      snapshot: group.snapshot,
      recipient,
    })
    const source = materials.mint('read-source', place, group.snapshot)
    const coverage = materials.mint('read-coverage', place, { read: group.read, recipient })
    const contextRead: ContextReadGroup = {
      scope: target.scope,
      recipient,
      read: group.read,
      snapshot: group.snapshot,
      perRequest: group.perRequest,
      source,
      coverage,
    }
    materials.putRead(source, {
      place,
      target,
      history: resolved.value,
      group: contextRead,
      transition: input.transition,
    })
    const result: ModelContextRead = { recipient: input.recipient, content, source, coverage }
    return succeed(result)
  }

  type Taken = Readonly<{
    group: Readonly<{
      read: Read
      snapshot: SnapshotMaterial
      perRequest: readonly BlockMaterial[]
    }>
    cursor: LatestRead['cursor']
    content: ModelContextRead['content']
  }>

  /** An incremental read from the kept material when there is one, else a full read. */
  async function take(
    bound: Readonly<{ reader: ContextReader; eligibility: EligibilityId }>,
    kept: LatestRead | undefined,
  ): Promise<Readonly<{ ok: Taken }> | Readonly<{ failure: Failure; ended: boolean }>> {
    if (kept !== undefined) {
      const changes = await bound.reader.changes(kept.cursor)
      if (changes.kind === 'success') {
        const perRequest = perRequestOf(changes.value.perRequest)
        if ('failure' in perRequest) return { failure: perRequest.failure, ended: false }
        return {
          ok: {
            group: { read: changes, snapshot: kept.snapshot, perRequest: perRequest.ok },
            cursor: changes.value.cursor,
            content: 'incremental',
          },
        }
      }
      if (changes.kind !== 'cursor-invalidated') return refusal(changes)
    }
    const snapshot = await bound.reader.snapshot()
    if (snapshot.kind !== 'success') return refusal(snapshot)
    const perRequest = perRequestOf(snapshot.value.perRequest)
    if ('failure' in perRequest) return { failure: perRequest.failure, ended: false }
    return {
      ok: {
        group: {
          read: snapshot,
          snapshot: snapshotOf(snapshot, bound.eligibility),
          perRequest: perRequest.ok,
        },
        cursor: snapshot.value.cursor,
        content: 'full',
      },
    }
  }

  function refusal(read: Exclude<Read, { kind: 'success' }>) {
    return {
      failure: failureOfReadOutcome(read),
      ended: read.kind === 'refused' && read.reason === 'scope-ended',
    }
  }

  return { read }
}
