// `tool-host` 行的发行内置来源（B3-T2a 第 2、4、7、8 项）：真实 Cordis 装 `tool-bindings` 与 `tool-host` 两行，
// 经 `toolGenerations.ensureLoaded` 观察作者是否进入登记表。正控用一个测试给的环境需要 schema（见第一条用例）；
// 生产映射的 schema 在现行 schema-provider 上不可用，对应用例断言它失败关闭（R2-D68 补充的冲突，交回 Reduce）。
import { afterEach, describe, expect, it } from 'vitest'
import { defineSchema, zodDefinition, type SchemaRef } from '@omne-harness/schema-provider'
import { fail } from '@omne-harness/operation-result'
import {
  toolBindingsKey,
  toolGenerationsKey,
  type ToolGenerations,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolBindingRegistry, ToolAuthority } from '@omne-harness/tool-contract/provider'
import { filesToolModule, shellToolModule } from '@omne-harness/tool-definitions'
import { z } from 'zod'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { toolBindingsRow } from '../../../src/rows/tool-bindings/index.ts'
import { createToolHostPlugin } from '../../../src/rows/tool-host/index.ts'
import { releaseAuthorInput } from '../../../src/rows/tool-host/release-author.ts'
import { got } from '../../entry/support.ts'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import {
  TEST_CONSTRUCTION,
  authorityOf,
  entryOf,
  packageCopy,
  releaseFixture,
  releaseFrom,
  tree,
  type ReleaseFixture,
} from './support.ts'

/** 测试给的 schema-provider 可用的环境需要 schema，与执行环境契约的 JSON Schema 同形。 */
const TEST_ENVIRONMENT_NEED: SchemaRef<unknown> = defineSchema({
  id: 'test/environment-need',
  load: async () =>
    zodDefinition({
      revision: '1',
      numbers: 'exact-or-reject',
      schema: z.strictObject({
        facilities: z.array(z.string().min(1)),
        isolation: z.array(z.string().min(1)),
        layers: z.array(
          z.enum(['host_machine', 'stateless_sandbox', 'session_sandbox', 'tenant_sandbox']),
        ),
      }),
    }),
})

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

type Host = ReleaseFixture &
  Readonly<{
    generations: ToolGenerations<unknown, unknown, never>
    registry: ToolBindingRegistry<unknown, unknown, never>
  }>

async function host(
  options: Readonly<{
    fixture?: ReleaseFixture
    construction?: unknown
    environmentNeed?: SchemaRef<unknown>
  }> = {},
): Promise<Host> {
  const fixture = options.fixture ?? (await releaseFixture())
  await fixture.root.plugin(toolBindingsRow)
  const environmentNeed = options.environmentNeed
  await fixture.root.plugin(
    createToolHostPlugin(environmentNeed === undefined ? {} : { environmentNeed }),
    options.construction === undefined ? {} : { construction: options.construction },
  )
  return {
    ...fixture,
    generations: got(fixture.root.get(toolGenerationsKey), 'toolGenerations') as never,
    registry: got(fixture.root.get(toolBindingsKey), 'toolBindings') as never,
  }
}

const SYSTEM = { scope: 'system' } as const
const names = (app: Host) =>
  okOf(app.registry.snapshot(SYSTEM), 'snapshot').map(row => row.key.asset.name)

