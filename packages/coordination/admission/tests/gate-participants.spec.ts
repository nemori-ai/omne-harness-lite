import type { OwnerPublication, PreparedAdmission } from '../dist/index.js'
import { createAdmissionCoordinator } from '../dist/index.js'
import type { Position } from '@omne-harness-lite/records'
import { describe, expect, it, vi } from 'vitest'
import {
  ControlledWriter,
  RecordingDiagnostics,
  operation,
  operationInput,
  preparedCommit,
  turn,
  unwrap,
} from './fixtures.js'

function publication(
  owner: string,
  logical: (position: Position) => undefined = () => undefined,
  durable: (position: Position) => undefined = () => undefined,
): OwnerPublication {
  return {
    owner,
    publishLogical: position => logical(position),
    publishDurable: receipt => durable(receipt.position),
  }
}

function admission(
  commit: PreparedAdmission['commit'],
  publications: readonly OwnerPublication[],
  uses: PreparedAdmission['uses'] = [],
): PreparedAdmission {
  return { composition: 'action_execution', commit, publications, uses }
}

describe('CC-02/03 synchronous admission gate', () => {
  it('proxies pure preparation and invalidates each frame at stack exit', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const prepared = unwrap(
      host.coordinator.prepareOperation(operation('prepare'), operationInput()),
    )
    let captured: Parameters<typeof host.coordinator.lookupPrepared>[0] | undefined

    const lookup = host.coordinator.enter(frame => {
      captured = frame
      return host.coordinator.lookupPrepared(frame, prepared)
    })

    expect(lookup).toEqual({ status: 'not_seen' })
    expect(captured).toBeDefined()
    expect(host.coordinator.lookupPrepared(captured!, prepared)).toEqual({
      status: 'unavailable',
      owner: 'admission',
      code: 'invalid_frame',
    })
    expect(host.coordinator.status().phase).toBe('quarantined')
    expect(writer.quarantines).toHaveLength(1)
  })

  it('rejects reentry and thenables, observes late rejection, and starts no writer I/O in-stack', async () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(writer, diagnostics)

    expect(() => host.coordinator.enter(() => host.coordinator.enter(() => undefined))).toThrow(
      /reentrant/i,
    )
    expect(host.coordinator.status().phase).toBe('quarantined')

    const secondWriter = new ControlledWriter()
    const secondDiagnostics = new RecordingDiagnostics()
    const second = createAdmissionCoordinator(secondWriter, secondDiagnostics)
    const late = Promise.reject(new Error('late gate rejection'))
    expect(() => second.coordinator.enter(() => late)).toThrow(/thenable/i)
    await turn()

    expect(second.coordinator.status().phase).toBe('quarantined')
    expect(secondDiagnostics.points.some(point => point.phase === 'late_rejection')).toBe(true)
    expect(secondWriter.pumpStarts).toBe(0)
  })

  it('emits diagnostics only after the frame is closed and preserves a normal assembly failure', () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(writer, diagnostics)
    let reentered = false
    diagnostics.onLog = () => {
      reentered = host.coordinator.enter(() => true)
    }
    const commit = preparedCommit(host.coordinator, 'participants', ['alpha', 'beta'])

    const result = host.coordinator.enter(frame =>
      host.coordinator.submit(frame, admission(commit, [publication('alpha')])),
    )

    expect(result).toEqual({
      status: 'unavailable',
      owner: 'admission',
      code: 'invalid_participants',
    })
    expect(reentered).toBe(true)
    expect(host.coordinator.status().phase).toBe('open')
    expect(writer.commitInputs).toHaveLength(0)
  })
})

