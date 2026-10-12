import { vi } from 'vitest'
import type {
  CommandFacility,
  EnvironmentDescription,
  ProcessHandle,
  CommandOutcome,
} from '@omne-harness-lite/execution-environments'
import type { InvocationDependencies, ToolFrame } from '@omne-harness-lite/tool-execution-runtime'

export function fixture(
  parts: readonly Uint8Array[] = [new TextEncoder().encode('from-selected-provider')],
  outcome?: CommandOutcome,
) {
  const frames: ToolFrame[] = []
  const controller = new AbortController()
  const process: ProcessHandle = {
    outputMode: 'terminal',
    outputPolicy: { maxBufferedBytes: 4096, maxChunkBytes: 64, overflow: 'discard' },
    output: {
      async *[Symbol.asyncIterator]() {
        for (const data of parts) yield { stream: 'terminal' as const, data }
      },
    },
    result: Promise.resolve(
      outcome ?? {
        kind: 'completed',
        exit: { code: 0 },
        durationMs: 7,
        output: {
          mode: 'terminal',
          terminal: {
            observedBytes: parts.reduce((total, value) => total + value.byteLength, 0),
            discardedBytes: 0,
          },
        },
      },
    ),
    stop: vi.fn(async () => 'confirmed' as const),
  }
  const terminal = { id: 'opaque-terminal', generation: 'original-generation' }
  const command: CommandFacility = {
    start: vi.fn(async () => ({ kind: 'started' as const, process })),
    createTerminal: vi.fn(async () => ({ kind: 'created' as const, terminal })),
    executeTerminal: vi.fn(async () => ({ kind: 'started' as const, process })),
    closeTerminal: vi.fn(async () => ({ kind: 'closed' as const, status: 'confirmed' as const })),
    terminals: vi.fn(async () => ({
      kind: 'terminals' as const,
      values: [{ terminal, state: 'idle' as const, observedCwd: '/selected/workspace' }],
    })),
  }
  const description: EnvironmentDescription = {
    reference: { provider: 'replaceable-provider', reference: 'remote-instance' },
    facilities: ['command'],
    instance: { id: 'selected-instance', generation: 'env-generation' },
    bindingLayer: 'host_machine',
    binding: { kind: 'host_machine' },
    continuity: { kind: 'notGuaranteed' },
  }
  const deps: InvocationDependencies = {
    context: {
      read: vi.fn(async (keys: readonly string[]) => ({
        kind: 'values' as const,
        values: keys.map(key => ({
          key,
          revision: 'r1',
          value: {
            cwd: '/selected/workspace',
            envs: { PATH: '/custom/path', NOTE: 'from-context' },
          },
          observedAt: '2026-10-07T00:00:00Z',
        })),
      })),
    },
    environment: { description, command },
    signal: controller.signal,
    wait: vi.fn(async () => ({ kind: 'rejected' as const, reason: 'notAllowed' as const })),
    frames: {
      emit: vi.fn(frame => {
        frames.push(frame)
        return { kind: 'accepted' as const }
      }),
    },
    costs: { report: vi.fn(async () => 'recorded' as const) },
  }
  return { deps, process, command, controller, frames, terminal }
}
