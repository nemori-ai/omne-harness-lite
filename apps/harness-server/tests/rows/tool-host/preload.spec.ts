// 发行作者的首装（R2-D79 第 4 条、R2-D169 候选 A）：发行行装好后，用发行登记者对受信快照的全部条目调用
// `ensureLoaded`，两个作者在 `toolBindings` 里 live。缺运维者构造值时不装，并在 `tool-host` 记录器写明哪个作者、
// 什么原因。首装的 access 是登记者本身，不是 system 作用域。
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolBindingScope } from '@omne-harness/tool-contract/provider'
import { toolBindingsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { TOOL_RELEASE_REGISTRANT_KEY } from '../../../src/entry/tool-release.ts'
import { createToolHostPlugin, preloadRelease } from '../../../src/rows/tool-host/index.ts'
import { toolBindingsRow } from '../../../src/rows/tool-bindings/index.ts'
import { got, okOf } from '../../entry/support.ts'
import { TEST_CONSTRUCTION, releaseFixture, type ReleaseFixture } from './support.ts'

const SYSTEM = { scope: 'system' } as const
const roots: ReleaseFixture[] = []
afterEach(async () => {
  for (const fixture of roots.splice(0)) await fixture.root.fiber.dispose()
})

async function loaded(preload: boolean, construction: unknown) {
  const fixture = await releaseFixture()
  roots.push(fixture)
  await fixture.root.plugin(toolBindingsRow)
  await fixture.root.plugin(createToolHostPlugin({ preload }), { construction })
  const registry = got(fixture.root.get(toolBindingsKey), 'toolBindings') as {
    snapshot(scope: ToolBindingScope<unknown>): {
      ok: readonly { key: { asset: { name: string } } }[]
    }
  }
  const names = () =>
    okOf(registry.snapshot(SYSTEM), 'snapshot')
      .map(row => row.key.asset.name)
      .sort()
  return { fixture, names }
}

/** Polls `ready` up to 8 s; returns whether it became true. */
async function until(ready: () => boolean) {
  const end = Date.now() + 8000
  while (!ready() && Date.now() < end) await new Promise(r => setTimeout(r, 20))
  return ready()
}

describe('tool-host: the release authors are loaded by the registrant at start', () => {
  it(
    'loads Shell and Files live into toolBindings after the row starts',
    { timeout: 20_000 },
    async () => {
      const { names } = await loaded(true, TEST_CONSTRUCTION)
      await until(() => names().length === 2)
      expect(names()).toEqual(['Files', 'Shell'])
    },
  )

  it(
    'without the start load, nothing is in toolBindings (the row alone loads no author)',
    { timeout: 20_000 },
    async () => {
      const { names } = await loaded(false, TEST_CONSTRUCTION)
      // The same window in which the start load fills the registry in the case above.
      await new Promise(r => setTimeout(r, 1000))
      expect(names()).toEqual([])
    },
  )

  it(
    'without the operator construction loads nothing and names each author and the reason in the row log',
    { timeout: 20_000 },
    async () => {
      const { fixture, names } = await loaded(true, {})
      const warnings = () =>
        fixture.logs
          .filter(message => message.name === 'tool-host' && message.type === 'warn')
          .map(message => message.args.map(String).join(' '))
      expect(await until(() => warnings().length >= 2)).toBe(true)
      expect(names()).toEqual([])
      expect(warnings().some(text => text.includes('Shell') && text.includes('unavailable'))).toBe(
        true,
      )
      expect(warnings().some(text => text.includes('Files') && text.includes('unavailable'))).toBe(
        true,
      )
    },
  )

  it('loads with the release registrant as the access, never the system scope', async () => {
    const fixture = await releaseFixture()
    roots.push(fixture)
    const registrant = got(fixture.root.get(TOOL_RELEASE_REGISTRANT_KEY), 'registrant')
    const seen: unknown[] = []
    const results = await preloadRelease(fixture.root, {
      ensureLoaded: async input => {
        seen.push(input.access)
        return { failure: { kind: 'unavailable', diagnostic: 'test' } }
      },
    })
    expect(seen).toHaveLength(2)
    for (const access of seen) expect(access).toBe(registrant)
    expect(results.map(result => result.outcome)).toEqual(['unavailable', 'unavailable'])
  })

  it('a throw while reading the release is kept in the start load: a warning, no rejection', async () => {
    const fixture = await releaseFixture()
    roots.push(fixture)
    const throwing = new Proxy(fixture.root, {
      get(target, property, receiver) {
        if (property === 'get')
          return () => {
            throw new Error('test: the service read threw')
          }
        return Reflect.get(target, property, receiver) as unknown
      },
    })
    const results = await preloadRelease(throwing, {
      ensureLoaded: async () => {
        throw new Error('unreached')
      },
    })
    expect(results).toEqual([])
    expect(
      fixture.logs.some(
        message =>
          message.name === 'tool-host' &&
          message.type === 'warn' &&
          message.args.map(String).join(' ').includes('the start load threw'),
      ),
    ).toBe(true)
  })
})
