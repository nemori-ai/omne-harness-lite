import type {
  AdmissionFailure,
  AdmissionHost,
  AdmissionResult,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
} from '../dist/index.js'
import { createAdmissionCoordinator } from '../dist/index.js'
import { describe, expect, it } from 'vitest'
import { ControlledWriter, RecordingDiagnostics, preparedCommit } from './fixtures.js'

const DENIED: AdmissionFailure = Object.freeze({
  status: 'denied',
  owner: 'measured-owner',
  code: 'not_currently_eligible',
})

function prepare(
  host: AdmissionHost,
  operationId: string,
  publication: OwnerPublication,
  expectedRevision = '0',
): PreparedAdmission {
  return Object.freeze({
    composition: 'action_execution',
    commit: preparedCommit(
      host.coordinator,
      operationId,
      [publication.owner],
      [],
      expectedRevision,
    ),
    publications: Object.freeze([publication]),
    uses: Object.freeze([]),
  })
}

function pending(result: AdmissionResult): PendingAdmission {
  if (result.status !== 'pending_durability')
    throw new Error(`expected pending, got ${result.status}`)
  return result
}

describe('composition names declared by published composition contracts', () => {
  const publication: OwnerPublication = Object.freeze({
    owner: 'records-owner',
    publishLogical: () => undefined,
    publishDurable: () => undefined,
  })

  function withComposition(
    host: AdmissionHost,
    operationId: string,
    composition: unknown,
    expectedRevision = '0',
  ): PreparedAdmission {
    return Object.freeze({
      composition: composition as PreparedAdmission['composition'],
      commit: preparedCommit(
        host.coordinator,
        operationId,
        [publication.owner],
        [],
        expectedRevision,
      ),
      publications: Object.freeze([publication]),
      uses: Object.freeze([]),
    })
  }

  it('accepts every well-formed name without holding a list of them', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const declared = [
      'take_batch',
      'run_settle',
      'session_archive',
      'reacquire',
      'a',
      'x'.repeat(64),
    ]

    declared.forEach((composition, index) => {
      const prepared = withComposition(host, `declared-${composition}`, composition, String(index))
      const result = host.coordinator.enter(frame => host.coordinator.submit(frame, prepared))
      expect(result.status).toBe('pending_durability')
    })
    expect(writer.commitInputs).toHaveLength(declared.length)
    expect(host.coordinator.status().phase).toBe('open')
  })

  it('rejects malformed names before ranking and keeps the coordinator open', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const malformed: readonly unknown[] = [
      '',
      'Run_Settle',
      '9lives',
      'run-settle',
      'run settle',
      '_private',
      'x'.repeat(65),
      undefined,
      null,
      7,
      Symbol('composition'),
    ]

    for (const composition of malformed) {
      const prepared = withComposition(host, 'malformed', composition)
      const result = host.coordinator.enter(frame => host.coordinator.submit(frame, prepared))
      expect(result).toMatchObject({
        status: 'unavailable',
        owner: 'admission',
        code: 'invalid_snapshot',
      })
    }
    expect(writer.commitInputs).toHaveLength(0)
    expect(host.coordinator.status().phase).toBe('open')
  })
})

describe('A08 owner-policy measurements through the common coordinator', () => {
  it('orders call n before revoke n+1 while the revoke immediately closes n+2 admission', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let logicallyAllowed = true
    let durablyAllowed = true
    let effects = 0
    const call = prepare(host, 'call-n', {
      owner: 'authorization-owner',
      publishLogical: () => undefined,
      publishDurable: () => undefined,
    })
    const revoke = prepare(
      host,
      'revoke-n-plus-one',
      {
        owner: 'authorization-owner',
        publishLogical: () => {
          logicallyAllowed = false
          return undefined
        },
        publishDurable: () => {
          durablyAllowed = false
          return undefined
        },
      },
      '1',
    )

    const callResult = pending(
      host.coordinator.enter(frame => host.coordinator.submit(frame, call)),
    )
    const revokeResult = pending(
      host.coordinator.enter(frame => host.coordinator.submit(frame, revoke)),
    )
    const later: AdmissionResult = host.coordinator.enter(frame =>
      logicallyAllowed
        ? host.coordinator.submit(frame, prepare(host, 'call-n-plus-two', call.publications[0]))
        : DENIED,
    )

    expect(later).toBe(DENIED)
    expect(durablyAllowed).toBe(true)
    expect(effects).toBe(0)

    writer.settle(0)
    const admitted = await callResult.completion
    if (admitted.status === 'committed' && admitted.publication === 'ready') effects += 1
    expect(effects).toBe(1)
    expect(durablyAllowed).toBe(true)

    writer.settle(1)
    await revokeResult.completion
    expect(durablyAllowed).toBe(false)
  })

  it('does not use a pending grant until its owner publishes the durable view', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let durableGrant = false
    const grant = prepare(host, 'grant', {
      owner: 'authorization-owner',
      publishLogical: () => undefined,
      publishDurable: () => {
        durableGrant = true
        return undefined
      },
    })
    const grantResult = pending(
      host.coordinator.enter(frame => host.coordinator.submit(frame, grant)),
    )

    const beforeDurable: AdmissionResult = host.coordinator.enter(() =>
      durableGrant ? { status: 'unavailable', owner: 'test', code: 'unexpected' } : DENIED,
    )
    expect(beforeDurable).toBe(DENIED)

    writer.settle(0)
    await grantResult.completion
    expect(durableGrant).toBe(true)

    const call = prepare(
      host,
      'after-grant',
      {
        owner: 'authorization-owner',
        publishLogical: () => undefined,
        publishDurable: () => undefined,
      },
      '1',
    )
    const afterDurable = host.coordinator.enter(frame =>
      durableGrant ? host.coordinator.submit(frame, call) : DENIED,
    )
    expect(afterDurable.status).toBe('pending_durability')
  })

  it('lets owner publications consume one budget/decision once and duplicate admission only recognizes the ticket', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let remaining = 1
    let decisionAvailable = true
    const value = prepare(host, 'consume-once', {
      owner: 'budget-decision-owner',
      publishLogical: () => {
        remaining -= 1
        decisionAvailable = false
        return undefined
      },
      publishDurable: () => undefined,
    })

    const first = pending(host.coordinator.enter(frame => host.coordinator.submit(frame, value)))
    const retry = pending(host.coordinator.enter(frame => host.coordinator.submit(frame, value)))
    const another: AdmissionResult = host.coordinator.enter(() =>
      remaining > 0 && decisionAvailable
        ? { status: 'unavailable', owner: 'test', code: 'unexpected' }
        : DENIED,
    )

    expect(retry).toBe(first)
    expect(remaining).toBe(0)
    expect(decisionAvailable).toBe(false)
    expect(another).toBe(DENIED)
  })
})
