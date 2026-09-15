import type {
  AdmissionCompletion,
  AdmissionHost,
  ExactUse,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
  ReleaseResult,
} from '../dist/index.js'
import { createAdmissionCoordinator } from '../dist/index.js'
import type { CommitResult, Position, PreparedCommit, UseBinding } from '@omne-harness-lite/records'
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

function binding(owner = 'execution-owner'): UseBinding {
  return Object.freeze({ owner, resourceId: 'resource', generation: 'generation', epoch: 'epoch' })
}

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

function issueUse(
  host: AdmissionHost,
  callbacks: Readonly<{
    retainAt?: ExactUse['retainAt']
    release?: ExactUse['release']
  }> = {},
): ExactUse {
  return host.createUseIssuer(`execution-owner-${Math.random()}`).capture(
    { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
    {
      retainAt: callbacks.retainAt ?? (() => undefined),
      release: callbacks.release ?? (async () => ({ status: 'released' })),
    },
  )
}

function prepared(
  host: AdmissionHost,
  operationId: string,
  owners: readonly string[],
  uses: readonly ExactUse[] = [],
  expectedRevision = '0',
): PreparedAdmission {
  const requirements = uses.map(use => ({ recordOwner: owners[0] ?? '', binding: use.binding }))
  return {
    composition: 'action_execution',
    commit: preparedCommit(host.coordinator, operationId, owners, requirements, expectedRevision),
    publications: owners.map(owner => publication(owner)),
    uses,
  }
}

function submit(host: AdmissionHost, value: PreparedAdmission) {
  return host.coordinator.enter(frame => host.coordinator.submit(frame, value))
}

function withPublication(
  value: PreparedAdmission,
  replacement: OwnerPublication,
): PreparedAdmission {
  return { ...value, publications: [replacement] }
}

function pending(result: ReturnType<typeof submit>): PendingAdmission {
  if (result.status !== 'pending_durability')
    throw new Error(`expected pending, got ${result.status}`)
  return result
}

describe('R2 ExactUse ownership and one-way lifecycle', () => {
  it('quarantines direct retainAt lifecycle misuse even when trusted gate code catches the throw', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const use = issueUse(host)
    const position: Position = Object.freeze({
      coordinationDomain: writer.coordinationDomain,
      writerEpoch: writer.writerEpoch,
      commitId: 'never-ranked',
      seq: '1',
    })

    host.coordinator.enter(frame => {
      expect(() => use.retainAt(position, frame)).toThrow(/not valid/i)
    })

    expect(host.coordinator.status().phase).toBe('quarantined')
    expect(writer.quarantines).toHaveLength(1)
  })

  it('recognizes the same pending ticket without retaining or releasing its claimed pin twice', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const retainAt = vi.fn(() => undefined)
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const use = issueUse(host, { retainAt, release })
    const value = prepared(host, 'same-ticket', ['records-owner'], [use])

    const first = pending(submit(host, value))
    const retry = pending(submit(host, value))

    expect(retry).toBe(first)
    expect(retainAt).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
    expect(writer.commitInputs).toHaveLength(2)
  })

  it('rejects a claimed handle for another operation before writer ranking', () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const use = issueUse(host)
    submit(host, prepared(host, 'first-operation', ['records-owner'], [use]))
    const before = writer.commitInputs.length

    const result = submit(host, prepared(host, 'other-operation', ['records-owner'], [use]))

    expect(result).toMatchObject({ status: 'unavailable', code: 'invalid_use' })
    expect(writer.commitInputs).toHaveLength(before)
  })

  it('cleans only a duplicate retry fresh pin and preserves the original claim', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const originalRelease = vi.fn(async () => ({ status: 'released' as const }))
    const retryRelease = vi.fn(async () => ({ status: 'released' as const }))
    const issuer = host.createUseIssuer('execution-owner')
    const original = issuer.capture(
      { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
      { retainAt: () => undefined, release: originalRelease },
    )
    const first = prepared(host, 'duplicate-fresh', ['records-owner'], [original])
    const firstResult = pending(submit(host, first))
    const retry = issuer.capture(
      { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
      { retainAt: () => undefined, release: retryRelease },
    )
    const retryValue: PreparedAdmission = { ...first, uses: [retry] }

    const retryResult = pending(submit(host, retryValue))
    await turn()

    expect(retryResult).toBe(firstResult)
    expect(retryRelease).toHaveBeenCalledOnce()
    expect(originalRelease).not.toHaveBeenCalled()
  })

  it('shares one in-flight release, retains failures, and never reclaims released or retained handles', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let finish: ((result: ReleaseResult) => void) | undefined
    const ownerRelease = vi.fn(
      () =>
        new Promise<ReleaseResult>(resolve => {
          finish = resolve
        }),
    )
    const fresh = issueUse(host, { release: ownerRelease })

    const first = fresh.release('not_admitted')
    const second = fresh.release('not_admitted')
    expect(second).toBe(first)
    expect(ownerRelease).toHaveBeenCalledOnce()
    expect(submit(host, prepared(host, 'releasing-use', ['records-owner'], [fresh]))).toMatchObject(
      { status: 'unavailable', code: 'invalid_use' },
    )
    expect(writer.commitInputs).toHaveLength(0)
    if (finish === undefined) throw new Error('release did not start')
    finish({ status: 'released' })
    await expect(first).resolves.toEqual({ status: 'released' })

    const releasedResult = submit(host, prepared(host, 'released-use', ['records-owner'], [fresh]))
    expect(releasedResult).toMatchObject({ status: 'unavailable', code: 'invalid_use' })

    const retainedRelease = vi.fn(async () => ({
      status: 'retained' as const,
      diagnosticId: 'owner-retained',
    }))
    const retained = issueUse(host, { release: retainedRelease })
    await expect(retained.release('not_admitted')).resolves.toEqual({
      status: 'retained',
      diagnosticId: 'owner-retained',
    })
    const retainedResult = submit(
      host,
      prepared(host, 'retained-use', ['records-owner'], [retained]),
    )
    expect(retainedResult).toMatchObject({ status: 'unavailable', code: 'invalid_use' })
  })

  it('does not invoke the owner for not_admitted after claim or release an unknown operation', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const ownerRelease = vi.fn(async () => ({ status: 'released' as const }))
    const use = issueUse(host, { release: ownerRelease })
    const result = pending(submit(host, prepared(host, 'unknown', ['records-owner'], [use])))
    writer.settle(
      0,
      Object.freeze({
        status: 'unknown',
        operation: result.operation,
        diagnosticId: 'writer-unknown',
      }),
    )
    await expect(result.completion).resolves.toMatchObject({ status: 'unknown' })

    await expect(use.release('not_admitted')).resolves.toMatchObject({ status: 'retained' })
    expect(ownerRelease).not.toHaveBeenCalled()
  })

  it('retains a fresh pin on an immediate unknown until its owner verifies non-commit', async () => {
    class ImmediateUnknownWriter extends ControlledWriter {
      override commit(preparedCommit: PreparedCommit): CommitResult {
        this.commitInputs.push(preparedCommit)
        return Object.freeze({
          status: 'unknown',
          operation: preparedCommit.operation,
          diagnosticId: 'writer-immediate-unknown',
        })
      }
    }

    const writer = new ImmediateUnknownWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const ownerRelease = vi.fn(async () => ({ status: 'released' as const }))
    const use = issueUse(host, { release: ownerRelease })
    const result = submit(host, prepared(host, 'immediate-unknown', ['records-owner'], [use]))

    expect(result).toMatchObject({
      status: 'unknown',
      operation: operation('immediate-unknown'),
      diagnosticId: 'writer-immediate-unknown',
    })
    await expect(use.release('not_admitted')).resolves.toMatchObject({ status: 'retained' })
    expect(ownerRelease).not.toHaveBeenCalled()
    await expect(use.release('verified_not_committed')).resolves.toEqual({ status: 'released' })
    expect(ownerRelease).toHaveBeenCalledOnce()
  })

  it('defers a public ExactUse release until the active gate frame has closed', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const preparedOperation = unwrap(
      host.coordinator.prepareOperation(operation('release-outside-gate'), operationInput()),
    )
    let captured: Parameters<typeof host.coordinator.lookupPrepared>[0] | undefined
    let releaseLookup: ReturnType<typeof host.coordinator.lookupPrepared> | undefined
    const ownerRelease = vi.fn(async () => {
      if (captured === undefined) throw new Error('frame was not captured')
      releaseLookup = host.coordinator.lookupPrepared(captured, preparedOperation)
      return { status: 'released' as const }
    })
    const use = issueUse(host, { release: ownerRelease })
    let releaseCompletion: Promise<ReleaseResult> | undefined

    host.coordinator.enter(frame => {
      captured = frame
      releaseCompletion = use.release('not_admitted')
      expect(ownerRelease).not.toHaveBeenCalled()
    })

    expect(ownerRelease).toHaveBeenCalledOnce()
    expect(releaseLookup).toMatchObject({ status: 'unavailable', code: 'invalid_frame' })
    if (releaseCompletion === undefined) throw new Error('release completion was not captured')
    await expect(releaseCompletion).resolves.toEqual({ status: 'released' })
  })

  it('allows only owner-verified settled cleanup and keeps the original claim after failure', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const ownerRelease = vi
      .fn<ExactUse['release']>()
      .mockResolvedValueOnce({ status: 'retained', diagnosticId: 'not-settled' })
      .mockResolvedValueOnce({ status: 'released' })
    const use = issueUse(host, { release: ownerRelease })
    const value = prepared(host, 'settled-cleanup', ['records-owner'], [use])
    const result = pending(submit(host, value))
    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({ status: 'committed' })

    await expect(use.release('settled')).resolves.toEqual({
      status: 'retained',
      diagnosticId: 'not-settled',
    })
    expect(submit(host, value)).toMatchObject({ status: 'unavailable', code: 'invalid_use' })
    await expect(use.release('settled')).resolves.toEqual({ status: 'released' })
    expect(ownerRelease).toHaveBeenCalledTimes(2)
  })
})

