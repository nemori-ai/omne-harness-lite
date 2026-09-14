import { afterEach, describe, expect, it } from 'vitest'
import {
  closeStack,
  createStack,
  diagnosticLines,
  operation,
  prepareAdmission,
  removeStack,
  type Stack,
} from './fixtures.js'

const stacks = new Set<Stack>()

afterEach(async () => {
  await Promise.allSettled([...stacks].map(closeStack))
  await Promise.all([...stacks].map(removeStack))
  stacks.clear()
})

describe('O09/O10 real diagnostic correlation', () => {
  it('writes a D1-valid storage durability point with the original operation and position', async () => {
    const stack = await createStack('storage-correlation-', ['session'])
    stacks.add(stack)
    const prepared = prepareAdmission(stack.admission, 'storage-correlation', [
      {
        owner: 'session',
        publishLogical: () => undefined,
        publishDurable: () => undefined,
      },
    ])
    const result = stack.admission.coordinator.enter(frame =>
      stack.admission.coordinator.submit(frame, prepared),
    )
    expect(result.status).toBe('pending_durability')
    if (result.status !== 'pending_durability') return
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'ready',
    })
    await closeStack(stack)

    const lines = await diagnosticLines(stack.diagnosticDirectory)
    expect(lines).toContainEqual(
      expect.objectContaining({
        kind: 'log',
        tenantId: 'tenant-1',
        principal: { kind: 'user', user: { userId: 'user-1' } },
        operation: operation('storage-correlation'),
        component: 'storage.jsonl',
        phase: 'durability',
        code: expect.stringMatching(/^[a-z][a-z0-9_.-]*$/u),
        position: expect.objectContaining({ seq: '2' }),
      }),
    )
    expect(lines).not.toContainEqual(
      expect.objectContaining({
        kind: 'gap',
        gaps: expect.arrayContaining([expect.objectContaining({ reason: 'invalid_projection' })]),
      }),
    )
  })

  it('writes a D1-valid admission publication failure without losing trusted identity', async () => {
    const stack = await createStack('admission-correlation-', ['session'])
    stacks.add(stack)
    const prepared = prepareAdmission(stack.admission, 'admission-correlation', [
      {
        owner: 'session',
        publishLogical: () => undefined,
        publishDurable: () => {
          throw new Error('injected publication failure')
        },
      },
    ])
    const result = stack.admission.coordinator.enter(frame =>
      stack.admission.coordinator.submit(frame, prepared),
    )
    expect(result.status).toBe('pending_durability')
    if (result.status !== 'pending_durability') return
    await expect(result.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    await closeStack(stack)

    const lines = await diagnosticLines(stack.diagnosticDirectory)
    expect(lines).toContainEqual(
      expect.objectContaining({
        kind: 'log',
        tenantId: 'tenant-1',
        principal: { kind: 'user', user: { userId: 'user-1' } },
        operation: operation('admission-correlation'),
        component: 'admission',
        phase: 'durable_publication',
        code: 'callback_contract',
        position: expect.objectContaining({ seq: '2' }),
      }),
    )
  })
})
