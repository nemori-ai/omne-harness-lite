import { readTenantText } from '@omne-harness/public-contract'
import { createComposer } from '@omne-harness/slash-command-contract'
import { openHelper, type SlashCommandClient } from '@omne-harness/slash-command-ui'
import { describe, expect, it } from 'vitest'

const CATALOG = {
  entries: [
    { full: 'skill:review', space: 'skill', name: 'review', kind: 'reference', title: '评审' },
    { full: 'skill:release', space: 'skill', name: 'release', kind: 'reference', title: '发布' },
  ],
  missing: [],
}

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

type Stream = { push(): void; end(): void; signal: AbortSignal }

function fake() {
  const reads: unknown[] = []
  const streams: Stream[] = []
  let answer: () => unknown = () => ({ outcome: 'succeeded', body: CATALOG })
  const client = {
    'read-catalog': async (body: unknown) => {
      reads.push(body)
      return answer()
    },
    observe: {
      'observe-catalog': (_open: unknown, { signal }: { signal: AbortSignal }) => {
        const queue: ('frame' | 'end')[] = []
        let wake: (() => void) | null = null
        const put = (item: 'frame' | 'end') => {
          queue.push(item)
          wake?.()
        }
        signal.addEventListener('abort', () => put('end'))
        streams.push({ push: () => put('frame'), end: () => put('end'), signal })
        return {
          async next() {
            while (queue.length === 0) await new Promise<void>(go => (wake = go))
            wake = null
            return queue.shift() === 'end'
              ? { done: true, value: { kind: 'aborted' } }
              : { done: false, value: { kind: 'changed' } }
          },
        }
      },
    },
  } as unknown as SlashCommandClient
  return { client, reads, streams, answerWith: (next: () => unknown) => (answer = next) }
}
const settle = () => new Promise(go => setTimeout(go, 0))

describe('the helper of one composer', () => {
  it('reads the list of its session, and reads it again on each frame and after a refusal that says it changed', async () => {
    const { client, reads, streams } = fake()
    const later: (() => void)[] = []
    const helper = openHelper(
      client,
      createComposer(),
      { tenant: TENANT, session: 'session-1' },
      (_ms, run) => {
        later.push(run)
        return () => {}
      },
    )
    await settle()
    expect(reads).toEqual([{ tenant: readTenantText(TENANT), session: 'session-1' }])
    helper.input('/re', 3)
    expect(helper.read().menu?.items.map(item => item.label)).toEqual(['/review', '/release'])
    streams[0]?.push()
    await settle()
    expect(reads).toHaveLength(2)
    helper.refused('no such command: /nope')
    helper.refused('what was shown changed: now {}, was {}')
    await settle()
    expect(reads).toHaveLength(3)
    streams[0]?.end()
    await settle()
    expect(later).toHaveLength(1)
    later[0]?.()
    await settle()
    expect([streams.length, reads.length]).toEqual([2, 4])
  })

  it('says the list cannot be had when the read fails, and stops all on close', async () => {
    const { client, streams, answerWith } = fake()
    answerWith(() => ({ outcome: 'limited', body: { resource: 'x', limit: 1 } }))
    const helper = openHelper(client, createComposer(), { tenant: TENANT, session: 'session-1' })
    const heard: number[] = []
    helper.subscribe(() => heard.push(1))
    await settle()
    helper.input('/re', 3)
    expect(helper.read()).toMatchObject({ seen: null, menu: { note: '现在取不到能点名的清单' } })
    helper.close()
    expect(streams[0]?.signal.aborted).toBe(true)
    helper.input('x', 1)
    expect(heard.length).toBeGreaterThan(0)
  })

  it('a tenant it cannot read gives no list and asks nothing', async () => {
    const { client, reads } = fake()
    const helper = openHelper(client, createComposer(), {
      tenant: 'not a tenant',
      session: 'session-1',
    })
    await settle()
    helper.input('/re', 3)
    expect([reads, helper.read().seen]).toEqual([[], null])
  })
})
