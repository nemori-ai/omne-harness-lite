import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  deriveSessionOperation,
  type BackgroundCallResolution,
  type BackgroundCallView,
  type SessionFailure,
} from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import type { CallOutput } from '@omne-harness/tool-contract'
import {
  createBoundBackgroundCalls,
  type BackgroundBindingPorts,
} from '../../../src/rows/tool-bindings/background-calls.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'

const producer = { kind: 'tool', call: 'tool-call-7' } as const
const view: BackgroundCallView = {
  id: 'b1',
  producer,
  label: { intent: 'build', tool: 'Shell', command: 'execute', preview: 'pnpm build' },
  source: 'threshold',
  status: 'running',
  stop: null,
  lastLine: 'step 3/7',
}

type Answers = Partial<{
  list: readonly BackgroundCallView[]
  resolve: Readonly<{ ok: BackgroundCallResolution }> | Readonly<{ failure: SessionFailure }>
  output: CallOutput
}>

async function setup(command: string, business: object, answers: Answers = {}) {
  const world = await forwardWorld()
  const calls: { method: string; input: unknown }[] = []
  const ports: BackgroundBindingPorts = {
    verifier: () => world.fixture.root.get('principalVerifier'),
    work: () => ({
      readBackgroundCalls: async input => {
        calls.push({ method: 'list', input })
        return { ok: answers.list ?? [view] }
      },
      resolveBackgroundCall: async input => {
        calls.push({ method: 'resolve', input })
        return answers.resolve ?? { ok: { producer, settled: null } }
      },
      stopCall: async input => {
        calls.push({ method: 'stop', input })
        return {
          ok: {
            operation: input.operation,
            source: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
            answer: { kind: 'requested', progress: {} as never },
          },
        }
      },
    }),
    queries: () => ({
      readOutput: async input => {
        calls.push({ method: 'output', input })
        return { ok: answers.output ?? { kind: 'none' } }
      },
    }),
  }
  const wire = JSON.stringify({ command, params: business })
  const parent = {
    principal: world.principal,
    tenant: world.tenant,
    call: world.call,
    request: {
      ...world.request('BkgToolCalls'),
      command,
      arguments: { original: wire, effective: wire, complete: true },
    },
  }
  return { ...world, calls, binding: createBoundBackgroundCalls(parent, ports, () => true) }
}

const session = sessionId('forward-test')

describe('the BkgToolCalls binding: Session from the work principal, Tool for the output (C23)', () => {
  it('list reads this Session and shows each call by its short id, label and state', async () => {
    const w = await setup('list', {})
    try {
      expect(await w.binding.list()).toEqual({
        ok: [
          {
            id: 'b1',
            intent: 'build',
            action: 'Shell execute · pnpm build',
            status: 'running',
            stop: null,
            lastLine: 'step 3/7',
          },
        ],
      })
      expect(w.calls).toEqual([
        { method: 'list', input: { principal: w.principal, tenant: w.tenant, session } },
      ])
    } finally {
      await w.close()
    }
  })

  it('a short id that this Session does not hold is not found, as another session would answer', async () => {
    const missing = { failure: { kind: 'not-found' } } as const
    for (const [command, params] of [
      ['output', { id: 'b9' }],
      ['terminate', { id: 'b9', reason: 'done' }],
    ] as const) {
      const w = await setup(command, params, { resolve: missing })
      try {
        const answer =
          command === 'output'
            ? await w.binding.output({ id: 'b9', after: null })
            : await w.binding.terminate({ id: 'b9', reason: 'done' })
        expect(answer).toEqual({ failure: { kind: 'not-found', id: 'b9' } })
        expect(w.calls.map(call => call.method)).toEqual(['resolve'])
      } finally {
        await w.close()
      }
    }
  })

  it('output reads the call by its reference from Tool, after the given position (C24)', async () => {
    const output = { kind: 'open', from: '8', through: '14', total: '14', text: 'three' } as const
    const w = await setup('output', { id: 'b1', after: '8' }, { output })
    try {
      expect(await w.binding.output({ id: 'b1', after: '8' })).toEqual({
        ok: { id: 'b1', status: 'running', output: { kind: 'open', text: 'three', next: '14' } },
      })
      expect(w.calls.find(call => call.method === 'output')?.input).toEqual({
        principal: w.principal,
        tenant: w.tenant,
        reference: producer.call,
        after: '8',
        maxBytes: 16_384,
      })
    } finally {
      await w.close()
    }
  })

  it('output of a settled call says it ended and still reads its sealed output', async () => {
    const output = { kind: 'sealed', from: '0', through: '4', total: '4', text: 'done' } as const
    const w = await setup(
      'output',
      { id: 'b1' },
      {
        resolve: { ok: { producer, settled: 'input' } },
        output,
      },
    )
    try {
      expect(await w.binding.output({ id: 'b1', after: null })).toEqual({
        ok: { id: 'b1', status: 'ended', output: { kind: 'sealed', text: 'done', next: '4' } },
      })
    } finally {
      await w.close()
    }
  })

  it("terminate is the agent's stop with the reason, under an operation fixed by this call", async () => {
    const w = await setup('terminate', { id: 'b1', reason: 'not needed' })
    try {
      const one = await w.binding.terminate({ id: 'b1', reason: 'not needed' })
      expect(one).toEqual({ ok: { id: 'b1', kind: 'requested' } })
      const tenant = tenantCodec.encode(w.tenant)
      if (!tenant.ok) throw new Error('fixture tenant')
      const operation = deriveSessionOperation({
        kind: 'stop-tool-call',
        tenant: tenant.value,
        session,
        call: w.call,
      })
      expect(w.calls.find(call => call.method === 'stop')?.input).toEqual({
        principal: w.principal,
        tenant: w.tenant,
        session,
        operation,
        producer,
        reason: 'not needed',
      })
    } finally {
      await w.close()
    }
  })

  it('terminate of a settled call answers ended and stops nothing', async () => {
    const w = await setup(
      'terminate',
      { id: 'b1', reason: 'late' },
      {
        resolve: { ok: { producer, settled: 'kept' } },
      },
    )
    try {
      expect(await w.binding.terminate({ id: 'b1', reason: 'late' })).toEqual({
        ok: { id: 'b1', kind: 'ended' },
      })
      expect(w.calls.map(call => call.method)).toEqual(['resolve'])
    } finally {
      await w.close()
    }
  })

  it('answers only the arguments this call fixed: another id, reason or command is denied', async () => {
    const w = await setup('terminate', { id: 'b1', reason: 'not needed' })
    try {
      expect(await w.binding.terminate({ id: 'b2', reason: 'not needed' })).toEqual({
        failure: { kind: 'denied' },
      })
      expect(await w.binding.terminate({ id: 'b1', reason: 'other' })).toEqual({
        failure: { kind: 'denied' },
      })
      expect(await w.binding.output({ id: 'b1', after: null })).toEqual({
        failure: { kind: 'denied' },
      })
      expect(w.calls).toEqual([])
    } finally {
      await w.close()
    }
  })
})
