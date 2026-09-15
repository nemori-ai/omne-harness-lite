import type {
  AdmissionHost,
  CommittedNotice,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
} from '../dist/index.js'
import { createAdmissionCoordinator } from '../dist/index.js'
import { describe, expect, it } from 'vitest'
import { ControlledWriter, RecordingDiagnostics, preparedCommit, turn } from './fixtures.js'

function publication(owner: string, publishDurable: () => undefined = () => undefined) {
  const value: OwnerPublication = Object.freeze({
    owner,
    publishLogical: () => undefined,
    publishDurable,
  })
  return value
}

function prepare(
  host: AdmissionHost,
  operationId: string,
  value: OwnerPublication,
  expectedRevision = '0',
): PreparedAdmission {
  return Object.freeze({
    composition: 'run_settle',
    commit: preparedCommit(host.coordinator, operationId, [value.owner], [], expectedRevision),
    publications: Object.freeze([value]),
    uses: Object.freeze([]),
  })
}

function submit(host: AdmissionHost, prepared: PreparedAdmission): PendingAdmission {
  const result = host.coordinator.enter(frame => host.coordinator.submit(frame, prepared))
  if (result.status !== 'pending_durability') {
    throw new Error(`expected pending durability, got ${result.status}`)
  }
  return result
}

describe('LC-06 committed broadcast', () => {
  it('delivers one notice carrying the held receipt after a committed ready completion', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const notices: CommittedNotice[] = []
    host.subscribeCommitted(notice => {
      notices.push(notice)
    })
    const prepared = prepare(host, 'ready-once', publication('owner'))
    const result = submit(host, prepared)
    expect(notices).toEqual([])

    writer.settle(0)
    const completion = await result.completion
    if (completion.status !== 'committed') throw new Error('expected committed')

    expect(completion.publication).toBe('ready')
    expect(notices).toHaveLength(1)
    expect(notices[0]?.receipt).toBe(completion.receipt)
    expect(notices[0]).toMatchObject({
      composition: 'run_settle',
      canonicalInput: prepared.commit.canonicalInput,
      receipt: { position: result.position, operation: result.operation },
    })
    expect(notices[0]?.receipt.streams.map(entry => entry.stream.scope)).toEqual([
      { kind: 'tenant', tenantId: 'tenant' },
    ])
    expect(host.coordinator.status().durable.seq).toBe(result.position.seq)
  })

  it('does not notify the same ticket again when it is recognized later', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let delivered = 0
    host.subscribeCommitted(() => {
      delivered += 1
    })
    const prepared = prepare(host, 'recognized', publication('owner'))
    const first = submit(host, prepared)
    writer.settle(0)
    await first.completion
    expect(delivered).toBe(1)

    const again = host.coordinator.enter(frame => host.coordinator.submit(frame, prepared))
    expect(again).toMatchObject({ status: 'committed', publication: 'ready' })
    await first.completion
    await turn()
    expect(delivered).toBe(1)
  })

  it('does not notify a blocked completion and leaves the durable watermark behind it', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const notices: CommittedNotice[] = []
    host.subscribeCommitted(notice => {
      notices.push(notice)
    })
    const faulting = prepare(
      host,
      'blocked',
      publication('owner', () => {
        try {
          host.coordinator.enter(() => undefined)
        } catch {
          // The callback catches its own reentry fault; the domain stays quarantined.
        }
        return undefined
      }),
    )
    const result = submit(host, faulting)

    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(notices).toEqual([])
    expect(host.coordinator.status().durable.seq).toBe('0')
  })

  it('isolates a throwing listener: others are delivered, one delivery diagnostic, ticket unchanged', async () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(writer, diagnostics)
    const received: string[] = []
    host.subscribeCommitted(() => {
      received.push('first')
    })
    host.subscribeCommitted(() => {
      throw new Error('listener failed')
    })
    host.subscribeCommitted(() => {
      received.push('third')
    })
    const result = submit(host, prepare(host, 'throwing-listener', publication('owner')))

    writer.settle(0)
    const completion = await result.completion

    expect(received).toEqual(['first', 'third'])
    expect(completion).toMatchObject({ status: 'committed', publication: 'ready' })
    expect(host.coordinator.status()).toMatchObject({
      phase: 'open',
      durable: { seq: result.position.seq },
    })
    expect(writer.quarantines).toEqual([])
    const deliveries = diagnostics.points.filter(point => point.phase === 'delivery')
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({
      component: 'admission',
      level: 'error',
      position: result.position,
    })
    expect(diagnostics.identities.at(-1)).toMatchObject({
      tenantId: 'tenant',
      operation: result.operation,
    })
  })

  it('notifies tickets in ticket order even when the writer settles them out of order', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const seen: string[] = []
    host.subscribeCommitted(notice => {
      seen.push(notice.receipt.position.seq)
    })
    const first = submit(host, prepare(host, 'ordered-first', publication('owner')))
    const second = submit(host, prepare(host, 'ordered-second', publication('owner'), '1'))

    writer.settle(1)
    await turn()
    expect(seen).toEqual([])

    writer.settle(0)
    await Promise.all([first.completion, second.completion])
    expect(seen).toEqual([first.position.seq, second.position.seq])
  })

  it('stops delivering after unsubscribe while other subscribers continue', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const kept: string[] = []
    const dropped: string[] = []
    host.subscribeCommitted(notice => {
      kept.push(notice.receipt.position.seq)
    })
    const unsubscribe = host.subscribeCommitted(notice => {
      dropped.push(notice.receipt.position.seq)
    })
    const first = submit(host, prepare(host, 'unsubscribe-first', publication('owner')))
    writer.settle(0)
    await first.completion
    expect(dropped).toEqual([first.position.seq])

    unsubscribe()
    unsubscribe()
    const second = submit(host, prepare(host, 'unsubscribe-second', publication('owner'), '1'))
    writer.settle(1)
    await second.completion

    expect(kept).toEqual([first.position.seq, second.position.seq])
    expect(dropped).toEqual([first.position.seq])
  })
})
