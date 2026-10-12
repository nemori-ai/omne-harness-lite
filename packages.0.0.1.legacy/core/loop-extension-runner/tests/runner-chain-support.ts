import { readFileSync } from 'node:fs'
import {
  checkManifestAppendInput,
  type AssemblyManifestService,
  type ManifestRecord,
} from '@omne-harness-lite/assembly-manifest'
import { type RegistryHistoryResult } from '@omne-harness-lite/asset-evaluation'
import { copyJsonValue, readJsonStrict } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { type HoldingTenantResult } from '@omne-harness-lite/session-tenancy'
import { type ReadRunnerChainInput } from '../src/index.ts'

export const session = 'runner_chain_session'
export const tenant = unwrap(parseTenantId({ organization: 'organization', account: 'account' }))
export type Head = Awaited<ReturnType<AssemblyManifestService['readHead']>>
export function manifestRecord(): ManifestRecord {
  // Captured from the actual registry fill and manifest reader; validate the exchange data independently.
  const parsed = readJsonStrict(
    readFileSync(new URL('./fixtures/runner-chain-record.json', import.meta.url), 'utf8'),
  )
  if (
    'failed' in parsed ||
    parsed.ok === null ||
    typeof parsed.ok !== 'object' ||
    Array.isArray(parsed.ok)
  )
    throw new Error('invalid manifest fixture')
  if (!('evaluation' in parsed.ok) || !('tables' in parsed.ok) || !('content' in parsed.ok))
    throw new Error('incomplete manifest fixture')
  const checked = checkManifestAppendInput(session, 0, {
    evaluation: parsed.ok.evaluation,
    tables: parsed.ok.tables,
    content: parsed.ok.content,
  })
  if ('failure' in checked) throw new Error('invalid actual manifest exchange')
  return {
    ...checked.ok.record,
    session: unwrap(parseOpaqueIdentifier(session, 'SessionRef')),
    seq: 1,
    evaluationRef: unwrap(parseOpaqueIdentifier('evaluation_one', 'EvaluationRef')),
  }
}
export function versionFor(request: unknown): RegistryHistoryResult {
  const copy = copyJsonValue(request)
  if (
    'failed' in copy ||
    copy.ok === null ||
    typeof copy.ok !== 'object' ||
    Array.isArray(copy.ok) ||
    !('capability' in copy.ok)
  )
    throw new Error('invalid history request')
  const capability = copy.ok.capability
  if (
    capability === null ||
    typeof capability !== 'object' ||
    Array.isArray(capability) ||
    !('name' in capability) ||
    typeof capability.name !== 'string'
  )
    throw new Error('missing capability')
  return {
    version: {
      number: 1,
      publishedAt: '2026-09-29T00:00:00Z',
      content: {
        category: 'loop_extension',
        extension: {
          name: capability.name,
          position: 'before_model_call',
          power: 'observe',
          implementation: { kind: 'builtin', builtinName: capability.name },
        },
      },
    },
  }
}
export interface ChainScenario {
  readonly holding?: HoldingTenantResult
  readonly head?: Head
  readonly active?: () => boolean
  readonly history?: (request: unknown) => Promise<RegistryHistoryResult>
}
export function chainScenario(options: ChainScenario = {}) {
  const trace: unknown[] = []
  const input: ReadRunnerChainInput = {
    session,
    binding: { session, tenant, logGeneration: 'physical_log' },
    sources: {
      sessionTenancy: {
        async holdingTenant(value) {
          trace.push(['holding', value])
          return options.holding ?? { tenant }
        },
      },
      manifest: {
        async readHead(value) {
          trace.push(['head', value])
          return options.head ?? { head: 1, latest: { loop_extension: manifestRecord() } }
        },
        async dependencyPresence() {
          throw new Error('chain replay must not read presence')
        },
      },
      history: {
        async read(request) {
          trace.push(['version', request])
          return options.history ? options.history(request) : versionFor(request)
        },
      },
      isActive() {
        trace.push(['active'])
        return options.active ? options.active() : true
      },
    },
  }
  return { input, trace }
}
