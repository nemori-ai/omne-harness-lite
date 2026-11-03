// `tool-host` 行的发行内置来源（B3-T2a 第 2、4、7、8 项）：真实 Cordis 装 `tool-bindings` 与 `tool-host` 两行，
// 经 `toolGenerations.ensureLoaded` 观察作者是否进入登记表。environment 检查用执行环境契约自带的
// `environmentNeedSchema`（R2-D79）；只有「校验件抛出 / 返回 Promise」两条反例注入别的校验件。
import { afterEach, describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  toolBindingsKey,
  toolGenerationsKey,
  type ToolGenerations,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolBindingRegistry, ToolAuthority } from '@omne-harness/tool-contract/provider'
import { filesToolModule, shellToolModule } from '@omne-harness/tool-definitions'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { toolBindingsRow } from '../../../src/rows/tool-bindings/index.ts'
import { createToolHostPlugin } from '../../../src/rows/tool-host/index.ts'
import {
  checkEnvironmentNeed,
  releaseAuthorInput,
  type EnvironmentNeedValidator,
} from '../../../src/rows/tool-host/release-author.ts'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import type { ToolDefinition } from '@omne-harness/tool-contract'
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
    environmentNeed?: EnvironmentNeedValidator
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
  it('loads Shell and Files on the production path: the real environmentNeedSchema, snapshot and operator values', async () => {
    const app = await host({ construction: TEST_CONSTRUCTION })
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
    })
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Shell'),
      access: SYSTEM,
    })
    expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(names(app)).toEqual([])
  })

  it('answers unavailable and loads nothing without the operator construction', async () => {
    const app = await host()
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Files'),
      access: SYSTEM,
    })
    expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(names(app)).toEqual([])
  })

  const throwing: EnvironmentNeedValidator = {
    '~standard': {
      validate: () => {
        throw new Error('validator failure')
      },
    },
  }
  const asynchronous: EnvironmentNeedValidator = {
    '~standard': { validate: async (value: unknown) => ({ value }) },
  }
  it.each([
    ['throws', throwing],
    ['returns a Promise', asynchronous],
  ])('fails closed and loads nothing when the environment validator %s', async (_, validator) => {
    const app = await host({ construction: TEST_CONSTRUCTION, environmentNeed: validator })
    const loaded = await app.generations.ensureLoaded({
      authority: authorityOf(app.manifest, 'Shell'),
      access: SYSTEM,
    })
    expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(names(app)).toEqual([])
  })

  it('denies a tenant access: only the release registrant may register an official author', async () => {
    const app = await host({ construction: TEST_CONSTRUCTION })
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
    const app = await host({ fixture })
    return {
      app,
      parts: releaseAuthorInput(app.root, construction as never),
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

describe('tool-host: the environment declaration against the real environmentNeedSchema', () => {
  async function shellDefinition(): Promise<ToolDefinition> {
    const fixture = await releaseFixture()
    const created = okOf(shellToolModule.createAuthor(tree(TEST_CONSTRUCTION.Shell)), 'author')
    return okOf(
      judgeToolDefinition(
        deriveDefinition(governanceOf(entryOf(fixture.manifest, 'Shell')), created.facts),
      ),
      'definition',
    )
  }
  const withEnvironment = (definition: ToolDefinition, value: unknown): ToolDefinition => {
    const environment = definition.declarations.environment
    if (environment === null) throw new Error('fixture: Shell declares an environment')
    return {
      ...definition,
      declarations: {
        ...definition.declarations,
        environment: { ...environment, value: tree(value) },
      },
    }
  }

  it('passes the declaration the author makes', async () => {
    expect(checkEnvironmentNeed(await shellDefinition())).toEqual({ ok: undefined })
  })

  it('answers invalid when one field of the declaration is broken', async () => {
    const definition = withEnvironment(await shellDefinition(), {
      facilities: ['command', 'terminal'],
      isolation: [],
      layers: ['cloud'],
    })
    expect(checkEnvironmentNeed(definition)).toMatchObject({
      failure: { kind: 'invalid', field: 'environment' },
    })
  })

  it('answers invalid for an environment declaration under another adoption', async () => {
    const definition = await shellDefinition()
    const environment = definition.declarations.environment
    if (environment === null) throw new Error('fixture: Shell declares an environment')
    const other: ToolDefinition = {
      ...definition,
      declarations: {
        ...definition.declarations,
        environment: { ...environment, adoption: { ...environment.adoption, revision: '2' } },
      },
    }
    expect(checkEnvironmentNeed(other)).toMatchObject({ failure: { kind: 'invalid' } })
  })
})
