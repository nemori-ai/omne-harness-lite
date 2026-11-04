// The history pages a reader sees (session-contract SPEC「条目的存储形式」, R2-D357): the storage view
// pages the stored form of revision 4; the faces give the payload of the full form. A page that
// names the SE01 reads the snapshot once through the same view; any other page reads nothing more.
// Each case fails when a marker reaches a reader, or when a page without such a row reads the
// snapshot.
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryEntry, HistoryPage } from '@omne-harness/session-contract'
import { creation, evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'
import { sqlBackend } from './fixtures/sql.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

type Tree = HistoryEntry['payload']
const plainOf = (tree: Tree): unknown => {
  switch (tree.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return tree.value
    case 'number':
      return Number(tree.lexeme)
    case 'array':
      return tree.items.map(plainOf)
    case 'object':
      return Object.fromEntries(tree.entries.map(item => [item.key, plainOf(item.value)]))
  }
}
const markers = (value: unknown): string[] =>
  typeof value === 'string'
    ? value.startsWith('=session.') || value.startsWith('=origin.')
      ? [value]
      : []
    : typeof value === 'object' && value !== null
      ? Object.values(value).flatMap(markers)
      : []

const shape = (commands: readonly string[]): Tree => ({
  kind: 'object',
  entries: [
    {
      key: 'commands',
      value: { kind: 'array', items: commands.map(value => ({ kind: 'string', value })) },
    },
  ],
})
const resident = (capability: string, commands: readonly string[]) => ({
  capability,
  version: '1',
  shape: shape(commands),
  admitted: evidence(`${capability}@1`),
})

async function created(backend = memoryBackend, count = 2): Promise<Harness> {
  const h = await harness({ backend })
  open.push(h)
  succeeded(
    await h.faces('intake').management.create({
      ...h.access(),
      operation: operationId('create-session-1'),
      creation: creation({
        residentAdoption: {
          residents: [resident('Files', ['read', 'write']), resident('Shell', ['run'])].slice(
            0,
            count,
          ),
          keys: [
            { capability: 'Files', key: 'rk1:files' as never },
            { capability: 'Shell', key: 'rk1:shell' as never },
          ].slice(0, count),
        },
      }),
    }),
    'create',
  )
  await h.accept('input-1')
  return h
}

const page = async (h: Harness, kinds: readonly string[]): Promise<HistoryPage> =>
  succeeded(
    await h.faces('reader').history.begin({
      ...h.access(),
      kinds,
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
    }),
    'history.begin',
  )

describe('history pages give the payload of the full form', () => {
  it('a page without the SE01 expands the initial SE08 from the snapshot, read once through the same view', async () => {
    const h = await created()
    const work = succeeded(await h.faces('coordinator').work.readWork(h.access()), 'readWork')
    h.view.reset()
    const read = await page(h, ['session.adoption', 'session.tool-resident-admitted'])
    expect(read.entries.map(entry => entry.kind)).toEqual([
      'session.adoption',
      'session.tool-resident-admitted',
      'session.tool-resident-admitted',
    ])
    expect(read.entries.flatMap(entry => markers(plainOf(entry.payload)))).toEqual([])
    const { candidate: _candidate, ...adoption } = work.initialization!.initialAdoption
    expect(
      (plainOf(read.entries[0]!.payload) as { initialization: { adoption: unknown } })
        .initialization.adoption,
    ).toEqual(JSON.parse(JSON.stringify(adoption)))
    expect(h.view.calls().map(call => call.method)).toEqual(['history.begin', 'readWork'])
    // The SE01 does not change: a later page of the same session takes the kept adoption.
    h.view.reset()
    await page(h, ['session.adoption'])
    expect(h.view.calls().map(call => call.method)).toEqual(['history.begin'])
  })

  it('the SE01 gets its resident shapes back; a page of messages reads no snapshot', async () => {
    const h = await created()
    h.view.reset()
    const all = await page(h, [])
    const se01 = plainOf(all.entries[0]!.payload) as {
      initialAdoption: { newResidents: { shape: unknown }[] }
      input: unknown
    }
    expect(se01.initialAdoption.newResidents.map(item => item.shape)).toEqual([
      shape(['read', 'write']),
      shape(['run']),
    ])
    expect(all.entries.flatMap(entry => markers(plainOf(entry.payload)))).toEqual([])
    expect(h.view.calls().map(call => call.method)).toEqual(['history.begin', 'readWork'])
    h.view.reset()
    const messages = await page(h, ['message.user'])
    expect(messages.entries).toHaveLength(1)
    expect(h.view.calls().map(call => call.method)).toEqual(['history.begin'])
  })

  it(
    'times a page that needs the snapshot against one that does not, on the real SQL pair',
    { tags: ['slow'] },
    async () => {
      // Slow: real sqlite-provider Workers and many timed reads.
      // No resident: the SQL fixture bounds the statements of one commit (command_limit).
      const h = await created(sqlBackend, 0)
      const time = async (kinds: readonly string[]) => {
        for (let i = 0; i < 20; i++) await page(h, kinds)
        const samples: number[] = []
        for (let i = 0; i < 200; i++) {
          const start = process.hrtime.bigint()
          await page(h, kinds)
          samples.push(Number(process.hrtime.bigint() - start) / 1000)
        }
        samples.sort((a, b) => a - b)
        return {
          median: Number(samples[100]!.toFixed(1)),
          p95: Number(samples[190]!.toFixed(1)),
        }
      }
      const firstPage = async () => {
        const start = process.hrtime.bigint()
        await page(h, ['session.adoption'])
        return Number((Number(process.hrtime.bigint() - start) / 1000).toFixed(1))
      }
      const result = {
        // The first page of the session that holds the initial SE08: one snapshot read.
        firstWithSnapshotRead: await firstPage(),
        // Later pages with the initial SE08: the kept adoption, no read.
        withReference: await time(['session.adoption']),
        // A page of the same size class without a reference.
        withoutReference: await time(['message.user']),
      }
      console.log(`HISTORY-PAGES ${JSON.stringify(result)}`)
      expect(result.withReference.median).toBeGreaterThan(0)
    },
  )
})
