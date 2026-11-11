// The tool lookup of the `agent-context` row (G-TOOLS6): the sixth group over the real release
// Catalog. Real Cordis carries the release entry objects, the `tool-bindings` row (Catalog) and the
// `tool-host` row, which loads the release authors of Files and Shell; the lookup reads them through
// `toolCatalog.inspect` with the release consumer. The definitions the model would see are compared
// with the definitions derived from the release modules themselves.
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Adoption, RuntimeConditions } from '@omne-harness/agent-contract'
import { toolsSourceOf } from '@omne-harness/agent-context'
import { fail, succeed } from '@omne-harness/operation-result'
import { declareTools } from '@omne-harness/request-context-contract'
import { commandCallSchema, commandMenu, type ToolDefinition } from '@omne-harness/tool-contract'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import {
  ToolCatalogService,
  toolCatalogKey,
  toolGenerationsKey,
  type ToolGenerations,
} from '@omne-harness/tool-cordis-contract/cordis'
import { filesToolModule, shellToolModule } from '@omne-harness/tool-definitions'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { agentContextPluginInput, agentContextRow } from '../../../src/rows/agent-context/index.ts'
import { catalogToolLookup } from '../../../src/rows/agent-context/tools.ts'
import {
  bundleScope,
  bundleSettle,
  startAuthorityProxy,
} from '../../../src/rows/tool-bindings/index.ts'
import { createReleaseAvailability } from '../../../src/rows/tool-bindings/availability.ts'
import { createReleaseCatalogView } from '../../../src/rows/tool-bindings/catalog-view.ts'
import { releaseOf } from '../../../src/entry/tool-release.ts'
import { createLocalToolBindingsPlugin } from '@omne-harness/tool-host-local/cordis'
import { createToolHostPlugin } from '../../../src/rows/tool-host/index.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { fixtureTenant, got, okOf } from '../../entry/support.ts'
import {
  TEST_CONSTRUCTION,
  authorityOf,
  entryOf,
  releaseFixture,
  tree,
  type ReleaseFixture,
} from '../tool-host/support.ts'

const SYSTEM = { scope: 'system' } as const

/** The release fixture with the Catalog and the release authors of Files and Shell loaded. */
async function loaded(): Promise<ReleaseFixture> {
  const fixture = await releaseFixture()
  // This lookup test supplies a scoped Session/adoption double; the view and catalog are real.
  await fixture.root.plugin({
    name: 'context-tools-bindings-fixture',
    apply(ctx: Context) {
      const Bindings = createLocalToolBindingsPlugin({
        availability: createReleaseAvailability(ctx),
        view: createReleaseCatalogView({
          verifier: () => ctx.get('principalVerifier'),
          release: () => releaseOf(ctx),
          readWork: async input =>
            succeed({
              session: input.session,
              tenant: input.tenant,
              lifecycle: 'active',
              frozen: null,
              residents: [],
              definition: { name: 'coding', adopted: binding('coding') },
            }),
          resolve: async () =>
            succeed({
              definition: {
                category: 'AgentDefinition',
                name: 'coding',
                attributes: [],
                references: ['Files', 'Shell'].map(name => ({
                  capability: { category: 'Tool', name },
                })),
              },
            }),
        }),
        search: { k1: 1.2, b: 0.75, maxCachedCorpora: 16 },
        authority: startAuthorityProxy(ctx),
        scope: bundleScope(ctx),
        settle: bundleSettle(ctx),
      })
      new Bindings(ctx)
    },
  })
  await fixture.root.plugin(createToolHostPlugin(), { construction: TEST_CONSTRUCTION })
  const generations = got(
    fixture.root.get(toolGenerationsKey),
    'toolGenerations',
  ) as ToolGenerations<unknown, unknown, never>
  for (const name of ['Files', 'Shell'] as const) {
    const done = await generations.ensureLoaded({
      authority: authorityOf(fixture.manifest, name),
      access: SYSTEM,
    })
    expect(done).toMatchObject({ ok: { state: 'loaded' } })
  }
  return fixture
}

/** The definition that the release module itself derives for `name`. */
function releaseDefinition(fixture: ReleaseFixture, name: 'Files' | 'Shell'): ToolDefinition {
  const created =
    name === 'Files'
      ? okOf(filesToolModule.createAuthor(tree(TEST_CONSTRUCTION.Files)), 'author')
      : okOf(shellToolModule.createAuthor(tree(TEST_CONSTRUCTION.Shell)), 'author')
  return okOf(
    judgeToolDefinition(
      deriveDefinition(governanceOf(entryOf(fixture.manifest, name)), created.facts),
    ),
    'definition',
  )
}

const tenant = fixtureTenant('a')
function workAccess(fixture: ReleaseFixture, of = tenant) {
  const principal = okOf(
    sessionWorkIssuerOf(fixture.env)({ tenant: of, session: 'ses-1' }),
    'issue',
  )
  return { principal: principal as unknown, tenant }
}
const binding = (name: string): Adoption => ({
  owner: '@omne-harness/harness-server',
  name,
  revision: '0.0.0',
  digest: `sha256:admitted-${name}`,
})
const conditionsWith = (bindings: readonly Adoption[]): RuntimeConditions => {
  const evidence = { owner: 'test', record: 'r', revision: '1', digest: 'sha256:0' }
  return {
    source: evidence,
    configuration: binding('coding'),
    progression: { kind: 'continue', basis: evidence },
    model: binding('model'),
    context: evidence,
    bindings,
  }
}