describe('tool-host: ensureLoaded of the release authors', () => {
  it('loads Shell and Files once the snapshot, the operator values and every check agree', async () => {
    const app = await host({
      construction: TEST_CONSTRUCTION,
      environmentNeed: TEST_ENVIRONMENT_NEED,
    })
    for (const name of ['Shell', 'Files']) {
      const loaded = await app.generations.ensureLoaded({
        authority: authorityOf(app.manifest, name),
        access: SYSTEM,
      })
      expect(loaded).toMatchObject({ ok: { state: 'loaded' } })
    }
    expect(names(app).sort()).toEqual(['Files', 'Shell'])
  })

  it('loads nothing from a tampered tool-definitions copy', async () => {
    const tampered = await packageCopy(true)
    cleanups.push(tampered.remove)
    const app = await host({
      fixture: await releaseFixture(releaseFrom(tampered.root)),
      construction: TEST_CONSTRUCTION,
      environmentNeed: TEST_ENVIRONMENT_NEED,
    })
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Shell'),
      access: SYSTEM,
    })
    expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(names(app)).toEqual([])
  })

  it('answers unavailable and loads nothing without the operator construction', async () => {
    const app = await host({ environmentNeed: TEST_ENVIRONMENT_NEED })
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Files'),
      access: SYSTEM,
    })
    expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(names(app)).toEqual([])
  })

  it('fails closed with the production environment-need mapping (schema-provider refuses it today)', async () => {
    const app = await host({ construction: TEST_CONSTRUCTION })
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Shell'),
      access: SYSTEM,
    })
    expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(names(app)).toEqual([])
  })

  it('denies a tenant access: only the release registrant may register an official author', async () => {
    const app = await host({
      construction: TEST_CONSTRUCTION,
      environmentNeed: TEST_ENVIRONMENT_NEED,
    })
    const tenant = fixtureTenant('a')
    const principal = okOf(sessionWorkIssuerOf(app.env)({ tenant, session: 'ses-1' }), 'issue')
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Shell'),
      access: { principal, tenant },
    })
    expect(loaded).toEqual(fail({ kind: 'denied' }))
    expect(names(app)).toEqual([])
  })
})

describe('tool-host: the release source and loader input', () => {
  async function input(construction: unknown = TEST_CONSTRUCTION) {
    const fixture = await releaseFixture()
    const app = await host({ fixture, environmentNeed: TEST_ENVIRONMENT_NEED })
    return {
      app,
      parts: releaseAuthorInput(app.root, construction as never, {
        environmentNeed: TEST_ENVIRONMENT_NEED,
      }),
    }
  }

  it('resolves the fixed module of the snapshot, whatever else the authority names', async () => {
    const { app, parts } = await input()
    const resolved = okOf(
      await parts.source.resolve(authorityOf(app.manifest, 'Shell')),
      'resolve Shell',
    )
    expect(resolved.module).toBe(shellToolModule)
    expect(resolved.context.access).toBe(app.registrant)
    expect(resolved.context.services).toEqual({})
    expect(resolved.config.settings).toEqual(entryOf(app.manifest, 'Shell').settings)
    const elsewhere: ToolAuthority = {
      ...authorityOf(app.manifest, 'Shell'),
      asset: {
        name: '../../node_modules/evil',
        adoption: authorityOf(app.manifest, 'Shell').asset.adoption,
      },
    }
    expect(await parts.source.resolve(elsewhere)).toEqual(fail({ kind: 'denied' }))
  })

  it('answers unavailable from the source when the operator layer has no value for the author', async () => {
    const { app, parts } = await input({ Shell: TEST_CONSTRUCTION.Shell })
    expect(await parts.source.resolve(authorityOf(app.manifest, 'Files'))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('the loader answers invalid when the definition digest or the settings adoption differs', async () => {
    const { app, parts } = await input()
    const entry = entryOf(app.manifest, 'Files')
    const authority = authorityOf(app.manifest, 'Files')
    const load = (overrides: object) =>
      parts.loaderFor(authority).load({
        ...app.registrant,
        asset: governanceOf(entry),
        settings: entry.settings,
        module: filesToolModule as never,
        services: {},
        ...overrides,
      })
    expect(await load({})).toMatchObject({ ok: { key: { asset: { name: 'Files' } } } })
    expect(
      await load({ asset: { ...governanceOf(entry), requiredCapabilities: ['extra'] } }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'definition' } })
    expect(await load({ settings: { ...entry.settings, digest: 'x' } })).toMatchObject({
      failure: { kind: 'invalid', field: 'settings' },
    })
  })

  it('records no rejection: the promise rejects, so the coordinator answers unavailable', async () => {
    const { app, parts } = await input()
    await expect(
      parts.recordRejection(authorityOf(app.manifest, 'Shell'), 'reason'),
    ).rejects.toThrow(/no durable rejection/)
  })

  it('the construction handed to the author is the operator value', async () => {
    const { app, parts } = await input()
    const resolved = okOf(await parts.source.resolve(authorityOf(app.manifest, 'Files')), 'resolve')
    expect(resolved.config.construction).toEqual(tree(TEST_CONSTRUCTION.Files))
  })
})