describe('R1 immutable participant snapshots', () => {
  it('requires the publication owner set to equal PreparedCommit.owners exactly once', () => {
    const cases: readonly OwnerPublication[][] = [
      [publication('alpha')],
      [publication('alpha'), publication('beta'), publication('extra')],
      [publication('alpha'), publication('alpha')],
      [],
    ]
    for (const publications of cases) {
      const writer = new ControlledWriter()
      const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
      const commit = preparedCommit(host.coordinator, 'owners', ['alpha', 'beta'])
      const result = host.coordinator.enter(frame =>
        host.coordinator.submit(frame, admission(commit, publications)),
      )
      expect(result).toMatchObject({ status: 'unavailable', code: 'invalid_participants' })
      expect(writer.commitInputs).toHaveLength(0)
    }
  })

  it('matches every required use by record owner and complete issued binding tuple', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const issuer = host.createUseIssuer('execution-owner')
    const exact = issuer.capture(
      { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
      { retainAt: () => undefined, release: async () => ({ status: 'released' }) },
    )
    const requirement = Object.freeze({ recordOwner: 'records-owner', binding: exact.binding })
    const commit = preparedCommit(host.coordinator, 'uses', ['records-owner'], [requirement])

    const missing = host.coordinator.enter(frame =>
      host.coordinator.submit(frame, admission(commit, [publication('records-owner')])),
    )
    expect(missing).toMatchObject({ status: 'unavailable', code: 'invalid_use' })
    expect(writer.commitInputs).toHaveLength(0)

    const foreignHost = createAdmissionCoordinator(
      new ControlledWriter(),
      new RecordingDiagnostics(),
    )
    const foreign = foreignHost
      .createUseIssuer('execution-owner')
      .capture(
        { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
        { retainAt: () => undefined, release: async () => ({ status: 'released' }) },
      )
    const forged = host.coordinator.enter(frame =>
      host.coordinator.submit(frame, admission(commit, [publication('records-owner')], [foreign])),
    )
    expect(forged).toMatchObject({ status: 'unavailable', code: 'invalid_use' })
    expect(writer.commitInputs).toHaveLength(0)
  })

  it('captures arrays, descriptors, bindings, and callback references without retaining mutable children', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const issuer = host.createUseIssuer('execution-owner')
    const binding = { resourceId: 'resource', generation: 'generation', epoch: 'epoch' }
    const retained = vi.fn(() => undefined)
    const replacementRetained = vi.fn(() => undefined)
    const released = vi.fn(async () => ({ status: 'released' as const }))
    const callbacks = { retainAt: retained, release: released }
    const exact = issuer.capture(binding, callbacks)
    const commit = preparedCommit(
      host.coordinator,
      'snapshot',
      ['records-owner'],
      [{ recordOwner: 'records-owner', binding: exact.binding }],
    )
    const originalLogical = vi.fn(() => undefined)
    const originalDurable = vi.fn(() => undefined)
    const replacementDurable = vi.fn(() => undefined)
    const descriptor = {
      owner: 'records-owner',
      publishLogical: originalLogical,
      publishDurable: originalDurable,
    }
    const publications = [descriptor]
    const uses = [exact]

    const result = host.coordinator.enter(frame =>
      host.coordinator.submit(frame, {
        composition: 'action_execution',
        commit,
        publications,
        uses,
      }),
    )
    expect(result.status).toBe('pending_durability')

    binding.resourceId = 'changed'
    callbacks.retainAt = replacementRetained
    descriptor.owner = 'changed'
    descriptor.publishDurable = replacementDurable
    publications.length = 0
    uses.length = 0
    writer.settle(0)
    await turn()

    expect(exact.binding).toEqual({
      owner: 'execution-owner',
      resourceId: 'resource',
      generation: 'generation',
      epoch: 'epoch',
    })
    expect(retained).toHaveBeenCalledOnce()
    expect(replacementRetained).not.toHaveBeenCalled()
    expect(originalLogical).toHaveBeenCalledOnce()
    expect(originalDurable).toHaveBeenCalledOnce()
    expect(replacementDurable).not.toHaveBeenCalled()
  })

  it('rejects accessors without invoking them', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const commit = preparedCommit(host.coordinator, 'accessor', ['owner'])
    const ownerGetter = vi.fn(() => 'owner')
    const descriptor = {
      publishLogical: () => undefined,
      publishDurable: () => undefined,
    }
    Object.defineProperty(descriptor, 'owner', { enumerable: true, get: ownerGetter })

    const result = host.coordinator.enter(frame =>
      host.coordinator.submit(frame, {
        composition: 'action_execution',
        commit,
        publications: [descriptor as unknown as OwnerPublication],
        uses: [],
      }),
    )

    expect(result).toMatchObject({ status: 'unavailable', code: 'invalid_snapshot' })
    expect(ownerGetter).not.toHaveBeenCalled()
    expect(writer.commitInputs).toHaveLength(0)
  })

  it('binds one private issuer per non-empty owner and rejects repeated pin capture', () => {
    const host = createAdmissionCoordinator(new ControlledWriter(), new RecordingDiagnostics())
    const issuer = host.createUseIssuer('owner')
    expect(() => host.createUseIssuer('owner')).toThrow(/already bound/i)
    expect(() => host.createUseIssuer('')).toThrow(/non-empty/i)
    const callbacks = {
      retainAt: () => undefined,
      release: async () => ({ status: 'released' as const }),
    }
    issuer.capture({ resourceId: 'resource', generation: 'generation', epoch: 'epoch' }, callbacks)
    expect(() =>
      issuer.capture(
        { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
        callbacks,
      ),
    ).toThrow(/already captured/i)
  })
})
