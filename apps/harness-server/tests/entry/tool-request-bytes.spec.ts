import { describe, expect, it } from 'vitest'
import { toolRequestMaterial } from '@omne-harness/agent'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommitRequestV2,
  CommitResultV2,
  JsonValue,
  ReadRequest,
  ReadResult,
  SqlStorage,
} from '@omne-harness/sql-contract'
import { canonicalDigest, canonicalJson, type CallRecord } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ToolDefinition,
  type ToolInvokeRequest,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  deriveDefinition,
  fixToolRequest,
  judgeToolDefinition,
  toolAvailabilityReference,
} from '@omne-harness/tool-contract/provider'
import { testingCallLabel } from '@omne-harness/tool-contract/testing'
import { createSqlToolLedgerStore, DEFINITION_BLOCK_BYTES } from '@omne-harness/tool-storage-sql'
import { loadProductionRelease } from '../../src/entry/tool-release.ts'
import { governanceOf, type ReleaseToolExport } from '../../src/entry/tool-release-manifest.ts'
import { RELEASE_REQUEST_CONTEXT, runToolScope } from '../../src/rows/tool-runtime/scope.ts'
import { TENANT_A } from '../rows/storage/fixtures/tree.ts'
import { TEST_CONSTRUCTION, tree } from '../rows/tool-host/support.ts'

const BOUND_BYTES = 16_384

const bytesOf = (value: unknown): number => Buffer.byteLength(canonicalJson(value), 'utf8')