describe('CC-03 ordered logical and durable publication', () => {
  it('publishes logical state in the submission stack and durable state in seq order before its own completion', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const logical: string[] = []
    const durable: string[] = []
    const first = withPublication(
      prepared(host, 'one', ['owner']),
      publication(
        'owner',
        position => {
          logical.push(position.commitId)
          return undefined
        },
        position => {
          durable.push(position.commitId)
          return undefined
        },
      ),
    )
    const second = withPublication(
      prepared(host, 'two', ['owner'], [], '1'),
      publication(
        'owner',
        position => {
          logical.push(position.commitId)
          return undefined
        },
        position => {
          durable.push(position.commitId)
          return undefined
        },
      ),
    )

    const firstResult = pending(submit(host, first))
    const secondResult = pending(submit(host, second))

    expect(logical).toEqual(['commit-1', 'commit-2'])
    expect(durable).toEqual([])
    expect(writer.pumpStarts).toBe(0)
    expect(firstResult.completion).not.toBe(writer.pending[0]?.pending.completion)

    writer.settle(1)
    await turn()
    expect(durable).toEqual([])

    writer.settle(0)
    const completions = await Promise.all([firstResult.completion, secondResult.completion])
    expect(durable).toEqual(['commit-1', 'commit-2'])
    expect(completions.every(result => result.status === 'committed')).toBe(true)
    expect(host.coordinator.status()).toMatchObject({
      logical: { seq: '2' },
      durable: { seq: '2' },
    })
  })

  it('does not retain or publish business state for a durable revision conflict', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const retainAt = vi.fn(() => undefined)
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const use = issueUse(host, { retainAt, release })
    const logical = vi.fn(() => undefined)
    const durable = vi.fn(() => undefined)
    const value = withPublication(
      prepared(host, 'revision-conflict', ['records-owner'], [use], '9'),
      publication('records-owner', logical, durable),
    )

    const result = pending(submit(host, value))
    expect(result.disposition).toBe('record_conflict')
    await turn()
    expect(release).toHaveBeenCalledOnce()
    expect(retainAt).not.toHaveBeenCalled()
    expect(logical).not.toHaveBeenCalled()

    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({ status: 'conflict' })
    expect(durable).not.toHaveBeenCalled()
  })

  it('waits for coordinator publication responsibilities before draining and releasing the writer', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const durable = vi.fn(() => undefined)
    const value = withPublication(
      prepared(host, 'close', ['owner']),
      publication('owner', () => undefined, durable),
    )
    const result = pending(submit(host, value))

    const closing = host.coordinator.close()
    expect(host.coordinator.status().phase).toBe('closing')
    expect(writer.closeCalls).toBe(0)
    expect(() => host.coordinator.enter(() => undefined)).toThrow(/closing/i)

    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({ status: 'committed' })
    await expect(closing).resolves.toMatchObject({ status: 'closed' })
    expect(durable).toHaveBeenCalledOnce()
    expect(writer.closeCalls).toBe(1)
    expect(host.coordinator.status().phase).toBe('closed')
  })

  it('preserves a diagnostic blocked writer close and never opens admission again', async () => {
    class BlockingCloseWriter extends ControlledWriter {
      override async closeWriter() {
        this.closeCalls += 1
        return Object.freeze({
          status: 'blocked' as const,
          watermark: Object.freeze({
            coordinationDomain: this.coordinationDomain,
            seq: '0',
            commitId: null,
          }),
          diagnosticId: 'writer-close-blocked',
          pending: Object.freeze([]),
          lockHeld: true,
        })
      }
    }

    const writer = new BlockingCloseWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const first = host.coordinator.close()
    const duplicate = host.coordinator.close()

    expect(duplicate).toBe(first)
    await expect(first).resolves.toMatchObject({
      status: 'blocked',
      diagnosticId: 'writer-close-blocked',
      lockHeld: true,
    })
    expect(host.coordinator.status().phase).toBe('closing')
    expect(() => host.coordinator.enter(() => undefined)).toThrow(/closing/i)
    expect(writer.closeCalls).toBe(1)
  })
})

