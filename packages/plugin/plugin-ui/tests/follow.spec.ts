import { describe, expect, it } from 'vitest'
import { followWanted, listedOf, type Listed } from '@omne-harness/plugin-ui'
import type { PluginProtocol } from '@omne-harness/plugin-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

function tenantOf(text: string): TenantId {
  const read = readTenantText(text)
  if (read === undefined) throw new Error('the tenant of the cases is not a tenant')
  return read
}
const tenant = tenantOf(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}',
)
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const manifest = (name: string, color = 'red'): string =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'a look',
    client: {
      members: [{ point: 'shell.part-style', key: 'notes.send', data: { base: { color } } }],
    },
  })
const given = (name: string, version: string, text = manifest(name)) => ({
  name,
  version,
  manifest: text,
  files: [{ path: 'plugin.json', digest: 'd', bytes: text.length }],
})

type Answer =
  | 'unavailable'
  | 'denied'
  | 'basis-unavailable'
  | 'throws'
  | 'pending'
  | ReturnType<typeof given>[]

function world(...answers: Answer[]) {
  const lists: (readonly Listed[])[] = []
  const slept: number[] = []
  const asked: unknown[] = []
  const opens: unknown[] = []
  const listSignals: AbortSignal[] = []
  let wake: (() => void) | undefined
  let land: ((plugins: ReturnType<typeof given>[]) => void) | undefined
  let closed = 0
  let push: ((frame: 'changed' | 'end') => void) | undefined
  const client = {
    'list-wanted': async (body: unknown, options: { signal: AbortSignal }) => {
      asked.push(body)
      listSignals.push(options.signal)
      const answer = answers.shift() ?? 'unavailable'
      if (answer === 'throws') throw new Error('the transport broke')
      if (answer === 'pending')
        return new Promise(resolve => {
          land = plugins => resolve({ outcome: 'succeeded', body: { plugins } })
        })
      return typeof answer === 'string'
        ? { outcome: answer }
        : { outcome: 'succeeded', body: { plugins: answer } }
    },
    observe: {
      'observe-wanted': async function* (open: unknown, options: { signal: AbortSignal }) {
        opens.push(open)
        const queue: ('changed' | 'end')[] = ['changed']
        let waiting: (() => void) | undefined
        push = frame => {
          queue.push(frame)
          waiting?.()
        }
        options.signal.addEventListener('abort', () => {
          closed += 1
          push?.('end')
        })
        for (;;) {
          if (queue.length === 0) await new Promise<void>(resolve => (waiting = resolve))
          const frame = queue.shift()
          if (frame !== 'changed') return { kind: 'unavailable' as const }
          yield { kind: 'changed' as const }
        }
      },
    },
  } as unknown as ClientOf<PluginProtocol>
  const stop = followWanted({
    client,
    tenant,
    id: 'desktop-1',
    onList: list => lists.push(list),
    sleep: (ms, signal) =>
      new Promise(resolve => {
        slept.push(ms)
        wake = resolve
        signal.addEventListener('abort', () => resolve())
      }),
  })
  return {
    answers,
    lists,
    slept,
    asked,
    stop,
    opens,
    listSignals,
    opened: () => opens.length,
    closed: () => closed,
    land: async (plugins: ReturnType<typeof given>[]) => {
      land?.(plugins)
      await tick()
    },
    frame: async (frame: 'changed' | 'end') => {
      push?.(frame)
      await tick()
    },
    wake: async () => {
      wake?.()
      await tick()
    },
  }
}

describe('what one side is to load of what the source gave', () => {
  it('is each plugin with the members of this side, by name', () => {
    expect(listedOf([given('b', 'v2'), given('a', 'v1')])).toEqual([
      {
        name: 'a',
        version: 'v1',
        members: [
          { point: 'shell.part-style', key: 'notes.send', data: { base: { color: 'red' } } },
        ],
      },
      {
        name: 'b',
        version: 'v2',
        members: [
          { point: 'shell.part-style', key: 'notes.send', data: { base: { color: 'red' } } },
        ],
      },
    ])
  })

  it('leaves out a plugin that has nothing for this side', () => {
    const server = JSON.stringify({ schema: 1, name: 'a', summary: 's', server: { members: [] } })
    expect(listedOf([given('a', 'v1', server)])).toEqual([])
  })

  it('lists a plugin whose manifest cannot be read, with why: it is not a plugin that left', () => {
    expect(listedOf([given('a', 'v1', '{')])).toEqual([
      { name: 'a', version: 'v1', members: [], fault: expect.stringContaining('cannot be read') },
    ])
  })

  it('lists a name once, with why, when the source gave it twice and one of the two cannot be read', () => {
    expect(listedOf([given('a', 'v1', '{'), given('a', 'v2')])).toEqual([
      { name: 'a', version: 'v1', members: [], fault: expect.stringContaining('cannot be read') },
    ])
  })

  it('lists a plugin whose manifest names another plugin, with why', () => {
    expect(listedOf([given('a', 'v1', manifest('b'))])).toEqual([
      {
        name: 'a',
        version: 'v1',
        members: [],
        fault: 'its manifest names b, the list names a',
      },
    ])
  })
})

