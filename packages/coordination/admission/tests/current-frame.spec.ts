import type {
  AdmissionHost,
  GateFrame,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
} from '../dist/index.js'
import { createAdmissionCoordinator } from '../dist/index.js'
import type { UseRequirement } from '@omne-harness-lite/records'
import { describe, expect, it, vi } from 'vitest'
import { ControlledWriter, RecordingDiagnostics, preparedCommit, turn } from './fixtures.js'

function pending(result: ReturnType<AdmissionHost['coordinator']['submit']>): PendingAdmission {
  expect(result.status).toBe('pending_durability')
  if (result.status !== 'pending_durability') {
    throw new Error(`expected pending durability, got ${result.status}`)
  }
  return result
}

function admission(
  host: AdmissionHost,
  operationId: string,
  publications: readonly OwnerPublication[],
  requiredUses: readonly UseRequirement[] = [],
  uses: PreparedAdmission['uses'] = [],
): PreparedAdmission {
  return Object.freeze({
    composition: 'action_execution',
    commit: preparedCommit(
      host.coordinator,
      operationId,
      publications.map(value => value.owner),
      requiredUses,
    ),
    publications: Object.freeze([...publications]),
    uses: Object.freeze([...uses]),
  })
}

describe('F1-F3 authentic current GateFrame query', () => {
  it('is a repeatable pure query only for the exact active frame', () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(writer, diagnostics)
    const before = host.coordinator.status()
    let frame: GateFrame | undefined

    host.coordinator.enter(current => {
      frame = current
      expect(host.coordinator.isCurrentFrame(current)).toBe(true)
      expect(host.coordinator.isCurrentFrame(current)).toBe(true)
    })

    expect(frame).toBeDefined()
    expect(host.coordinator.isCurrentFrame(frame!)).toBe(false)
    expect(host.coordinator.status()).toEqual(before)
    expect(writer.commitInputs).toEqual([])
    expect(writer.quarantines).toEqual([])
    expect(diagnostics.points).toEqual([])
  })

  it('returns false for foreign and arbitrary JS values without touching their traps', () => {
    const first = createAdmissionCoordinator(new ControlledWriter(), new RecordingDiagnostics())
    const second = createAdmissionCoordinator(new ControlledWriter(), new RecordingDiagnostics())
    const trap = vi.fn(() => {
      throw new Error('the frame query touched its input')
    })
    const proxy = new Proxy(Object.freeze({}), {
      get: trap,
      getOwnPropertyDescriptor: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
    })
    const arbitrary: readonly unknown[] = Object.freeze([
      null,
      undefined,
      false,
      0,
      'frame',
      {},
      Object.freeze({}),
      JSON.parse('{}'),
      proxy,
    ])

    first.coordinator.enter(firstFrame => {
      for (const value of arbitrary) {
        expect(first.coordinator.isCurrentFrame(value as GateFrame)).toBe(false)
      }
      second.coordinator.enter(secondFrame => {
        expect(first.coordinator.isCurrentFrame(firstFrame)).toBe(true)
        expect(first.coordinator.isCurrentFrame(secondFrame)).toBe(false)
        expect(second.coordinator.isCurrentFrame(firstFrame)).toBe(false)
        expect(second.coordinator.isCurrentFrame(secondFrame)).toBe(true)
      })
    })

    expect(trap).not.toHaveBeenCalled()
  })

  it('never revives an exited frame after a later entry or a synchronous throw', () => {
    const host = createAdmissionCoordinator(new ControlledWriter(), new RecordingDiagnostics())
    let first: GateFrame | undefined
    host.coordinator.enter(frame => {
      first = frame
    })
    host.coordinator.enter(second => {
      expect(host.coordinator.isCurrentFrame(first!)).toBe(false)
      expect(host.coordinator.isCurrentFrame(second)).toBe(true)
    })

    const throwing = createAdmissionCoordinator(new ControlledWriter(), new RecordingDiagnostics())
    let thrownFrame: GateFrame | undefined
    expect(() =>
      throwing.coordinator.enter(frame => {
        thrownFrame = frame
        throw new Error('work failed')
      }),
    ).toThrow('work failed')
    expect(throwing.coordinator.isCurrentFrame(thrownFrame!)).toBe(false)
  })
})

