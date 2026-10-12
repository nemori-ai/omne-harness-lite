// covers: PF-006 S118
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations } from '@omne-harness-lite/storage'
import {
  createAssemblyManifestStore,
  assemblyManifestMigrations,
} from '@omne-harness-lite/assembly-manifest-store'
import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'
import { createAssetRegistry } from '@omne-harness-lite/asset-registry-local'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  createToolImplementationRegistry,
  createToolInvoker,
} from '@omne-harness-lite/tool-execution-local'
import {
  createParameterJudge,
  isToolDefinition,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import { copyJsonValue, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'

const at = '2026-10-10T00:00:00Z'
const tenant = unwrap(
  parseTenantId({ organization: 'selected-tool-org', account: 'selected-tool-account' }),
)
const root = { category: 'agent_definition' as const, name: 'selected-tool-root' }
const capability = { category: 'tool' as const, name: 'echo' }
function definition(label: string) {
  return {
    name: 'echo',
    description: label,
    paradigm: 'single',
    origin: { kind: 'authored' },
    input: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to return.' } },
      required: ['text'],
    },
    permissions: { execute: { default: 'auto' } },
  } satisfies ToolDefinition
}
function jsonDefinition(label: string) {
  const copied = copyJsonValue(definition(label))
  if ('failed' in copied) throw new Error('tool definition is not JSON')
  return copied.ok
}
function evaluationInput(): NonConnectorEvaluationInput {
  return {
    tenant,
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references: [{ capability }],
      attributes: [],
      source: { asset: 'root', version: 1 },
    },
    holdings: [
      {
        holder: { layer: 'factory' },
        capability: root,
        asset: 'root',
        basis: { kind: 'official' },
        versionSelection: { kind: 'current' },
        immutable: false,
        assignments: [],
        since: at,
      },
      {
        holder: { layer: 'factory' },
        capability,
        asset: 'factory-echo',
        basis: { kind: 'official' },
        versionSelection: { kind: 'current' },
        immutable: false,
        assignments: [],
        since: at,
      },
      {
        holder: { layer: 'tenant', tenant },
        capability,
        asset: 'tenant-echo',
        basis: { kind: 'owned' },
        versionSelection: { kind: 'current' },
        immutable: false,
        assignments: [],
        since: at,
      },
    ],
    definitions: [
      {
        id: 'root',
        capability: root,
        origin: 'official',
        versions: [
          {
            number: 1,
            content: {
              category: 'agent_definition',
              body: toOpaqueJson({ references: [], attributes: [] }),
            },
            publishedAt: at,
          },
        ],
      },
      {
        id: 'factory-echo',
        capability,
        origin: 'official',
        versions: [
          {
            number: 1,
            content: { category: 'tool', definition: jsonDefinition('Factory echo') },
            publishedAt: at,
          },
        ],
      },
      {
        id: 'tenant-echo',
        capability,
        origin: 'customized',
        owner: { kind: 'tenant', tenant },
        author: tenant,
        byAgent: false,
        versions: [
          {
            number: 1,
            content: { category: 'tool', definition: jsonDefinition('Tenant echo') },
            publishedAt: at,
            publishedBy: tenant,
          },
        ],
      },
    ],
  }
}
const dependencies: InvocationDependencies = {
  context: { read: async () => ({ kind: 'values', values: [] }) },
  signal: new AbortController().signal,
  wait: async () => ({ kind: 'rejected', reason: 'notAllowed' }),
  frames: { emit: () => ({ kind: 'accepted' }) },
  costs: { report: async () => 'recorded' },
}

test('S118: lawful tenant override selects and invokes only its registered implementation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omne-selected-tool-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    upgrade: false,
    file: join(directory, 'state.sqlite'),
    migrations: composeMigrations(assemblyManifestMigrations),
  })
  const manifest = createAssemblyManifestStore(storage)
  const input = evaluationInput()
  const registry = createAssetRegistry({
    manifest,
    currentInputs: { read: async () => ({ input }) },
    fixedRootInput: { read: async () => ({ input }) },
    historicalBody: {
      read: async request => {
        const asset = input.definitions.find(value => value.id === request.asset)
        const version = asset?.versions.find(value => value.number === request.version)
        return version === undefined ? { failure: 'unavailable', stage: 'source' } : { version }
      },
    },
    sessionTenancy: { holdingTenant: async () => ({ tenant }) },
    deployedMeta: [],
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
    diagnostic() {},
    diagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
    conflictPolicy: { maxRetries: 0 },
    maxInFlight: 4,
  })
  const implementations = createToolImplementationRegistry()
  const calls = { factory: 0, tenant: 0 }
  const remove = [
    implementations.register({
      capability: capabilityCanonicalString(capability),
      asset: 'factory-echo',
      version: '1',
      definition: definition('Factory echo'),
      executor: async () => {
        calls.factory++
        return 'wrong implementation'
      },
    }),
    implementations.register({
      capability: capabilityCanonicalString(capability),
      asset: 'tenant-echo',
      version: '1',
      definition: definition('Tenant echo'),
      executor: async args => {
        calls.tenant++
        assert.deepEqual(args, { text: 'original request' })
        return 'tenant implementation: original request'
      },
    }),
  ]
  try {
    const evaluated = evaluate(input)
    assert.ok('ok' in evaluated, JSON.stringify(evaluated))
    assert.deepEqual(
      evaluated.ok.assets.find(asset => asset.capability.name === 'echo'),
      {
        capability,
        asset: 'tenant-echo',
        version: 1,
        from: 'tenant',
        replaced: ['factory'],
        resident: false,
      },
    )
    const filled = await registry.fill(
      'selected-tool-session',
      evaluated.ok,
      'selected-tool-given',
      evaluated.ok.composition,
    )
    assert.ok('snapshots' in filled, JSON.stringify(filled))
    const listed = await registry.list('selected-tool-session', 'tool', { kind: 'session' })
    assert.ok('entries' in listed, JSON.stringify(listed))
    assert.equal(listed.entries.length, 1)
    const selected = listed.entries[0]!
    assert.equal(selected.asset, 'tenant-echo')
    assert.equal(selected.content.category, 'tool')
    assert.ok('definition' in selected.content && isToolDefinition(selected.content.definition))
    const acquired = implementations.acquire({
      capability: capabilityCanonicalString(selected.capability),
      asset: selected.asset,
      version: '1',
      definition: selected.content.definition,
      adoption: 'selected-tool-given',
    })
    assert.ok('implementation' in acquired, JSON.stringify(acquired))
    try {
      const invoke = createToolInvoker({
        parameters: createParameterJudge(),
        judgeResult: value =>
          typeof value === 'string' ? { kind: 'valid', result: value } : { kind: 'invalid' },
      })
      const result = await invoke(
        {
          definition: acquired.implementation.definition,
          executor: acquired.implementation.executor,
          args: { text: 'original request' },
        },
        dependencies,
      )
      assert.deepEqual(result, {
        kind: 'returned',
        result: 'tenant implementation: original request',
      })
      assert.deepEqual(calls, { factory: 0, tenant: 1 })
      const record = await manifest.readHead('selected-tool-session')
      assert.ok('head' in record && record.head > 0)
    } finally {
      acquired.release()
    }
  } finally {
    for (const withdraw of remove) withdraw()
    await registry.close()
    await manifest.close()
    await storage.close()
    await rm(directory, { recursive: true, force: true })
  }
})
