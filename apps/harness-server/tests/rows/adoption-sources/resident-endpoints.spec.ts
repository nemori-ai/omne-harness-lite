import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Access } from '@omne-harness/legal-identity'
import { endpointTool, type NamedEntry } from '@omne-harness/mcp-bridge'
import type {
  ActionName,
  DefinitionDigest,
  EndpointName,
  KnownAction,
} from '@omne-harness/mcp-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { jsonOf } from '../../../src/rows/adoption-sources/json.ts'
import { decide, type ResidentTool } from '@omne-harness/session-contract'
import { testingSourceEntry } from '@omne-harness/tool-contract/testing'
import { AdoptionSourcesImpl } from '../../../src/rows/adoption-sources/sources.ts'
import { plannedResidents } from '../../../src/rows/adoption-sources/residents.ts'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { tableMappings } from '../../../src/rows/agent-adoptions/held-definitions.ts'
import { buildTable } from '../../../src/rows/agent-adoptions/table.ts'
import { provideResidentEndpoints } from '../../../src/rows/mcp/resident-endpoints.ts'
import { got } from '../../entry/support.ts'
import { access, createCommand, entryConfig, factsOf, mappingConfig } from '../adoptions/support.ts'
import { releaseFixture } from '../tool-host/support.ts'

type Plain = Record<string, unknown>