describe('agent-context row: the sixth group over the release Catalog', () => {
  it('hands the Catalog lookup to the plugin factory and keeps the seven injects', () => {
    const declared = got(rowDeclarationOf(agentContextRow), 'declaration')
    expect(declared.manifest.injects).toHaveLength(7)
    expect(declared.manifest.injects).not.toContain(toolCatalogKey)
    expect(agentContextPluginInput).toEqual({ toolLookup: catalogToolLookup })
  })

  it('gives Files and Shell exactly, each with the release definition, and the model sees their commands, summaries and schemas', async () => {
    const fixture = await loaded()
    const bindings = [binding('Files'), binding('Shell')]
    const read = await toolsSourceOf(catalogToolLookup(fixture.root))({
      access: workAccess(fixture),
      conditions: conditionsWith(bindings),
    })
    if (read.kind !== 'value') throw new Error(`expected tools, got ${JSON.stringify(read)}`)
    const files = releaseDefinition(fixture, 'Files')
    const shell = releaseDefinition(fixture, 'Shell')
    expect(
      read.value.map(tool => [tool.resident, tool.binding, tool.availability.definition]),
    ).toEqual([
      [true, bindings[0], files],
      [true, bindings[1], shell],
    ])
    // One declaration per tool (D-94): the description ends with the command menu, the
    // arguments schema enumerates the commands.
    const declared = declareTools(read.value).direct
    expect(declared).toEqual(
      [files, shell].map(definition => {
        if (definition.kind !== 'commands') throw new Error('commands')
        return {
          name: definition.name,
          description: `${definition.description}\n\n${commandMenu(definition)}`,
          argumentsSchema: commandCallSchema(definition),
        }
      }),
    )
    for (const definition of [files, shell])
      if (definition.kind === 'commands')
        for (const command of definition.commands)
          expect(declared.find(item => item.name === definition.name)?.description).toContain(
            `\n${command.name} {`,
          )
  })

  it('gives no tool for an empty set of bindings', async () => {
    const fixture = await loaded()
    expect(
      await toolsSourceOf(catalogToolLookup(fixture.root))({
        access: workAccess(fixture),
        conditions: conditionsWith([]),
      }),
    ).toEqual({ kind: 'value', value: [] })
  })

  it('closes the group for a binding the Catalog does not know', async () => {
    const fixture = await loaded()
    expect(
      await toolsSourceOf(catalogToolLookup(fixture.root))({
        access: workAccess(fixture),
        conditions: conditionsWith([binding('Files'), binding('Search')]),
      }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'tool-unknown: Search' })
  })

  it('closes the group without a Catalog, and for a double that is not the contract service', async () => {
    const fixture = await releaseFixture()
    const source = toolsSourceOf(catalogToolLookup(fixture.root))
    const input = { access: workAccess(fixture), conditions: conditionsWith([binding('Files')]) }
    expect(await source(input)).toEqual({ kind: 'unavailable', diagnostic: 'tool-catalog-absent' })
    await fixture.root.plugin({
      name: 'catalog-double',
      apply: (ctx: Context) => {
        ctx.provide(toolCatalogKey, { inspect: async () => fail({ kind: 'denied', action: 'x' }) })
      },
    })
    expect(await source(input)).toEqual({ kind: 'unavailable', diagnostic: 'tool-catalog-absent' })
  })

  it('closes the group when the Catalog read throws, and passes a denial', async () => {
    const fixture = await releaseFixture()
    let mode: 'throw' | 'deny' = 'throw'
    class Scripted extends ToolCatalogService<unknown> {
      readonly inspect: ToolCatalogService<unknown>['inspect'] = async () => {
        if (mode === 'throw') throw new Error('broken')
        return fail({ kind: 'denied', action: 'inspect' })
      }
      readonly usage: ToolCatalogService<unknown>['usage'] = async () =>
        fail({ kind: 'denied', action: 'usage' })
      readonly search: ToolCatalogService<unknown>['search'] = async () =>
        fail({ kind: 'denied', action: 'search' })
    }
    await fixture.root.plugin({
      name: 'catalog-scripted',
      apply: (ctx: Context) => void new Scripted(ctx),
    })
    const source = toolsSourceOf(catalogToolLookup(fixture.root))
    const input = { access: workAccess(fixture), conditions: conditionsWith([binding('Files')]) }
    expect(await source(input)).toEqual({ kind: 'unavailable', diagnostic: 'tool-catalog-failed' })
    mode = 'deny'
    expect(await source(input)).toEqual({ kind: 'denied' })
  })

  it('closes the group for a principal that is not a session work principal of the tenant', async () => {
    const fixture = await loaded()
    const other = workAccess(fixture, fixtureTenant('b'))
    const read = await toolsSourceOf(catalogToolLookup(fixture.root))({
      access: other,
      conditions: conditionsWith([binding('Files')]),
    })
    expect(read).toEqual({ kind: 'denied' })
  })
})