describe('following what a tenant is to load', () => {
  it('reads when the observation opens, for this tenant and this side', async () => {
    const t = world([given('a', 'v1')])
    await tick()
    expect(t.asked).toEqual([{ tenant, side: 'client' }])
    expect(t.opens).toEqual([{ tenant, side: 'client', client: 'desktop-1' }])
    expect(t.lists.map(list => list.map(each => `${each.name}@${each.version}`))).toEqual([
      ['a@v1'],
    ])
    await t.stop()
  })

  it('reads again each time the source says it may have changed', async () => {
    const t = world([given('a', 'v1')], [given('a', 'v2')], [])
    await tick()
    await t.frame('changed')
    await t.frame('changed')
    expect(t.lists.map(list => list.map(each => each.version))).toEqual([['v1'], ['v2'], []])
    expect(t.opened()).toBe(1)
    await t.stop()
  })

  it.each(['unavailable', 'denied', 'basis-unavailable'] as const)(
    'gives no list when the source answers %s: that is not an empty list; it waits and asks again',
    async answer => {
      const t = world([given('a', 'v1')], answer, [given('a', 'v1')])
      await tick()
      await t.frame('changed')
      expect(t.lists).toHaveLength(1)
      expect(t.slept).toEqual([200])
      expect(t.closed()).toBe(1)
      await t.wake()
      expect(t.lists).toHaveLength(2)
      expect(t.opened()).toBe(2)
      await t.stop()
    },
  )

  it('opens the observation again when it ended, and reads again', async () => {
    const t = world([given('a', 'v1')], [given('a', 'v2')])
    await tick()
    await t.frame('end')
    expect(t.slept).toEqual([200])
    expect(t.asked).toHaveLength(1)
    await t.wake()
    expect(t.opened()).toBe(2)
    expect(t.lists).toHaveLength(2)
    await t.stop()
  })

  it('waits longer each time no list could be read, and starts over once one was', async () => {
    const t = world('unavailable', 'unavailable', [])
    await tick()
    await t.wake()
    await t.wake()
    await t.frame('end')
    expect(t.slept).toEqual([200, 400, 200])
    expect(t.lists).toHaveLength(1)
    await t.stop()
  })

  it('waits longer each time the source breaks, as when it cannot be read', async () => {
    const t = world('throws', 'throws')
    await tick()
    await t.wake()
    expect(t.slept).toEqual([200, 400])
    expect(t.lists).toEqual([])
    await t.stop()
  })

  it('gives no list that lands after it is stopped, and tells the read in flight to stop', async () => {
    const t = world('pending')
    await tick()
    const stopping = t.stop()
    expect(t.listSignals[0]?.aborted).toBe(true)
    await t.land([given('a', 'v1')])
    await stopping
    expect(t.lists).toEqual([])
  })

  it('is woken from its wait when it is stopped', async () => {
    const stop = followWanted({
      client: {
        'list-wanted': async () => ({ outcome: 'unavailable' }),
        observe: {
          'observe-wanted': async function* () {
            yield { kind: 'changed' as const }
            return { kind: 'unavailable' as const }
          },
        },
      } as unknown as ClientOf<PluginProtocol>,
      tenant,
      id: 'desktop-1',
      onList: () => undefined,
      backoff: { delayMs: () => 600_000 },
    })
    await tick()
    await stop()
  })

  it('reads nothing more once it is stopped', async () => {
    const t = world([given('a', 'v1')], [given('a', 'v2')])
    await tick()
    await t.stop()
    await t.frame('changed')
    expect(t.lists).toHaveLength(1)
    expect(t.slept).toEqual([])
  })
})
