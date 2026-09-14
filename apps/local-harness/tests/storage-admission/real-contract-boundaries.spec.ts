import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  GateFrame,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
} from '@omne-harness-lite/admission'
import { createJsonlProvider } from '@omne-harness-lite/jsonl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeStack,
  createStack,
  operation,
  operationInput,
  prepareAdmission,
  providerOptions,
  removeStack,
  streamAppend,
  useBinding,
  type Stack,
} from './fixtures.js'

const stacks = new Set<Stack>()

afterEach(async () => {
  await Promise.allSettled([...stacks].map(closeStack))
  await Promise.all([...stacks].map(removeStack))
  stacks.clear()
})

function pending(
  result: ReturnType<Stack['admission']['coordinator']['submit']>,
): PendingAdmission {
  expect(result.status).toBe('pending_durability')
  if (result.status !== 'pending_durability') {
    throw new Error(`expected pending durability, got ${result.status}`)
  }
  return result
}

async function journalLines(stack: Stack): Promise<number> {
  return (await readFile(join(stack.recordDirectory, 'journal.jsonl'), 'utf8'))
    .split('\n')
    .filter(Boolean).length
}

describe('A05 exact cross-boundary participants', () => {
  it('rejects missing, duplicated, and extra publications before the real writer appends', async () => {
    const cases = [
      [] as OwnerPublication[],
      [
        {
          owner: 'session',
          publishLogical: () => undefined,
          publishDurable: () => undefined,
        },
        {
          owner: 'session',
          publishLogical: () => undefined,
          publishDurable: () => undefined,
        },
      ],
      [
        {
          owner: 'session',
          publishLogical: () => undefined,
          publishDurable: () => undefined,
        },
        {
          owner: 'extra',
          publishLogical: () => undefined,
          publishDurable: () => undefined,
        },
      ],
    ]

    for (const [index, publications] of cases.entries()) {
      const stack = await createStack(`participant-rejection-${index}-`, ['session'])
      stacks.add(stack)
      const canonical = prepareAdmission(stack.admission, `participant-${index}`, [
        {
          owner: 'session',
          publishLogical: () => undefined,
          publishDurable: () => undefined,
        },
      ])
      const before = await journalLines(stack)
      const result = stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, { ...canonical, publications }),
      )

      expect(result).toMatchObject({ status: 'unavailable', code: 'invalid_participants' })
      expect(await journalLines(stack)).toBe(before)
      expect(stack.admission.coordinator.status()).toMatchObject({
        phase: 'open',
        logical: { seq: '0' },
        durable: { seq: '0' },
      })
    }
  })

  it('rejects foreign frames, uses, and prepared commits before changing the real journal', async () => {
    const primary = await createStack('authenticity-primary-', ['session'])
    const foreign = await createStack('authenticity-foreign-', ['session'])
    stacks.add(primary)
    stacks.add(foreign)
    const publication: OwnerPublication = {
      owner: 'session',
      publishLogical: () => undefined,
      publishDurable: () => undefined,
    }
    const canonical = prepareAdmission(primary.admission, 'authenticity', [publication])
    const before = await journalLines(primary)
    const foreignUse = foreign.admission.createUseIssuer('execution-owner').capture(useBinding(), {
      retainAt: () => undefined,
      release: async () => ({ status: 'released' }),
    })
    const required = prepareAdmission(primary.admission, 'foreign-use', [publication], {
      uses: [
        primary.admission.createUseIssuer('execution-owner').capture(useBinding(), {
          retainAt: () => undefined,
          release: async () => ({ status: 'released' }),
        }),
      ],
    })
    expect(
      primary.admission.coordinator.enter(frame =>
        primary.admission.coordinator.submit(frame, { ...required, uses: [foreignUse] }),
      ),
    ).toMatchObject({ status: 'unavailable', code: 'invalid_use' })

    const foreignPrepared = prepareAdmission(foreign.admission, 'foreign-commit', [publication])
    expect(
      primary.admission.coordinator.enter(frame =>
        primary.admission.coordinator.submit(frame, {
          ...foreignPrepared,
          publications: [publication],
        }),
      ),
    ).toMatchObject({ status: 'unavailable', code: 'invalid_snapshot' })

    let capturedFrame: GateFrame | undefined
    primary.admission.coordinator.enter(frame => {
      capturedFrame = frame
    })
    if (capturedFrame === undefined) throw new Error('gate frame was not captured')
    expect(primary.admission.coordinator.submit(capturedFrame, canonical)).toMatchObject({
      status: 'unavailable',
      code: 'invalid_frame',
    })
    expect(await journalLines(primary)).toBe(before)
  })

  it('rejects reuse of one claimed use by a different operation before writer ranking', async () => {
    const stack = await createStack('claimed-use-', ['session'])
    stacks.add(stack)
    const retainAt = vi.fn(() => undefined)
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const use = stack.admission.createUseIssuer('execution-owner').capture(useBinding(), {
      retainAt,
      release,
    })
    const publication: OwnerPublication = {
      owner: 'session',
      publishLogical: () => undefined,
      publishDurable: () => undefined,
    }
    const first = prepareAdmission(stack.admission, 'use-owner-a', [publication], { uses: [use] })
    const firstSubmission = pending(
      stack.admission.coordinator.enter(frame => stack.admission.coordinator.submit(frame, first)),
    )
    await expect(firstSubmission.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'ready',
    })
    const before = await journalLines(stack)
    const second = prepareAdmission(stack.admission, 'use-owner-b', [publication], { uses: [use] })
    expect(
      stack.admission.coordinator.enter(frame => stack.admission.coordinator.submit(frame, second)),
    ).toMatchObject({ status: 'unavailable', code: 'invalid_use' })
    expect(await journalLines(stack)).toBe(before)
    expect(retainAt).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
  })
})

