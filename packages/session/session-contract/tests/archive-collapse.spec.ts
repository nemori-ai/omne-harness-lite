import { describe, expect, it } from 'vitest'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import {
  backgrounded,
  backgroundedOf,
  bindCall,
  bound,
  commitEntries,
  observation,
} from './background-scene.ts'

const OTHER = { kind: 'tool', call: 'call-other' } as const

const archive = async (c: Awaited<ReturnType<typeof bound>>) =>
  succeeded(
    await c.s.commit({
      kind: 'control',
      input: { ...c.s.base, operation: operationId('archive'), intent: { kind: 'archive' } },
    }),
    'archive',
  )

describe('an archive answers what it withdrew (C28)', () => {
  it('the Run it ended and each call in the background', async () => {
    const c = await bound()
    await bindCall(c.s, OTHER)
    const parts = [[backgrounded], [backgroundedOf(OTHER)]]
    succeeded(await commitEntries(c, observation(c, 'p', 0, parts)), 'placeholders')
    expect(await archive(c)).toMatchObject({ collapsed: { runs: 1, backgroundCalls: 2 } })
  })

  it('a call still in the foreground is not counted as one in the background', async () => {
    const c = await bound()
    expect(await archive(c)).toMatchObject({ collapsed: { runs: 1, backgroundCalls: 0 } })
  })

  it('without a Run it counts no Run', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    succeeded(
      await c.s.commit({
        kind: 'cancelRun',
        input: { ...c.s.base, operation: operationId('cancel'), run: c.run, urgency: 'graceful' },
      }),
      'cancel',
    )
    expect(await archive(c)).toMatchObject({ collapsed: { runs: 0, backgroundCalls: 1 } })
  })

  it('other controls carry no collapse', async () => {
    const c = await bound()
    const answer = succeeded(
      await c.s.commit({
        kind: 'control',
        input: {
          ...c.s.base,
          operation: operationId('cancel-control'),
          intent: { kind: 'cancel-run', run: c.run, urgency: 'graceful' },
        },
      }),
      'cancel',
    )
    expect(answer).toMatchObject({ collapsed: null })
  })
})
