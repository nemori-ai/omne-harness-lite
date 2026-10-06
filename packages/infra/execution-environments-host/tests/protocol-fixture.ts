import { vi } from 'vitest'
import {
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import type {
  SessionAccess,
  SessionAccessOperations,
  AccessIdentity,
} from '@omne-harness-lite/session-tenancy'
import type {
  EnvironmentProvider,
  EnvironmentPlacementSource,
  EnvironmentPermission,
  EnvironmentDescription,
  EnvironmentRequirement,
  ResourceLifecycle,
  ResourceRecoveryAuthority,
  CommandOutcome,
  ProcessHandle,
} from '@omne-harness-lite/execution-environments'
import { createEnvironmentRegistry } from '../src/index.ts'
import { outputFixture } from './output-fixture.ts'
const tenant = parseTenantId({ organization: 'org', account: 'alice' }),
  session = parseOpaqueIdentifier('session', 'SessionRef'),
  execution = parseOpaqueIdentifier('call-1', 'CallId')
if (!('ok' in tenant) || !('ok' in session) || !('ok' in execution))
  throw new Error('fixture invalid')
export const scope = { tenant: tenant.ok, session: session.ok }
export const call = { tool: { name: 'fixture', definition: 'v1' }, execution: execution.ok }
export const requirement: EnvironmentRequirement = {
  bindingLayer: 'host_machine',
  facilities: ['command', 'files'],
}
export const description: EnvironmentDescription = {
  reference: { provider: 'fixture', reference: 'original' },
  bindingLayer: 'host_machine',
  facilities: ['command', 'files'],
  instance: { id: 'original', generation: 'one' },
  binding: { kind: 'host_machine' },
  continuity: { kind: 'notGuaranteed' },
}
export function fixture() {
  const token = Object.freeze({}) as SessionAccess,
    close = new AbortController()
  let allowed = true,
    permission: EnvironmentPermission = 'always-allow',
    revision = 'one'
  const identity: AccessIdentity = {
    binding: 'fixture',
    principal: 'alice',
    principalKind: 'human',
    scope,
    consumer: 'tool',
    contextKeys: [],
  }
  const access: SessionAccessOperations = {
    authorize: vi.fn<SessionAccessOperations['authorize']>(async (candidate, requested) =>
      allowed &&
      candidate === token &&
      requested.session === scope.session &&
      tenantIdEquals(requested.tenant, scope.tenant)
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' },
    ),
  }
  const recovery: ResourceRecoveryAuthority = { authorizeRecovery: async () => 'notAuthorized' }
  const registry = createEnvironmentRegistry({ access, recovery })
  const policy = { maxBufferedBytes: 8, maxChunkBytes: 4, overflow: 'discard' as const },
    output = outputFixture(policy),
    terminal = Promise.withResolvers<CommandOutcome>()
  const stop = vi.fn<ProcessHandle['stop']>(async () => 'unconfirmed')
  const process: ProcessHandle = {
    output: output.output,
    outputPolicy: policy,
    result: terminal.promise,
    stop,
  }
  const start = vi.fn<
    NonNullable<
      import('@omne-harness-lite/execution-environments').EnvironmentFacilities['command']
    >['start']
  >(async () => ({ kind: 'started', process }))
  const read = vi.fn<
    NonNullable<
      import('@omne-harness-lite/execution-environments').EnvironmentFacilities['files']
    >['read']
  >(async () => ({ kind: 'read', data: new Uint8Array([1, 2]) }))
  const write = vi.fn<
    NonNullable<
      import('@omne-harness-lite/execution-environments').EnvironmentFacilities['files']
    >['write']
  >(async () => ({ kind: 'written' }))
  const invalidated = Promise.withResolvers<{ readonly reason: string }>()
  const release = vi.fn(async () => ({ kind: 'released' as const }))
  const provider: EnvironmentProvider = {
    name: 'fixture',
    generation: 'one',
    describe: vi.fn<EnvironmentProvider['describe']>(async () => ({
      kind: 'descriptions',
      values: [description],
    })),
    acquire: vi.fn<EnvironmentProvider['acquire']>(async () => ({
      kind: 'acquired',
      lease: {
        facilities: { description, command: { start }, files: { read, write } },
        invalidated: invalidated.promise,
        release,
      },
      evidence: { provider: 'fixture' },
    })),
    retire: vi.fn<EnvironmentProvider['retire']>(async () => {
      invalidated.resolve({ reason: 'ownerStopped' })
      return { kind: 'drained' }
    }),
    recover: async () => 'unsupported',
  }
  const source: EnvironmentPlacementSource = {
    name: 'policy',
    generation: 'one',
    read: vi.fn<EnvironmentPlacementSource['read']>(
      async (requested, _authorization, original) => ({
        kind: 'placement',
        placement: {
          scope: requested,
          ...original,
          requirement,
          permission,
          revision,
          evidence: { basis: 'controlled-authority' },
        },
      }),
    ),
    authorizeOperation: vi.fn<EnvironmentPlacementSource['authorizeOperation']>(
      async (_scope, _access, adopted, instance) =>
        instance.instance.id === 'original' &&
        !(instance.bindingLayer === 'host_machine' && permission === 'never-allow') &&
        adopted.tool.name === call.tool.name
          ? { kind: 'authorized' }
          : { kind: 'rejected', reason: 'notAuthorized' },
    ),
    select: vi.fn<EnvironmentPlacementSource['select']>(async (_adopted, candidates) =>
      candidates.length === 1 && candidates[0]
        ? { kind: 'selected', reference: candidates[0].reference }
        : { kind: 'rejected', reason: 'ambiguousEnvironment' },
    ),
  }
  const removeSource = registry.placements.registerPlacementSource(source),
    removeProvider = registry.registrations.registerProvider(provider)
  const resources: ResourceLifecycle = {
    closed: close.signal,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
  return {
    registry,
    provider,
    source,
    removeSource,
    removeProvider,
    token,
    access,
    process,
    output,
    terminal,
    start,
    read,
    write,
    stop,
    release,
    invalidated,
    close,
    request: () => ({ scope, call, requirement, authorization: token, resources }),
    revoke: () => {
      allowed = false
    },
    setPermission: (value: EnvironmentPermission) => {
      permission = value
      revision += 'x'
    },
    finish() {
      output.close()
      terminal.resolve({
        kind: 'completed',
        exit: { code: 0 },
        durationMs: 1,
        output: output.summary(),
      })
    },
    async dispose() {
      output.close()
      terminal.resolve({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: 1,
        output: output.summary(),
      })
      await registry.close()
    },
  }
}