const echo: KnownAction = {
  name: 'echo' as ActionName,
  lastLawful: {
    name: 'echo' as ActionName,
    definition: jsonOf({
      name: 'echo',
      description: 'Echoes the text. Use it to test.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    }) as never,
  },
  definitionDigest: 'sha256:echo' as DefinitionDigest,
  availability: { kind: 'available' },
}

function endpointEntry(name: string) {
  const made = endpointTool(name as EndpointName, [echo], {
    resultContract: describedAdoption({ owner: 'tests', name: 'tool-result', revision: '1' }),
  })
  if (!('ok' in made)) throw new Error(`no tool for ${name}`)
  return {
    capability: { category: 'mcp', name },
    definition: made.ok.definition,
    executor: testingSourceEntry({ name: `mcp__${name}`, category: 'mcp' }).executor,
    availability: { kind: 'available' as const },
  }
}

const DOCS = endpointEntry('docs')

const withEndpoints = (...names: string[]) =>
  mappingConfig(
    entryConfig('alpha', {
      definition: {
        category: 'AgentDefinition',
        type: 'master',
        summary: 'Looks things up.',
        name: 'alpha',
        references: names.map(name => ({ capability: { category: 'mcp', name }, resident: true })),
        attributes: [],
      },
    }),
  )

const disposers: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

type Asked = { access: Access<unknown>; name: string }

async function sourceWith(
  config: Plain,
  answer: ((name: string, asker: Access<unknown>) => NamedEntry) | null,
) {
  const fixture = await releaseFixture()
  const asked: Asked[] = []
  if (answer !== null) {
    const fork = fixture.root.plugin({
      name: 'resident-endpoints-probe',
      apply(ctx: Context) {
        provideResidentEndpoints(ctx, async (asker, name) => {
          asked.push({ access: asker, name })
          return answer(name, asker)
        })
      },
    })
    await fork
    disposers.push(() => fork.dispose())
  }
  const table = await buildTable(agentAdoptionsConfig.parse(config))
  const reported: string[] = []
  let source: AdoptionSourcesImpl | undefined
  await fixture.root.plugin({
    name: 'adoption-source-probe',
    apply(ctx: Context) {
      source = new AdoptionSourcesImpl(ctx, tableMappings(table), reason => {
        reported.push(reason)
      })
    },
  })
  return { fixture, source: got(source, 'adoption source'), reported, asked }
}

async function initialOf(source: AdoptionSourcesImpl) {
  const command = createCommand('alpha')
  const outcome = await source.prepare(command, access)
  if (!('ok' in outcome)) throw new Error(`expected material: ${JSON.stringify(outcome)}`)
  return {
    command,
    guards: outcome.ok,
    initial: factsOf(outcome.ok[0]!)['initialAdoption'] as Plain,
  }
}

describe('a definition that keeps MCP endpoints resident: what the creation adopts', () => {
  it('an endpoint the bridge lists now is one resident tool with its whole definition and no binding key; the session writes it', async () => {
    const { source, reported, asked } = await sourceWith(withEndpoints('docs'), () => ({
      kind: 'entry',
      entry: DOCS,
    }))
    const { initial, command, guards } = await initialOf(source)
    const residents = initial['newResidents'] as ResidentTool[]
    expect(residents.map(item => item.capability)).toEqual(['mcp__docs'])
    expect(residents[0]!.version).toBe(DOCS.definition.adoption.digest)
    expect(residents[0]!.definition).toBeDefined()
    expect(initial['residentBindings']).toEqual([])
    expect(reported).toEqual([])
    expect(asked).toEqual([{ access, name: 'mcp__docs' }])
    const decision = decide(null, command, guards, null, { compaction: null })
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    expect(
      decision.entries.filter(entry => entry.kind === 'session.tool-resident-admitted'),
    ).toHaveLength(1)
  })

  it('an endpoint withheld, not held, or not readable is left out with its reason, and the session is made', async () => {
    const answers: Record<string, NamedEntry> = {
      mcp__off: { kind: 'withheld', reason: 'the address of the endpoint is not set' },
      mcp__never: { kind: 'absent' },
      mcp__lost: { kind: 'unreadable', reason: 'the adopted MCP endpoints could not be read' },
      mcp__docs: { kind: 'entry', entry: DOCS },
    }
    const { source, reported } = await sourceWith(
      withEndpoints('off', 'never', 'lost', 'docs'),
      name => answers[name]!,
    )
    const { initial } = await initialOf(source)
    expect((initial['newResidents'] as ResidentTool[]).map(item => item.capability)).toEqual([
      'mcp__docs',
    ])
    expect(reported).toEqual([
      'resident mcp endpoint off: it is withheld (the address of the endpoint is not set)',
      'resident mcp endpoint never: this tenant does not hold it',
      'resident mcp endpoint lost: it cannot be read now (the adopted MCP endpoints could not be read)',
    ])
  })

  it('without the MCP row, the endpoint cannot be read now: nothing is recorded and the session is made', async () => {
    const { source, reported } = await sourceWith(withEndpoints('docs'), null)
    const { initial } = await initialOf(source)
    expect(initial['newResidents']).toEqual([])
    expect(reported).toEqual(['resident mcp endpoint docs: the MCP endpoints cannot be read now'])
  })

  it('asks the bridge as the asker of the session: another tenant is not asked for', async () => {
    const { source, asked } = await sourceWith(withEndpoints('docs'), (_name, asker) =>
      asker.tenant === access.tenant ? { kind: 'absent' } : { kind: 'entry', entry: DOCS },
    )
    const { initial } = await initialOf(source)
    expect(initial['newResidents']).toEqual([])
    expect(asked.map(item => item.access.tenant)).toEqual([access.tenant])
  })
})

describe('a definition that gains a resident endpoint: what the next adoption point adds', () => {
  it('adds only the endpoint the session does not keep, and never plans the kept one again', async () => {
    const { fixture, asked } = await sourceWith(withEndpoints('docs'), name => ({
      kind: 'entry',
      entry: endpointEntry(name.slice(5)),
    }))
    const kept: ResidentTool = {
      capability: 'mcp__docs',
      version: 'sha256:old',
      shape: { kind: 'null' },
      admitted: { owner: 'o', record: 'mcp/docs', revision: '1', digest: 'sha256:old' },
      definition: { kind: 'null' },
    }
    const planned = await plannedResidents(
      fixture.root,
      [
        { category: 'mcp', name: 'docs' },
        { category: 'mcp', name: 'more' },
      ],
      access,
      () => {},
      null,
      { residents: [kept], residentKeys: [], segments: [] },
    )
    if (!('ok' in planned)) throw new Error(JSON.stringify(planned))
    expect(planned.ok.residents.map(item => item.capability)).toEqual(['mcp__more'])
    expect(planned.ok.keys).toEqual([])
    expect(asked.map(item => item.name)).toEqual(['mcp__more'])
  })
})
