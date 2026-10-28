import { readFileSync } from 'node:fs'
import { Service } from '@deepseek-ai/cordis'
import { resolveOptional } from '@omne-harness/kernel-basis/cordis'
import { startTestAssembly } from '@omne-harness/kernel-basis/testing'
import { describe, expect, it } from 'vitest'
import { decodeStreamId } from '@omne-harness/stream-arrival'
import * as cordis from '@omne-harness/tool-cordis-contract/cordis'
import {
  ToolClockService,
  ToolInstancesService,
  toolClockKey,
  toolInstancesKey,
  type ToolPublicationAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolInstanceId, type ToolClock } from '@omne-harness/tool-contract/provider'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { describeImport, memberPath, walkModules, type ModuleKind } from './module-graph.ts'

/** The key table of docs/cordis.md, plus the facade key `toolRuntime`: key constant to its class. */
const documentedPairs = {
  toolRuntimeKey: 'ToolRuntimeService',
  toolCommandsKey: 'ToolCommandsService',
  toolBindingsKey: 'ToolBindingsService',
  toolContributionAuthorityKey: 'ToolContributionAuthorityService',
  toolGenerationsKey: 'ToolGenerationsService',
  toolResidencyReaderKey: 'ToolResidencyReaderService',
  toolEnvironmentsKey: 'ToolEnvironmentService',
  toolDecisionsKey: 'ToolDecisionBridgeService',
  toolInstancesKey: 'ToolInstancesService',
  toolPublicationAuthorityKey: 'ToolPublicationAuthorityService',
  toolInstanceHostKey: 'ToolInstanceHostService',
  toolClockKey: 'ToolClockService',
  toolResultPolicyKey: 'ResultPolicyService',
  toolReadsKey: 'ToolReadsService',
  toolCatalogKey: 'ToolCatalogService',
  toolStartAuthorityKey: 'ToolStartAuthorityService',
  toolStartFenceKey: 'ToolStartFenceService',
  toolResourceResponsesKey: 'ToolResourceResponsesService',
  toolOutputCustodyKey: 'ToolOutputCustodyService',
  toolChildrenKey: 'ToolChildrenService',
  toolAccountsKey: 'ToolAccountsService',
  toolOffloaderKey: 'ToolOffloaderService',
} as const

/** The Tool implementation packages. The definition package must not depend on either. */
const implementation = /^@omne-harness\/tool(-host-local)?(\/|$)/u

const exported = Object.entries(cordis as Record<string, unknown>)
const keyConstants = exported.filter(([name]) => name.endsWith('Key'))
const serviceClasses = exported.filter(
  (entry): entry is [string, typeof Service & { provide: string }] =>
    typeof entry[1] === 'function' && entry[1].prototype instanceof Service,
)

describe('service keys', () => {
  it('exports 22 unique keys, one per documented pair', () => {
    const keys = keyConstants.map(([, value]) => value)
    expect(keys).toHaveLength(22)
    expect(new Set(keys).size).toBe(22)
    expect(keyConstants.map(([name]) => name).sort()).toEqual(Object.keys(documentedPairs).sort())
  })

  it.each(Object.entries(documentedPairs))(
    'takes %s from the static provide of %s',
    (key, type) => {
      const exports = cordis as Record<string, unknown>
      const definition = exports[type] as { provide: string } | undefined
      expect(serviceClasses.map(([name]) => name)).toContain(type)
      expect(exports[key]).toBe(definition?.provide)
    },
  )

  it('has one service class per key, no more', () => {
    expect(serviceClasses).toHaveLength(22)
    expect(new Set(serviceClasses.map(([, type]) => type.provide)).size).toBe(22)
  })

  it('names the two G7 keys of RFC-0012 as the docs/cordis.md table does', () => {
    expect(cordis.toolContributionAuthorityKey).toBe('toolContributionAuthority')
    expect(cordis.toolGenerationsKey).toBe('toolGenerations')
  })

  it('names each service class after its port, with the Service suffix', () => {
    for (const [name] of serviceClasses) expect(name).toMatch(/^[A-Z][A-Za-z]+Service$/u)
  })
})

describe('cordis definition entry has no Tool implementation', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/cordis.ts'],
    ['javascript', 'dist/cordis.js'],
    ['declaration', 'dist/cordis.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    const provider = graph.imports.filter(edge => implementation.test(edge.specifier))
    expect(provider.map(describeImport)).toEqual([])
    expect(graph.imports.map(edge => edge.specifier)).toContain('@deepseek-ai/cordis')
  })

  it('depends on Cordis and the contract package, not on a Tool implementation', () => {
    const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/cordis': 'catalog:',
      '@omne-harness/tool-contract': 'workspace:*',
    })
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(declared.filter(name => implementation.test(name))).toEqual([])
  })
})

describe('under Cordis 4.0.4', () => {
  const allow: ToolPublicationAuthority<string> = { check: () => ({ ok: undefined }) }

  it('resolves a provider through the abstract definition key', async () => {
    class FixedClock extends ToolClockService {
      readonly now: ToolClock['now'] = () => '0'
      readonly begin: ToolClock['begin'] = async () => ({ failure: unsupported })
      readonly elapsed: ToolClock['elapsed'] = async () => ({ failure: unsupported })
      readonly waitUntil: ToolClock['waitUntil'] = async () => 'cancelled'
    }
    const assembly = await startTestAssembly([
      { name: 'clock', apply: ctx => void new FixedClock(ctx) },
    ])
    try {
      const clock = resolveOptional<ToolClockService>(assembly.context, toolClockKey)
      expect(clock).toBeInstanceOf(FixedClock)
      expect(clock?.now()).toBe('0')
    } finally {
      await assembly.dispose()
    }
  })

  it('directory replies named failures until the instance directory increment and never throws', async () => {
    const assembly = await startTestAssembly([
      { name: 'directory', apply: ctx => void new ToolInstancesService(ctx, allow) },
    ])
    try {
      const directory = resolveOptional<ToolInstancesService<string>>(
        assembly.context,
        toolInstancesKey,
      )
      expect(directory).toBeInstanceOf(ToolInstancesService)
      const connected = await directory?.connect({ principal: 'p', tenant: owner, call })
      expect(connected).toMatchObject({
        failure: {
          kind: 'unsupported',
          adoption: { owner: '@omne-harness/tool-cordis-contract', name: 'toolInstances' },
        },
      })
      const registered = await directory?.register({
        publication: [
          { tenant: owner, call, instance, generation: '1' },
          {
            instance,
            generation: '1',
            stream: decoded(decodeStreamId('str_entry')),
            observation: { observe: async function* () {} },
          },
        ],
        authority: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
      })
      expect(registered).toMatchObject({ failure: { kind: 'unavailable' } })
    } finally {
      await assembly.dispose()
    }
  })
})

function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('failure' in outcome) throw new Error('fixture identity text does not decode')
  return outcome.ok
}

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}

const owner = tenant(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)
const call = decoded(decodeToolCallId('call_1'))
const instance = decoded(decodeToolInstanceId('instance_1'))

const unsupported = {
  kind: 'unsupported',
  adoption: { owner: 'test', name: 'clock', revision: '1', digest: 'd' },
  reason: 'not used',
} as const
