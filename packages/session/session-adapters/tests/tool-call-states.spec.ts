import { describe, expect, it, vi } from 'vitest'
import { sampleReceivedToolAccount } from '@omne-harness/agent-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import type { CallOutput, ToolState } from '@omne-harness/tool-contract'
import { createToolCallStates, lastLineOf } from '../src/cordis/tool-call-states.ts'

const access = memoryAccess('tester', 'call-states')
const entry = sampleReceivedToolAccount(access.tenant, 'call-states')
if (entry.delivery.producer !== 'tool') throw new Error('fixture: a Tool entry')
const producer: { kind: 'tool'; call: string } = {
  kind: 'tool',
  call: entry.delivery.key.reference,
}

const control = (kind: string) => ({
  intent: { kind: 'stop' },
  progress: kind === 'pending' ? { kind, diagnostic: 'sent' } : { kind, evidence: {} },
})

function states(state: Partial<ToolState> | 'away' | 'refused', output: CallOutput | 'fails') {
  const runtime = {
    queries: {
      lookup: vi.fn(async () =>
        state === 'refused'
          ? fail({ kind: 'denied', action: 'lookup' })
          : succeed({ kind: 'found' as const, state: state as ToolState }),
      ),
      readOutput: vi.fn(async () =>
        output === 'fails'
          ? fail({ kind: 'unavailable', dependency: 'body-reader', diagnostic: 'down' })
          : succeed(output),
      ),
    },
  }
  return createToolCallStates<string>({
    tools: () => (state === 'away' ? null : (runtime as never)),
    principal: async () => succeed('session:coordinator'),
  }).read({ tenant: access.tenant, session: access.session, producer })
}

const part = (text: string): CallOutput => ({
  kind: 'open',
  from: '0',
  through: String(text.length),
  total: String(text.length),
  text,
})

describe('Session reads the state of a background call from Tool, and keeps none of it', () => {
  it('maps the phase of the call and the progress of its last stop', async () => {
    expect(await states({ phase: 'queued', controls: [] }, { kind: 'none' })).toEqual(
      succeed({ phase: 'queued', stop: null, lastLine: null }),
    )
    expect(await states({ phase: 'running', controls: [] }, part('a\nb\n'))).toEqual(
      succeed({ phase: 'running', stop: null, lastLine: 'b' }),
    )
    for (const [progress, stop] of [
      ['pending', 'pending'],
      ['accepted', 'accepted'],
      ['stopped', 'stopped'],
    ] as const)
      expect(
        await states(
          { phase: 'settled', controls: [control(progress)] as never },
          { kind: 'none' },
        ),
      ).toEqual(succeed({ phase: 'settled', stop, lastLine: null }))
  })

  it('answers unavailable when Tool is away or refuses, and leaves the last line out when the output cannot be read', async () => {
    expect(await states('away', { kind: 'none' })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await states('refused', { kind: 'none' })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await states({ phase: 'running', controls: [] }, 'fails')).toEqual(
      succeed({ phase: 'running', stop: null, lastLine: null }),
    )
  })

  it('takes the last line that is not blank, cut to a bound', () => {
    expect(lastLineOf('one\ntwo\n\n  \n')).toBe('two')
    expect(lastLineOf('\n \n')).toBeNull()
    const long = lastLineOf('x'.repeat(500))
    expect([...(long ?? '')]).toHaveLength(160)
    expect(long?.endsWith('…')).toBe(true)
  })
})
