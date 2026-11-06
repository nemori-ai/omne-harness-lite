import { afterEach, expect, it } from 'vitest'
import type { DomainRef, ReceiptV2 } from '@omne-harness/sql-contract'
import { identity, json } from '../src/encoding.ts'
import { mutationSchema } from '../src/schema.ts'
import { receiptResult } from '../src/results.ts'
import { openWorld } from './world.ts'
import { ownerSources } from './sources.ts'

const domain: DomainRef = {
  scope: { kind: 'tenant', tenant: 'tenant-a' },
  transactionDomain: 'assets',
}
const operations = [
  {
    kind: 'hold',
    operationId: 'old-hold',
    holdingRef: 'holding-a',
    scopeRef: 'tenant-a',
    assetRef: 'asset-a',
    selection: { kind: 'follow' },
    sourceIds: ['tenant'],
    grants: [],
  },
  {
    kind: 'changeHolding',
    operationId: 'old-sources',
    holdingRef: 'holding-a',
    scopeRef: 'tenant-a',
    expectedRevision: 1,
    change: { kind: 'updateSources', sourceIds: ['tenant'], grants: [] },
  },
]
function receipt(
  command: (typeof operations)[number],
  rejected: boolean,
  currentDomain = domain,
): ReceiptV2 {
  const common = {
    identity: identity(currentDomain, command.operationId),
    inputDigest: 'a'.repeat(64),
    combinationVersion: 'old-combination',
    manifestDigest: 'b'.repeat(64),
  }
  const payload = json({
    binding: { domain: currentDomain, command },
    result: rejected
      ? { kind: 'rejected', reason: 'holding_exists' }
      : { kind: 'committed', operationId: command.operationId, revision: 1, changed: true },
  })
  return rejected
    ? {
        ...common,
        kind: 'rolled_back',
        responses: [
          {
            participant: 'assets.settings',
            protocol: 'assets-local/1',
            reply: { kind: 'conflict', basis: payload },
          },
        ],
      }
    : {
        ...common,
        kind: 'committed',
        responses: [
          {
            participant: 'assets.settings',
            protocol: 'assets-local/1',
            reply: { kind: 'participated', response: payload },
          },
        ],
      }
}
const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
it.each(operations)(
  'recovers historical $kind results through the public owner query without accepting historical commands',
  async command => {
    let rejected = false
    const world = await openWorld({
      ownerWrap: storage => ({
        ...storage,
        async query(request) {
          return receipt(command, rejected, {
            scope: request.scope,
            transactionDomain: request.transactionDomain,
          })
        },
      }),
    })
    worlds.push(world)
    expect(await world.owner.getOperation(command.operationId)).toEqual({
      kind: 'committed',
      operationId: command.operationId,
      revision: 1,
      changed: true,
    })
    rejected = true
    expect(await world.owner.getOperation(command.operationId)).toEqual({
      kind: 'rejected',
      reason: 'holding_exists',
    })
    expect(mutationSchema.safeParse(command).success).toBe(false)
  },
)
it.each(operations)(
  'keeps exact operation conflict and binding checks for historical $kind',
  command => {
    const recorded = receipt(command, false)
    const { sourceIds: _ids, change, ...fields } = command
    const current = mutationSchema.parse(
      command.kind === 'hold'
        ? { ...fields, sources: ownerSources('tenant') }
        : {
            ...fields,
            change: {
              kind: 'updateSources',
              sources: ownerSources('tenant'),
              grants: change?.grants,
            },
          },
    )
    expect(receiptResult(recorded, domain, command.operationId, current)).toEqual({
      kind: 'rejected',
      reason: 'operation_conflict',
    })
    expect(
      receiptResult(
        recorded,
        { ...domain, scope: { kind: 'tenant', tenant: 'foreign' } },
        command.operationId,
      ),
    ).toEqual({ kind: 'unknown', operationId: command.operationId })
    const malformed =
      command.kind === 'hold'
        ? { ...command, sourceIds: ['tenant', 'tenant'] }
        : { ...command, change: { ...command.change, sourceIds: ['tenant', 'tenant'] } }
    expect(receiptResult(receipt(malformed, false), domain, command.operationId)).toEqual({
      kind: 'unknown',
      operationId: command.operationId,
    })
  },
)
