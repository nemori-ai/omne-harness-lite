import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialInstant,
  type ToolMaterialClock,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import type { ToolOffloadingConfiguration } from './construction.ts'
import { mintEvidence } from './evidence.ts'
import {
  bodyPosition,
  bodyUnavailable,
  type BodyReadInput,
  type BodyProjection,
  type StoredBody,
} from './ledger-body-page.ts'
import type { Decision, Mint, Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import { sampleMaterialTime } from './ledger-material-custody.ts'
import { materialExpirationWrites } from './ledger-material-expiration.ts'
import type { MaterialUseRecord } from './ledger-material-records.ts'
import type { LedgerWrite, ResultRecord } from './ledger-store.ts'
import { textBodyCodec } from './text-body-codec.ts'
import { resultRecord } from './ledger-reads.ts'

type Lease = Extract<MaterialUseRecord, { kind: 'page-lease' }>
export type BodyGrant = Readonly<{
  body: StoredBody
  lease: Lease
  position: Readonly<{ offset: string; scope: string }>
}>

export function bodyReply<T>(outcome: Outcome<T, ToolFailure>): Decision<Outcome<T, ToolFailure>> {
  return { kind: 'reply', outcome: succeed(outcome) }
}

function locatedBody<P>(
  snapshot: Snapshot,
  input: BodyReadInput<P>,
): Outcome<Readonly<{ body: StoredBody; result: ResultRecord }>, ToolFailure> {
  const result = resultRecord(snapshot, input.result)
  if ('failure' in result) return result
  const original = result.ok.value.original
  if (original.kind !== 'offloaded' || original.body.description.bodyId !== input.bodyId)
    return fail({ kind: 'not-found', target: 'body', reason: 'missing' })
  return succeed({ body: original.body, result: result.ok })
}

function materialIsSealed(snapshot: Snapshot, body: StoredBody): boolean {
  return [...snapshot.materials.values()].some(
    record =>
      record.purpose === 'body' &&
      record.state.kind === 'sealed' &&
      sameFactValue(record.state.seal, body.seal),
  )
}

export async function admitBodyPage<P>(
  snapshot: Snapshot,
  mint: Mint,
  input: BodyReadInput<P>,
  policy: ToolOffloadingConfiguration,
  clock: ToolMaterialClock,
  projection: BodyProjection,
): Promise<Decision<Outcome<BodyGrant, ToolFailure>>> {
  const located = locatedBody(snapshot, input)
  if ('failure' in located) return bodyReply(located)
  const { body } = located.ok
  const expired = fail({ kind: 'not-found', target: 'body', reason: 'expired' } as const)
  if (snapshot.bodyExpirations.has(JSON.stringify([input.result, input.bodyId])))
    return bodyReply(expired)
  if (
    !sameFactValue(body.seal.codec, textBodyCodec) ||
    (body.description.representation.kind !== 'text' &&
      body.description.representation.kind !== 'json-document')
  )
    return bodyReply(
      fail({
        kind: 'unsupported',
        adoption: body.seal.codec,
        reason: 'supported UTF-8 body codec required',
      }),
    )
  const use = snapshot.materialUses.get(`body:${input.bodyId}`)
  if (
    use?.kind !== 'offloaded-body' ||
    use.result !== input.result ||
    use.bodyId !== input.bodyId ||
    !sameFactValue(use.material, body.seal.material) ||
    use.expiresAt !== body.description.retention.expiresAt ||
    body.description.bodyBytes !== body.seal.bytes ||
    !materialIsSealed(snapshot, body)
  )
    return bodyReply(bodyUnavailable('body association or material custody is inconsistent'))
  const position = bodyPosition(input, body, projection)
  if ('failure' in position) return bodyReply(position)
  const sampled = await sampleMaterialTime(clock, snapshot.materialTime)
  if ('failure' in sampled) return bodyReply(sampled)
  const timeWrite: LedgerWrite = {
    kind: 'put',
    record: { kind: 'material-time', time: { highWatermark: sampled.ok } },
  }
  if (Date.parse(sampled.ok) >= Date.parse(use.expiresAt)) {
    const basis = mintEvidence(
      'body-expiration',
      { tenant: input.tenant, call: input.call, result: input.result },
      mint.revision,
      { body: input.bodyId, time: sampled.ok },
    )
    return {
      kind: 'commit',
      value: expired,
      writes: [
        timeWrite,
        ...materialExpirationWrites({
          use,
          time: sampled.ok,
          basis,
          cleanupExists: snapshot.materialCleanup.has(use.writeOperation),
        }),
      ],
    }
  }
  const end = Date.parse(sampled.ok) + policy.maxPageLeaseMs
  if (!Number.isSafeInteger(end) || Math.abs(end) > 8_640_000_000_000_000)
    return bodyReply(invalid('offloading.maxPageLeaseMs', 'deadline-overflow'))
  const deadline = decodeToolMaterialInstant(new Date(end).toISOString())
  if ('failure' in deadline)
    return bodyReply(invalid('offloading.maxPageLeaseMs', 'deadline-overflow'))
  const lease: Lease = {
    kind: 'page-lease',
    id: `page-lease:${mint.revision}`,
    material: use.material,
    result: input.result,
    bodyId: input.bodyId,
    writeOperation: use.writeOperation,
    admittedAt: sampled.ok,
    expiresAt: deadline.ok,
    basis: mintEvidence(
      'page-lease',
      { tenant: input.tenant, call: input.call, result: input.result },
      mint.revision,
      { body: input.bodyId, expiresAt: deadline.ok },
    ),
  }
  return {
    kind: 'commit',
    value: succeed({ body, lease, position: position.ok }),
    writes: [timeWrite, { kind: 'put', record: { kind: 'material-use', use: lease } }],
  }
}

export async function finishBodyPage<P, T>(
  snapshot: Snapshot,
  input: BodyReadInput<P>,
  grant: BodyGrant,
  outcome: Outcome<T, ToolFailure>,
  clock: ToolMaterialClock,
): Promise<Decision<Outcome<T, ToolFailure>>> {
  const current = locatedBody(snapshot, input)
  if ('failure' in current) return bodyReply(current)
  const lease = snapshot.materialUses.get(grant.lease.id)
  if (
    !sameFactValue(current.ok.body, grant.body) ||
    lease?.kind !== 'page-lease' ||
    !sameFactValue(lease, grant.lease) ||
    !materialIsSealed(snapshot, grant.body)
  )
    return bodyReply(bodyUnavailable('body or page lease changed during read'))
  const sampled = await sampleMaterialTime(clock, snapshot.materialTime)
  if ('failure' in sampled) return bodyReply(sampled)
  return {
    kind: 'commit',
    value:
      Date.parse(sampled.ok) < Date.parse(lease.expiresAt)
        ? outcome
        : bodyUnavailable('page lease expired'),
    writes: [
      { kind: 'delete', key: `material-use:${lease.id}` },
      { kind: 'put', record: { kind: 'material-time', time: { highWatermark: sampled.ok } } },
    ],
  }
}
