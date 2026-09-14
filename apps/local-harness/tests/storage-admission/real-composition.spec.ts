import type { OwnerPublication, PendingAdmission } from '@omne-harness-lite/admission'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeStack,
  createStack,
  prepareAdmission,
  removeStack,
  turn,
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

describe('A05/A08 real JSONL and admission composition', () => {
  it('publishes every logical owner in the submit stack and every durable owner before completion', async () => {
    const stack = await createStack('publication-order-', ['authorization', 'budget'])
    stacks.add(stack)
    const logical: string[] = []
    const durable: string[] = []
    let effects = 0
    const publications: OwnerPublication[] = ['authorization', 'budget'].map(owner => ({
      owner,
      publishLogical: position => {
        logical.push(`${owner}:${position.seq}`)
        return undefined
      },
      publishDurable: receipt => {
        durable.push(`${owner}:${receipt.position.seq}`)
        return undefined
      },
    }))
    const prepared = prepareAdmission(stack.admission, 'two-owner', publications)

    const result = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, prepared),
      ),
    )

    expect(logical).toEqual(['authorization:2', 'budget:2'])
    expect(durable).toEqual([])
    expect(effects).toBe(0)
    const completion = await result.completion
    if (completion.status === 'committed' && completion.publication === 'ready') effects += 1

    expect(completion).toMatchObject({
      status: 'committed',
      publication: 'ready',
      receipt: { position: { seq: '2' } },
    })
    expect(durable).toEqual(['authorization:2', 'budget:2'])
    expect(effects).toBe(1)
    expect(stack.admission.coordinator.status()).toMatchObject({
      phase: 'open',
      logical: { seq: '2' },
      durable: { seq: '2' },
    })
  })

  it('recognizes one pending operation and releases only a newly captured duplicate pin', async () => {
    const stack = await createStack('exact-use-', ['action-owner'])
    stacks.add(stack)
    const issuer = stack.admission.createUseIssuer('execution-owner')
    const retainOriginal = vi.fn(() => undefined)
    const releaseOriginal = vi.fn(async () => ({ status: 'released' as const }))
    const original = issuer.capture(useBinding(), {
      retainAt: retainOriginal,
      release: releaseOriginal,
    })
    const publication: OwnerPublication = {
      owner: 'action-owner',
      publishLogical: () => undefined,
      publishDurable: () => undefined,
    }
    const prepared = prepareAdmission(stack.admission, 'duplicate', [publication], {
      uses: [original],
    })

    const first = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, prepared),
      ),
    )
    const same = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, prepared),
      ),
    )
    expect(same).toBe(first)
    expect(retainOriginal).toHaveBeenCalledOnce()
    expect(releaseOriginal).not.toHaveBeenCalled()

    const releaseRetry = vi.fn(async () => ({ status: 'released' as const }))
    const retryUse = issuer.capture(useBinding(), {
      retainAt: () => undefined,
      release: releaseRetry,
    })
    const retry = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, { ...prepared, uses: [retryUse] }),
      ),
    )
    expect(retry).toBe(first)
    await turn()
    expect(releaseRetry).toHaveBeenCalledOnce()
    expect(releaseOriginal).not.toHaveBeenCalled()
    await expect(first.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'ready',
    })
  })

  it('keeps an operation result stable and rejects changed input without publishing it', async () => {
    const stack = await createStack('operation-conflict-', ['session'])
    stacks.add(stack)
    const logical = vi.fn(() => undefined)
    const publication: OwnerPublication = {
      owner: 'session',
      publishLogical: logical,
      publishDurable: () => undefined,
    }
    const firstPrepared = prepareAdmission(stack.admission, 'stable-operation', [publication])
    const first = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, firstPrepared),
      ),
    )
    const committed = await first.completion
    expect(committed).toMatchObject({ status: 'committed', publication: 'ready' })

    const changed = prepareAdmission(stack.admission, 'stable-operation', [publication], {
      inputId: 'changed-input',
      expectedRevision: '1',
    })
    const conflict = stack.admission.coordinator.enter(frame =>
      stack.admission.coordinator.submit(frame, changed),
    )

    expect(conflict).toMatchObject({
      status: 'conflict',
      conflict: { kind: 'operation_input' },
      receipt: null,
    })
    expect(logical).toHaveBeenCalledOnce()
    const same = stack.admission.coordinator.enter(frame =>
      stack.admission.coordinator.submit(frame, firstPrepared),
    )
    expect(same).toEqual(committed)
  })
})
