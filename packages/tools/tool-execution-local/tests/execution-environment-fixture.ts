import { commandFixture, fileFixture } from './facility-fixture.ts'
import { vi } from 'vitest'
import { environmentToolOf } from '@omne-harness-lite/tool-execution-runtime'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import type {
  EnvironmentAcquisition,
  EnvironmentLease,
  ExecutionEnvironmentOperations,
  ResourceLifecycle,
  CommandOutcome,
} from '@omne-harness-lite/execution-environments'
import { scope, ref, definition, deferred } from './execution-owner-fixture.ts'

export const environmentDefinition: ToolDefinition = {
  ...definition,
  settings: {
    targetEnvironment: {
      category: 'placement_identity',
      default: { bindingLayer: 'host_machine', facilities: ['command'] },
    },
  },
}
export function environmentPorts() {
  const selected = {
    capability: 'tool:echo',
    asset: 'echo-asset',
    version: '1',
    definition: environmentDefinition,
    adoption: 'adopted',
  }
  const placement = {
    scope,
    execution: ref.callId,
    tool: environmentToolOf(selected),
    requirement: { bindingLayer: 'host_machine' as const, facilities: ['command'] },
    permission: 'always-allow' as const,
    revision: 'actual-input/factory',
    evidence: { input: 'actual-input' },
  }
  const description = {
    reference: { provider: 'controlled', reference: 'original' },
    bindingLayer: 'host_machine' as const,
    binding: { kind: 'host_machine' as const },
    facilities: ['command', 'files'],
    instance: { id: 'original', generation: 'one' },
    continuity: { kind: 'notGuaranteed' as const },
  }
  const invalidated = deferred<{ reason: string }>(),
    result = deferred<CommandOutcome>()
  let resources: ResourceLifecycle | undefined
  const resource = { key: 'process', provider: 'controlled', reference: { invocation: 'original' } }
  const stop = vi.fn(async () => 'confirmed' as const)
  const command = {
    start: vi.fn(async () => {
      if (!resources) throw new Error('original resource lifecycle missing')
      if (
        (await resources.plan(resource)) !== 'recorded' ||
        (await resources.permit(resource.key)) !== 'confirmed'
      )
        return { kind: 'rejected', reason: 'closed' } as const
      return {
        kind: 'started',
        process: {
          output: {
            async *[Symbol.asyncIterator]() {
              yield { stream: 'stdout' as const, data: new TextEncoder().encode('first-output') }
              await result.promise
            },
          },
          outputMode: 'separate' as const,
          outputPolicy: { maxBufferedBytes: 128, maxChunkBytes: 64, overflow: 'discard' as const },
          result: result.promise,
          stop,
        },
      } as const
    }),
  }
  const release = vi.fn<EnvironmentLease['release']>(async () => {
    if (resources && command.start.mock.calls.length)
      await resources.stopped(resource.key, 'confirmed')
    return { kind: 'released' } as const
  })
  const acquired: Extract<EnvironmentAcquisition, { kind: 'acquired' }> = {
    kind: 'acquired',
    evidence: { nonce: 'original' },
    adoption: {
      placement,
      description,
      source: { name: 'current', generation: 'original' },
      providerEvidence: { nonce: 'original' },
    },
    lease: {
      facilities: {
        description,
        command: commandFixture(command),
        files: fileFixture({
          read: async () => ({ kind: 'rejected', reason: 'unavailable' }),
          write: async () => ({ kind: 'rejected', reason: 'unavailable' }),
        }),
      },
      invalidated: invalidated.promise,
      release,
    },
  }
  const resolvePlacement = vi.fn<ExecutionEnvironmentOperations['resolvePlacement']>(async () => ({
    kind: 'placement',
    placement,
  }))
  const acquire = vi.fn<ExecutionEnvironmentOperations['acquire']>(async request => {
    resources = request.resources
    return acquired
  })
  return {
    operations: { resolvePlacement, acquire },
    placement,
    acquired,
    acquire,
    resolvePlacement,
    release,
    command,
    stop,
    invalidated,
    result,
    resources: () => resources,
  }
}
export const completed: CommandOutcome = {
  kind: 'completed',
  exit: { code: 0 },
  durationMs: 1,
  output: {
    mode: 'separate',
    stdout: { observedBytes: 12, discardedBytes: 0 },
    stderr: { observedBytes: 0, discardedBytes: 0 },
  },
}
