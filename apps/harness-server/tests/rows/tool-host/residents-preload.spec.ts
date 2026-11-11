// 首装与 create 的常驻工具（L3 评审 N6）。coding 的 create 经 adoption-sources 的采用规划器
// （`createAdoptionPlanner`，G-RESIDENTS 的 `residents.ts` 用的就是它）为 Files、Shell 规划常驻：每个名字要么已有
// 唯一的 live 贡献，要么由会话的 access 首装。会话 access 装不了官方作者，所以发行树里只有 tool-host 行的首装
// （发行登记者）能让两者 live。这里用真实的 tool-bindings 与 tool-host 行：
// - 首装成功：规划给出两个常驻（对照）；
// - 首装失败（缺运维者构造值）或尚未开始：规划答 unavailable，create 随之失败关闭（G-RESIDENTS 用例
//   「a named tool that is not live fails the creation」给出 create 一侧的答复）。
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolBindingScope } from '@omne-harness/tool-contract/provider'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  createAdoptionPlanner,
  type AdoptionDefinition,
} from '../../../src/rows/adoption-sources/planner.ts'
import { toolBindingsRow } from '../../../src/rows/tool-bindings/index.ts'
import { createToolHostPlugin } from '../../../src/rows/tool-host/index.ts'
import { access } from '../adoptions/support.ts'
import { got, okOf } from '../../entry/support.ts'
import {
  TEST_CONSTRUCTION,
  authorityOf,
  entryOf,
  releaseFixture,
  type ReleaseFixture,
} from './support.ts'

const CODING = ['Files', 'Shell', 'TodoItems', 'Tools', 'Web'] as const
const SYSTEM = { scope: 'system' } as const
const roots: ReleaseFixture[] = []
afterEach(async () => {
  for (const fixture of roots.splice(0)) await fixture.root.fiber.dispose()
})

/** The first definition of a release tool, as G-RESIDENTS builds it from the trusted snapshot. */
function definitionOf(fixture: ReleaseFixture, name: string): AdoptionDefinition {
  const { adoption } = entryOf(fixture.manifest, name).asset
  return {
    authority: authorityOf(fixture.manifest, name),
    version: adoption.revision,
    admitted: {
      owner: adoption.owner,
      record: `tool-release.json#${name}/asset`,
      revision: adoption.revision,
      digest: adoption.digest,
    },
  }
}

async function until(ready: () => boolean) {
  const end = Date.now() + 8000
  while (!ready() && Date.now() < end) await new Promise(r => setTimeout(r, 20))
  return ready()
}

async function treeWith(preload: boolean, construction: unknown) {
  const fixture = await releaseFixture()
  roots.push(fixture)
  await fixture.root.plugin(toolBindingsRow)
  await fixture.root.plugin(createToolHostPlugin({ preload }), { construction })
  const registry = got(fixture.root.get(toolBindingsKey), 'toolBindings') as {
    snapshot(scope: ToolBindingScope<unknown>): { ok: readonly unknown[] }
  }
  const live = () => okOf(registry.snapshot(SYSTEM), 'snapshot').length
  const warnings = () =>
    fixture.logs.filter(message => message.name === 'tool-host' && message.type === 'warn').length
  const planner = createAdoptionPlanner<unknown>({
    readBindings: () => fixture.root.get(toolBindingsKey) as never,
    readGenerations: () => fixture.root.get(toolGenerationsKey) as never,
    definitionFor: name => definitionOf(fixture, name),
  })
  const plan = () => planner.plan(access as never, { recorded: [], capabilities: CODING })
  return { live, warnings, plan }
}

describe('the resident tools of a coding create follow the start load', () => {
  it(
    'after the start load, the planner gives the five release tools as residents',
    { timeout: 20_000 },
    async () => {
      const { live, plan } = await treeWith(true, TEST_CONSTRUCTION)
      expect(await until(() => live() === CODING.length)).toBe(true)
      const planned = await plan()
      if (!('ok' in planned)) throw new Error(`plan: ${JSON.stringify(planned)}`)
      expect(planned.ok.material.keys.map(pair => pair.capability)).toEqual([...CODING])
    },
  )

  it(
    'a failed start load (no operator construction) leaves the create unavailable',
    { timeout: 20_000 },
    async () => {
      const { live, warnings, plan } = await treeWith(true, {})
      expect(await until(() => warnings() >= CODING.length)).toBe(true)
      expect(live()).toBe(0)
      expect(await plan()).toEqual({ failure: { kind: 'unavailable' } })
    },
  )

  it(
    'before the start load, a session access cannot load the official authors: unavailable',
    { timeout: 20_000 },
    async () => {
      const { live, plan } = await treeWith(false, TEST_CONSTRUCTION)
      expect(await plan()).toEqual({ failure: { kind: 'unavailable' } })
      expect(live()).toBe(0)
    },
  )
})