describe('F4-F7 current frame lifecycle and phase separation', () => {
  it('recognizes retain, logical, and durable callback frames without reviving the logical frame', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const callbackFrames: GateFrame[] = []
    const callbackCurrent: boolean[] = []
    const issuer = host.createUseIssuer('execution-owner')
    const use = issuer.capture(
      { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
      {
        retainAt: (_position, frame) => {
          callbackFrames.push(frame)
          callbackCurrent.push(host.coordinator.isCurrentFrame(frame))
          return undefined
        },
        release: async () => ({ status: 'released' }),
      },
    )
    const publication: OwnerPublication = {
      owner: 'records-owner',
      publishLogical: (_position, frame) => {
        callbackFrames.push(frame)
        callbackCurrent.push(host.coordinator.isCurrentFrame(frame))
        return undefined
      },
      publishDurable: (_receipt, frame) => {
        callbackFrames.push(frame)
        callbackCurrent.push(host.coordinator.isCurrentFrame(frame))
        expect(host.coordinator.isCurrentFrame(callbackFrames[0]!)).toBe(false)
        return undefined
      },
    }
    const value = admission(
      host,
      'callback-frames',
      [publication],
      [{ recordOwner: publication.owner, binding: use.binding }],
      [use],
    )

    const result = pending(host.coordinator.enter(frame => host.coordinator.submit(frame, value)))
    expect(callbackCurrent).toEqual([true, true])
    expect(host.coordinator.isCurrentFrame(callbackFrames[0]!)).toBe(false)
    expect(host.coordinator.isCurrentFrame(callbackFrames[1]!)).toBe(false)

    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'ready',
    })
    expect(callbackCurrent).toEqual([true, true, true])
    expect(callbackFrames[2]).not.toBe(callbackFrames[1])
    expect(host.coordinator.isCurrentFrame(callbackFrames[2]!)).toBe(false)
  })

  it('keeps a normal durable publication frame current while close drains the ticket', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let durableFrame: GateFrame | undefined
    const value = admission(host, 'closing-current-frame', [
      {
        owner: 'records-owner',
        publishLogical: () => undefined,
        publishDurable: (_receipt, frame) => {
          durableFrame = frame
          expect(host.coordinator.status().phase).toBe('closing')
          expect(host.coordinator.isCurrentFrame(frame)).toBe(true)
          return undefined
        },
      },
    ])
    const result = pending(host.coordinator.enter(frame => host.coordinator.submit(frame, value)))
    const closing = host.coordinator.close()

    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'ready',
    })
    await expect(closing).resolves.toMatchObject({ status: 'closed' })
    expect(host.coordinator.isCurrentFrame(durableFrame!)).toBe(false)
  })

  it('keeps a quarantined stack frame current while caught reentry and close forbid new work', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const value = admission(host, 'caught-reentry', [
      {
        owner: 'records-owner',
        publishLogical: () => undefined,
        publishDurable: () => undefined,
      },
    ])
    let captured: GateFrame | undefined
    let afterFault: ReturnType<typeof host.coordinator.submit> | undefined
    let closing: Promise<Awaited<ReturnType<typeof host.coordinator.close>>> | undefined

    host.coordinator.enter(frame => {
      captured = frame
      expect(() => host.coordinator.enter(() => undefined)).toThrow(/reentrant/i)
      expect(host.coordinator.status().phase).toBe('quarantined')
      expect(host.coordinator.isCurrentFrame(frame)).toBe(true)
      afterFault = host.coordinator.submit(frame, value)
      closing = host.coordinator.close()
      expect(host.coordinator.status().phase).toBe('closing')
      expect(host.coordinator.isCurrentFrame(frame)).toBe(true)
    })

    expect(afterFault).toEqual({
      status: 'unavailable',
      owner: 'admission',
      code: 'quarantined',
    })
    expect(writer.commitInputs).toEqual([])
    expect(host.coordinator.isCurrentFrame(captured!)).toBe(false)
    await expect(closing).resolves.toMatchObject({ status: 'closed' })
  })

  it('invalidates a thenable-returning gate before observing its late rejection', async () => {
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(new ControlledWriter(), diagnostics)
    let captured: GateFrame | undefined
    let currentWhenObserved: boolean | undefined
    const thenable = {
      then(_resolve: () => void, reject: () => void): void {
        currentWhenObserved = host.coordinator.isCurrentFrame(captured!)
        reject()
      },
    }

    expect(() =>
      host.coordinator.enter(frame => {
        captured = frame
        return thenable
      }),
    ).toThrow(/thenable/i)
    await turn()

    expect(currentWhenObserved).toBe(false)
    expect(host.coordinator.isCurrentFrame(captured!)).toBe(false)
    expect(diagnostics.points).toContainEqual(
      expect.objectContaining({
        phase: 'late_rejection',
        code: 'gate_result_rejected',
      }),
    )
  })
})
