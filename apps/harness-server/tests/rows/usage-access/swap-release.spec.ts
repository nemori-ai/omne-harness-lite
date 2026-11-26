// @module-tag slow
import { ask } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { askControl } from '../../../src/control-port.ts'
import { until } from '../../support/listening.ts'
import { officialLayer } from '../../support/official-layer.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { publisher, versionDirectory } from '../../support/version-directory.ts'

type Held = { __usageHeld?: number; __usageGate?: Promise<void> }
const held = globalThis as Held

/** A generation as the release ships it; `mark` makes one version directory differ from another. */
const SHIPPED = (mark: string) =>
  `// ${mark}\nexport const row = kit => kit.shipped('usage-access')\n`

/** A generation whose calls wait for the test: one it took stays in flight until the gate opens, then is denied. */
const SLOW = `export async function row(kit) {
  const { createUsageAccessPlugin } = await kit.use('@omne-harness/usage-access/cordis')
  const shipped = kit.shipped('usage-access')
  const plugin = createUsageAccessPlugin({
    usage: () => undefined,
    principals: () => ({
      async actingFor() {
        globalThis.__usageHeld = (globalThis.__usageHeld ?? 0) + 1
        await globalThis.__usageGate
        return { refused: 'denied' }
      },
    }),
  })
  return { declaration: shipped.declaration, plugin: { ...plugin, inject: shipped.declaration.injects } }
}
`

const BAD = `export function row(kit) {
  return {
    declaration: kit.shipped('usage-access').declaration,
    plugin: { apply() { throw new Error('this version cannot start') } },
  }
}
`

const QUERY = [
  'query-usage',
  '--since',
  '2026-11-25T00:00:00Z',
  '--before',
  '2026-12-25T00:00:00Z',
  '--zone',
  'UTC',
]
const usage = (tree: ReleaseTree) => tree.cli(QUERY)
/** What a query answered, without the identity of the request that asked. */
const answerOf = (run: Awaited<ReturnType<typeof usage>>): unknown[] => [
  run.status,
  (JSON.parse(run.stdout) as { outcome: string; body: unknown }).outcome,
  (JSON.parse(run.stdout) as { body: unknown }).body,
]
const swap = (tree: ReleaseTree, directory: string) =>
  askControl(tree.env.stateRoot, { op: 'swap', row: 'usage-access', directory })

describe('发行树：服务不停换 usage-access（C15、C16）', () => {
  it('换三次：用量一直答得出；在途的请求在旧的一代上答完；别的行没有重跑；坏的一版被拒，旧的照常', async () => {
    const key = publisher()
    const slow = versionDirectory(SLOW, key)
    const second = versionDirectory(SHIPPED('second'), key)
    const third = versionDirectory(SHIPPED('third'), key)
    const bad = versionDirectory(BAD, key)
    let open: () => void = () => undefined
    held.__usageHeld = 0
    held.__usageGate = new Promise<void>(resolve => (open = resolve))
    const script = toolCallsThenText(() => [])
    await onReleaseTree({ script, publisherKeys: [key.publicKey] }, async tree => {
      const before = officialLayer(tree)
      // At every change of the registry the protocol has exactly one generation in service: no gap, no two at once.
      const standings: string[] = []
      tree.scope.root.on('dynamis-cordis/changed', registry => {
        standings.push(ask(registry, 'access.protocols', 'usage/v1', []).kind)
      })
      const first = await usage(tree)
      expect(first.status, first.stderr).toBe(0)
      expect(answerOf(first).slice(0, 2)).toEqual([0, 'succeeded'])

      expect(await swap(tree, slow)).toEqual([
        expect.anything(),
        expect.objectContaining({ outcome: 'swapped' }),
      ])
      const inFlight = usage(tree)
      await until(
        () => held.__usageHeld === 1,
        'the query to be taken by the slow generation',
        20_000,
      )

      // The next generation takes over while that call is in flight.
      const answer = await swap(tree, second)
      expect(answer[0]).toMatchObject({ kind: 'impact', way: 'implementation', reruns: [] })
      expect(answer.at(-1)).toMatchObject({ outcome: 'swapped' })
      const fresh = await usage(tree)
      expect(answerOf(fresh)).toEqual(answerOf(first))
      expect(held.__usageHeld).toBe(1)

      // The call in flight ends on the generation that took it.
      open()
      const ended = await inFlight
      expect(ended.status).not.toBe(0)
      expect(`${ended.stdout}${ended.stderr}`).toContain('denied')

      expect((await swap(tree, third)).at(-1)).toMatchObject({ outcome: 'swapped' })
      const refused = await swap(tree, bad)
      expect(refused.at(-1)).toMatchObject({
        outcome: 'refused',
        reason: 'did-not-start',
        detail: 'this version cannot start',
      })
      const last = await usage(tree)
      expect(answerOf(last)).toEqual(answerOf(first))

      expect(standings.length).toBeGreaterThanOrEqual(3)
      expect(standings.filter(kind => kind !== 'one')).toEqual([])

      // Only the swapped row has a new fiber; every other row of the official layer is the one that started.
      const after = officialLayer(tree)
      const changed = [...before].filter(([row, was]) => after.get(row)?.fiber !== was.fiber)
      expect(changed.map(([row]) => row)).toEqual(['usage-access'])
      expect(tree.records.filter(r => r.kind === 'row-swap').map(r => r['source'])).toEqual([
        'publisher',
        'publisher',
        'publisher',
      ])
      await new Promise(resolve => setTimeout(resolve, 200))
      const stray = ['swap-mismatch', 'row-supervision', 'supervision-exit']
      expect(tree.records.filter(r => stray.includes(r.kind))).toEqual([])
    })
  }, 120_000)
})