describe('A05/A07 durable multi-stream conflict', () => {
  it('publishes no owner state, advances no business stream, and recovers the same conflict', async () => {
    const stack = await createStack('multi-stream-conflict-', ['approval', 'session'])
    stacks.add(stack)
    const initialPublications: OwnerPublication[] = ['approval', 'session'].map(owner => ({
      owner,
      publishLogical: () => undefined,
      publishDurable: () => undefined,
    }))
    const initial = prepareAdmission(stack.admission, 'multi-stream-initial', initialPublications)
    await expect(
      pending(
        stack.admission.coordinator.enter(frame =>
          stack.admission.coordinator.submit(frame, initial),
        ),
      ).completion,
    ).resolves.toMatchObject({ status: 'committed', publication: 'ready' })

    const conflictOperation = operation('multi-stream-conflict')
    const preparedOperation = stack.admission.coordinator.prepareOperation(
      conflictOperation,
      operationInput('multi-stream-conflict'),
    )
    expect(preparedOperation.ok).toBe(true)
    if (!preparedOperation.ok) return
    const preparedCommit = stack.admission.coordinator.prepare({
      operation: preparedOperation.value,
      appends: [
        streamAppend('approval', 'multi-stream-conflict', '1'),
        streamAppend('session', 'multi-stream-conflict', '9'),
      ],
      result: { value: 'must-not-apply' },
      requiredUses: [],
    })
    expect(preparedCommit.ok).toBe(true)
    if (!preparedCommit.ok) return
    const logical = vi.fn(() => undefined)
    const durable = vi.fn(() => undefined)
    const conflicting: PreparedAdmission = {
      composition: 'owner_change',
      commit: preparedCommit.value,
      publications: ['approval', 'session'].map(owner => ({
        owner,
        publishLogical: logical,
        publishDurable: durable,
      })),
      uses: [],
    }
    const submission = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, conflicting),
      ),
    )
    expect(submission.disposition).toBe('record_conflict')
    await expect(submission.completion).resolves.toMatchObject({
      status: 'conflict',
      conflict: {
        kind: 'revision',
        currents: [{ stream: streamAppend('session', 'unused').stream, revision: '1' }],
      },
      receipt: { position: { seq: '3' } },
    })
    expect(logical).not.toHaveBeenCalled()
    expect(durable).not.toHaveBeenCalled()
    await expect(
      stack.writer.readHead([
        streamAppend('approval', 'unused').stream,
        streamAppend('session', 'unused').stream,
      ]),
    ).resolves.toMatchObject({
      status: 'read',
      value: { streams: [{ revision: '1' }, { revision: '1' }] },
    })

    await expect(stack.admission.coordinator.close()).resolves.toMatchObject({ status: 'closed' })
    const reopened = await createJsonlProvider(
      providerOptions(stack.recordDirectory, ['approval', 'session']),
      stack.diagnosticRuntime.diagnostics,
    ).acquireWriter()
    expect(reopened.status).toBe('acquired')
    if (reopened.status !== 'acquired') return
    await expect(reopened.writer.lookupOperation(conflictOperation)).resolves.toMatchObject({
      status: 'conflict',
      conflict: {
        kind: 'revision',
        currents: [{ stream: streamAppend('session', 'unused').stream, revision: '1' }],
      },
      receipt: { position: { seq: '3' } },
    })
    await expect(reopened.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
  })
})
