import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readReport, REGISTERED_CATEGORIES } from '@omne-harness-lite/asset-registry'
import {
  copyJsonValue,
  judgeContentBlock,
  type ToolCallBlock,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import {
  encodeRunnerAdmissionToken,
  inspectRunnerConclusion,
  type RunnerActionSource,
  type RunnerDispatchScope,
  type RunnerPiece,
  type OfficialAdmissionContribution,
} from '@omne-harness-lite/loop-extension-runner'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import {
  OFFICIAL_ADMISSION_NAME,
  type AdmissionResult,
  type AuthorizationContext,
} from '@omne-harness-lite/tool-admission'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { vi } from 'vitest'
import { captureActionRequest } from '../src/action-request.ts'
import { createRunnerTaskOwner } from '../src/task-owner.ts'
import { createRunnerImplementationRegistry } from '../src/implementation-registry.ts'
import { createAdmissionPassSource } from '../src/admission-pass-source.ts'
import { runActionBatch } from '../src/action-batch.ts'

export const tenant = unwrap(parseTenantId({ organization: 'personal-member', account: 'member' }))
export const session = unwrap(parseOpaqueIdentifier('action-session', 'SessionRef'))
export const at = '2026-10-04T00:00:00Z'
export function toolCall(id: string, tool = 'echo', unparseable = false): ToolCallBlock {
  const result = judgeContentBlock({
    kind: 'tool_call',
    id: `block-${id}`,
    callId: id,
    complete: true,
    visibility: { toHuman: true, toModel: true },
    tool,
    ...(unparseable ? { unparseable: true, rawArguments: '{invalid' } : { arguments: { id } }),
  })
  if (!('ok' in result) || result.ok.kind !== 'tool_call' || result.ok.complete !== true)
    throw new Error('Invalid tool call fixture')
  return result.ok
}
export function actionInputs(
  calls: readonly ToolCallBlock[] = [toolCall('a'), toolCall('b')],
  permissions?: unknown,
  identity: SessionScope = { tenant, session },
) {
  const { tenant, session } = identity
  const report = readReport(
    {
      session,
      runId: 'run',
      attempt: 1,
      computedAt: 1,
      snapshots: REGISTERED_CATEGORIES.map(category => ({ category, filledAt: 1 })),
      availability: [],
      mcpActions: [],
      endpointHoldings: [],
      skillGate: [],
      effectivePermissions: permissions ?? {
        echo: {
          capability: { category: 'tool', name: 'example:echo' },
          item: 'execute',
          value: { allowed: ['auto'] },
          from: 'tenant',
          tenantAutoWritable: true,
        },
      },
    },
    session,
  )
  if (!report) throw new Error('Invalid report fixture')
  const actions = calls
    .filter(call => call.complete && call.unparseable !== true)
    .map(call => ({ call, definition: { name: call.tool }, batch: calls.map(item => item.callId) }))
  const captured = captureActionRequest({
    position: 'before_action',
    manifest: session,
    run: report.runId,
    attempt: report.attempt,
    assistantMessage: 'reply',
    actions,
    anchors: actions.map(item => `anchor-${item.call.callId}`),
    admission: { report, grants: {} as AuthorizationContext, runMode: 'auto_permission' },
  })
  if ('failure' in captured) throw new Error('Invalid action request fixture')
  const source: RunnerActionSource = {
    access: {} as SessionAccess,
    scope: { tenant, session },
    run: report.runId,
    attempt: report.attempt,
    assistantMessage: 'reply',
    report,
    grants: captured.request.admission.grants,
    runMode: captured.request.admission.runMode,
    calls: calls as [ToolCallBlock, ...ToolCallBlock[]],
    anchors: captured.request.anchors,
    toolNames: Object.keys(report.effectivePermissions),
  }
  return { request: captured.request, source }
}
export function piece(
  name = OFFICIAL_ADMISSION_NAME,
  power: 'observe' | 'rewrite' | 'veto' = 'veto',
): RunnerPiece {
  const definition = judgeDefinition({
    name,
    position: 'before_action',
    power,
    implementation: { kind: 'builtin', builtinName: name },
  })
  if ('rejected' in definition) throw new Error(`Invalid definition: ${definition.rejected}`)
  return {
    definition: definition.ok,
    power,
    ...(name === OFFICIAL_ADMISSION_NAME ? { fallback: 'admission' as const } : {}),
  }
}

/** Uses real runner, contribution custody and SQL journal. Run/model origin and judgment are controlled ports. */
export async function batchHost(
  calls?: readonly ToolCallBlock[],
  permissions?: unknown,
  identity?: SessionScope,
) {
  const { request, source } = actionInputs(calls, permissions, identity)
  const { tenant, session } = source.scope
  const dir = await mkdtemp(join(tmpdir(), 'omne-action-batch-'))
  const options = {
    dir,
    processOwnership: { current: 'action-test', observeExit: async () => 'exited' as const },
  }
  let log = await openSqlLogFixture({ dir: options.dir })
  // Mutable test probes delegate to the actual frozen SQL journal API, including after reopen.
  const operations: Pick<typeof log, 'append' | 'readByKey' | 'readSince'> = {
    append: (...args) => log.append(...args),
    readByKey: (...args) => log.readByKey(...args),
    readSince: (...args) => log.readSince(...args),
  }
  const binding = { session, tenant, logGeneration: 'generation' }
  const owner = { ...createRunnerTaskOwner(binding) }
  const registry = createRunnerImplementationRegistry()
  let active = true
  const authorizedIdentity: AccessIdentity = {
    binding: 'binding',
    principal: 'member',
    principalKind: 'human',
    consumer: 'coordinator',
    contextKeys: [],
    scope: source.scope,
  }
  const access: SessionAccessOperations = {
    authorize: async candidate =>
      candidate === source.access
        ? { kind: 'authorized', identity: authorizedIdentity }
        : { kind: 'rejected', reason: 'notAuthorized' },
  }
  const passes = createAdmissionPassSource({
    isActive: () => active,
    access,
  })
  const scope: RunnerDispatchScope = {
    binding,
    owner,
    action: source,
    isActive: () => active,
    release() {},
    sources: {
      isActive: () => active,
      sessionTenancy: {} as RunnerDispatchScope['sources']['sessionTenancy'],
      history: {} as RunnerDispatchScope['sources']['history'],
      manifest: {
        dependencyPresence: async () => ({ presence: {} }),
        readHead: async () => {
          throw new Error('No manifest source in this fixture')
        },
      },
    },
    subjectForCandidate(entry) {
      const payload = copyJsonValue(entry.payload)
      if ('failed' in payload) return { unavailable: true }
      const value = inspectRunnerConclusion({
        session,
        tenant,
        entry: { ...entry, payload: payload.ok, session, position: 1 },
      })
      if ('invalid' in value || 'unrelated' in value) return { unavailable: true }
      const action = request.actions.find(action => action.call.callId === value.conclusion.callId)
      return action ? { position: 'before_action', subject: action } : { unavailable: true }
    },
    readMessagePrefix: async () => [],
    ports: {
      readAskState: async association => ({ kind: 'pending', association }),
      openHandles: async () => ({
        log: unwrap(parseOpaqueIdentifier('log', 'LogHandle')),
        environment: unwrap(parseOpaqueIdentifier('env', 'EnvironmentHandle')),
        release() {},
      }),
      verifyFailure: async () => ({ kind: 'unavailable' }),
      judgeCapabilities: async () => ({ kind: 'accepted' }),
      now: async () => at,
      mintReminder: () => 'reminder',
      fallbackNeedsProjection: async () => false,
      invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
      commandPresence: async () => 'absent',
    },
  }
  const captured: Parameters<OfficialAdmissionContribution>[3][] = []
  const admission = vi.fn<OfficialAdmissionContribution>(async (access, scope, pass, batch) => {
    captured.push(batch)
    const found = await passes.source.read(access, scope, pass)
    if (found.kind !== 'found') return { kind: 'failed', reason: 'unavailable' }
    const results = batch.map((item, index): AdmissionResult => {
      const token = encodeRunnerAdmissionToken(item.call, found.record.finalKeys[index])
      if (typeof token !== 'string') throw new Error('Invalid test locator')
      return { kind: 'allow', token }
    }) as [AdmissionResult, ...AdmissionResult[]]
    return { kind: 'decisions', results }
  })
  return {
    get log() {
      return operations
    },
    access,
    request,
    source,
    scope,
    owner,
    registry,
    passes,
    admission,
    captured,
    register: () => registry.registerAdmission(admission),
    async run(all: readonly RunnerPiece[] = [piece()], signal = new AbortController().signal) {
      return runActionBatch({
        request,
        source,
        log: operations,
        scope,
        all,
        registry,
        passes,
        active: () => active,
        signal,
        trackInvocation: work => work,
      })
    },
    async entries() {
      return log.readSince(session, 0)
    },
    async reopen() {
      await owner.drain()
      await log.close()
      log = await openSqlLogFixture({ dir: options.dir })
    },
    async close() {
      active = false
      passes.closeAdmission()
      registry.closeAdmission()
      await registry.drain()
      await passes.drain()
      await owner.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