describe('strict callback contracts and publication blocking', () => {
  it('quarantines a logical publication thenable, observes its late rejection, and preserves committed fact as blocked', async () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(writer, diagnostics)
    const late = Promise.reject(new Error('late logical rejection'))
    const value = withPublication(prepared(host, 'logical-thenable', ['owner']), {
      owner: 'owner',
      publishLogical: (() => late) as unknown as OwnerPublication['publishLogical'],
      publishDurable: () => undefined,
    })

    const result = pending(submit(host, value))
    expect(host.coordinator.status().phase).toBe('quarantined')
    expect(writer.quarantines).toHaveLength(1)
    writer.settle(0)

    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    await turn()
    const lateRejection = diagnostics.points.find(point => point.phase === 'late_rejection')
    expect(lateRejection).toMatchObject({
      component: 'admission',
      code: 'publish_logical_rejected',
      position: result.position,
    })
  })

  it('marks a durable publication throw as blocked only after the committed writer result', async () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    const host = createAdmissionCoordinator(writer, diagnostics)
    const value = withPublication(
      prepared(host, 'durable-throw', ['owner']),
      publication(
        'owner',
        () => undefined,
        () => {
          throw new Error('durable publication failed')
        },
      ),
    )
    const result = pending(submit(host, value))

    writer.settle(0)
    const completion = await result.completion

    expect(completion).toMatchObject({ status: 'committed', publication: 'blocked' })
    expect(host.coordinator.status().phase).toBe('quarantined')
    expect(diagnostics.identities).toContainEqual({
      tenantId: 'tenant',
      principal: { kind: 'system', systemId: 'test-system' },
      operation: value.commit.operation,
      causality: {},
    })
  })

  it('does not publish a later committed ticket across a durable publication gap while closing', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const laterDurable = vi.fn(() => undefined)
    const first = withPublication(
      prepared(host, 'durable-gap-first', ['owner']),
      publication(
        'owner',
        () => undefined,
        () => {
          throw new Error('first durable publication failed')
        },
      ),
    )
    const second = withPublication(
      prepared(host, 'durable-gap-second', ['owner'], [], '1'),
      publication('owner', () => undefined, laterDurable),
    )
    const firstResult = pending(submit(host, first))
    const secondResult = pending(submit(host, second))

    writer.settle(0)
    await expect(firstResult.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    const closing = host.coordinator.close()
    expect(host.coordinator.status().phase).toBe('closing')

    writer.settle(1)
    await expect(secondResult.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    await closing

    expect(laterDurable).not.toHaveBeenCalled()
    expect(host.coordinator.status().durable.seq).toBe('0')
  })

  it('checks retainAt itself for strict undefined and never retries it', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const retainAt = vi.fn((() => Promise.resolve(undefined)) as unknown as ExactUse['retainAt'])
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const use = issueUse(host, { retainAt, release })
    const result = pending(submit(host, prepared(host, 'retain-thenable', ['owner'], [use])))

    expect(retainAt).toHaveBeenCalledOnce()
    expect(host.coordinator.status().phase).toBe('quarantined')
    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(retainAt).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
  })

  it('preserves a claimed use when retainAt and diagnostics fail together', async () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    diagnostics.throwOnLog = true
    diagnostics.throwOnNewId = true
    const host = createAdmissionCoordinator(writer, diagnostics)
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const retainAt = vi.fn((): undefined => {
      throw new Error('retain failed')
    })
    const use = issueUse(host, { retainAt, release })
    const result = pending(submit(host, prepared(host, 'retain-double-failure', ['owner'], [use])))

    expect(retainAt).toHaveBeenCalledOnce()
    expect(host.coordinator.status()).toMatchObject({
      phase: 'quarantined',
      diagnosticId: expect.any(String),
    })
    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(release).not.toHaveBeenCalled()
    await expect(use.release('not_admitted')).resolves.toMatchObject({ status: 'retained' })
    expect(release).not.toHaveBeenCalled()
  })

  it('never turns a late-resolving durable publication thenable into ready', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    let resolvePublication: (() => void) | undefined
    const latePublication = new Promise<void>(resolve => {
      resolvePublication = resolve
    })
    const value = withPublication(prepared(host, 'durable-thenable', ['owner']), {
      owner: 'owner',
      publishLogical: () => undefined,
      publishDurable: (() => latePublication) as unknown as OwnerPublication['publishDurable'],
    })
    const result = pending(submit(host, value))

    writer.settle(0)
    const completion = await result.completion
    expect(completion).toMatchObject({ status: 'committed', publication: 'blocked' })
    if (resolvePublication === undefined) throw new Error('publication promise was not initialized')
    resolvePublication()
    await turn()

    expect(await result.completion).toBe(completion)
    expect(completion).toMatchObject({ status: 'committed', publication: 'blocked' })
  })

  it('keeps original publication/use responsibility when diagnostics fail at the same time', async () => {
    const writer = new ControlledWriter()
    const diagnostics = new RecordingDiagnostics()
    diagnostics.throwOnLog = true
    diagnostics.throwOnNewId = true
    const host = createAdmissionCoordinator(writer, diagnostics)
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const use = issueUse(host, { release })
    const value = withPublication(
      prepared(host, 'double-failure', ['owner'], [use]),
      publication('owner', () => {
        throw new Error('publication failed')
      }),
    )
    const result = pending(submit(host, value))

    writer.settle(0)
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(host.coordinator.status()).toMatchObject({ phase: 'quarantined' })
    expect(host.coordinator.status().diagnosticId).toBeTruthy()
    expect(release).not.toHaveBeenCalled()
  })

  it('turns an unexpected writer completion rejection into unknown without an unhandled rejection', async () => {
    const writer = new ControlledWriter()
    const host = createAdmissionCoordinator(writer, new RecordingDiagnostics())
    const value = prepared(host, 'writer-reject', ['owner'])
    const result = pending(submit(host, value))

    writer.rejectCompletion(0, new Error('writer contract violation'))

    await expect(result.completion).resolves.toMatchObject({
      status: 'unknown',
      operation: value.commit.operation,
    })
    expect(host.coordinator.status().phase).toBe('quarantined')
  })
})