function ok<T>(outcome: { ok: T } | { failure: unknown }, label: string): T {
  if ('failure' in outcome) throw new Error(`${label}: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

async function releaseTools() {
  const snapshot = await loadProductionRelease()
  if (snapshot.kind !== 'trusted') throw new Error(`release ${snapshot.diagnostic}`)
  return snapshot.manifest.entries.map(entry => {
    const construction = TEST_CONSTRUCTION[entry.asset.name as keyof typeof TEST_CONSTRUCTION]
    const module = snapshot.modules[entry.module.export as ReleaseToolExport]
    const author = module.createAuthor(tree(construction))
    const facts = ok(author, entry.asset.name).facts
    const definition = ok(
      judgeToolDefinition(deriveDefinition(governanceOf(entry), facts)),
      entry.asset.name,
    )
    expect(canonicalDigest(definition)).toBe(entry.definition)
    return { entry, definition }
  })
}

function typicalCall(
  definition: ToolDefinition,
  entry: Awaited<ReturnType<typeof releaseTools>>[number]['entry'],
): ToolInvokeRequest {
  const command = definition.kind === 'commands' ? (definition.commands[0]?.name ?? null) : null
  const text = command === null ? '{}' : JSON.stringify({ command, params: {} })
  const consumer = {
    owner: '@omne-harness/agent',
    work: 'execution-1',
    position: 'step-1/action-1',
    purpose: 'action',
  }
  return {
    availability: toolAvailabilityReference({
      kind: 'available',
      definition,
      executor: entry.module.executor,
      layer: { kind: 'official' },
    }),
    command,
    arguments: { original: text, effective: text, complete: true },
    label: testingCallLabel(definition, command),
    settings: entry.settings,
    context: RELEASE_REQUEST_CONTEXT,
    workspace: null,
    requesterScope: ok(decodeScopeRef({ ref: 'session-scope:bytes' }), 'scope'),
    resources: [],
    scope: runToolScope(TENANT_A, consumer),
    consumer,
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: null, scopeBudget: 4, foregroundMs: 600_000, backgroundAfterMs: null },
  }
}

function recordingStorage(held: 'all' | 'none') {
  const sent: CommitRequestV2[] = []
  const storage: SqlStorage = {
    database: {},
    registerCombination: () => Promise.reject(new Error('not on this path')),
    query: () => Promise.reject(new Error('not on this path')),
    commit: (request: CommitRequestV2): Promise<CommitResultV2> => {
      sent.push(request)
      return Promise.resolve({
        kind: 'committed',
        identity: request.identity,
        inputDigest: 'input',
        combinationVersion: request.combinationVersion,
        manifestDigest: request.manifestDigest,
        recalled: false,
        responses: [
          {
            participant: 'tool',
            protocol: '1',
            reply: { kind: 'participated', response: { kind: 'committed' } },
          },
        ],
      })
    },
    read: (request: ReadRequest): Promise<ReadResult> => {
      const input = request.input as Readonly<Record<string, JsonValue>>
      const digests = Array.isArray(input['digests']) ? input['digests'] : []
      return Promise.resolve({
        kind: 'read',
        requestKey: request.requestKey,
        output: { held: held === 'all' ? digests : [] },
      })
    },
  }
  const tenant = tenantCodec.encode(TENANT_A)
  if (!tenant.ok) throw new Error('fixture tenant')
  const domain = {
    scope: { kind: 'tenant' as const, tenant: tenant.value },
    transactionDomain: 'd',
  }
  const store = createSqlToolLedgerStore({
    storage,
    domains: { lookup: async () => ({ kind: 'ready', domain }) },
    tenants: async () => ({ kind: 'ready', revision: '1', entries: [] }),
    combination: { combinationVersion: 'bytes', manifestDigest: 'a'.repeat(64) },
  })
  return { sent, store }
}

function admittedRow(request: ToolInvokeRequest, definition: ToolDefinition): CallRecord {
  const call = ok(decodeToolCallId('call-bytes'), 'call')
  const revision = ok(decodeToolRevision('1'), 'revision')
  const source = { owner: '@omne-harness/tool', record: 'state', revision: '1', digest: 'sha256:s' }
  const state: ToolState = {
    call,
    label: request.label,
    revision,
    foreground: null,
    effect: { kind: 'not-started' },
    execution: { kind: 'not-started' },
    timing: { kind: 'paused', accumulatedMs: '0' },
    queue: { kind: 'none' },
    controls: [],
    delivery: null,
    supplements: [],
    phase: 'accepted',
    wait: { kind: 'none' },
    relation: 'foreground',
    source,
  }
  const invocation = {
    kind: 'direct' as const,
    source: {
      owner: '@omne-harness/tool-host-local',
      record: `invocation-source:${call}`,
      revision: '1',
      digest: `sha256:${'0'.repeat(64)}`,
    },
  }
  return {
    tenant: TENANT_A,
    call,
    admission: ok(decodeToolOperationId('admit-bytes'), 'admission'),
    request: fixToolRequest(request, definition, invocation),
    initiator: { owner: invocation.source.owner, subject: invocation.source.record, revision: '1' },
    state,
    preparations: [],
    environment: null,
    start: null,
    startRejection: null,
    execution: null,
  }
}

async function admissionCommands(row: CallRecord, held: 'all' | 'none') {
  const { sent, store } = recordingStorage(held)
  const committed = await store.commit({
    domain: { kind: 'call', tenant: TENANT_A, call: row.call },
    expected: ok(decodeToolRevision('0'), 'expected'),
    revision: ok(decodeToolRevision('1'), 'revision'),
    writes: [{ kind: 'put', record: { kind: 'call', call: row } }],
  })
  expect(committed).toEqual({ kind: 'committed' })
  return sent.flatMap(commit => commit.commands)
}

describe('every release tool', () => {
  it('fixes a typical call in at most 16 KB for the Agent and for the Tool call row', async () => {
    const tools = await releaseTools()
    expect(tools.length).toBeGreaterThan(0)
    for (const { entry, definition } of tools) {
      const request = typicalCall(definition, entry)
      expect(bytesOf(toolRequestMaterial(request)), entry.asset.name).toBeLessThanOrEqual(
        BOUND_BYTES,
      )
      const [row, ...others] = await admissionCommands(admittedRow(request, definition), 'all')
      expect(others, entry.asset.name).toEqual([])
      expect(bytesOf(row), entry.asset.name).toBeLessThanOrEqual(BOUND_BYTES)
    }
  })

  it('writes the resident Schedules definition the first time in commands within the block size', async () => {
    const tools = await releaseTools()
    const schedules = tools.find(tool => tool.entry.asset.name === 'Schedules')
    if (schedules === undefined) throw new Error('the release has no Schedules entry')
    const request = typicalCall(schedules.definition, schedules.entry)
    const commands = await admissionCommands(admittedRow(request, schedules.definition), 'none')
    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands)
      expect(bytesOf(command)).toBeLessThanOrEqual(DEFINITION_BLOCK_BYTES)
  })
})
