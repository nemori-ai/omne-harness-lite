import { fail, succeed } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { IdleObservation, ScopeReleaseDisposition } from './values.ts'
import type {
  AgentDrivePort,
  DriveFailure,
  DriveTarget,
  ExecutionStatus,
  ScopeReleasePort,
  SessionIdleInput,
  SessionNotifier,
} from './ports.ts'
import { canonicalText, digestOf } from './operations.ts'
import { evidence, guard } from './testing-values.ts'

export interface MemorySessionIdleInput<P> extends SessionIdleInput<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    observation(value: IdleObservation): void
    unavailable(value: boolean): void
  }>
}
export function createMemorySessionIdleInput<P>(
  initial: IdleObservation,
): MemorySessionIdleInput<P> {
  let observation = initial
  let down = false
  return {
    durability: 'none',
    inspect: async () =>
      down
        ? fail({
            kind: 'unavailable',
            owner: 'idle-input',
            diagnostic: 'idle coverage unavailable',
          })
        : succeed(observation),
    prepare: async (_input, command) =>
      down
        ? fail({
            kind: 'unavailable',
            owner: 'idle-input',
            diagnostic: 'idle coverage unavailable',
          })
        : succeed([
            guard('idle-input', 'idle-input', { operation: command.input.operation, observation }),
          ]),
    controls: {
      observation: value => {
        observation = value
      },
      unavailable: value => {
        down = value
      },
    },
  }
}
export interface MemorySessionNotifier extends SessionNotifier {
  readonly durability: 'none'
  readonly controls: Readonly<{
    drop(value: boolean): void
    notifications(): readonly Parameters<SessionNotifier['committed']>[0][]
  }>
}
export function createMemorySessionNotifier(): MemorySessionNotifier {
  let dropping = false
  const seen: Parameters<SessionNotifier['committed']>[0][] = []
  return {
    durability: 'none',
    committed: async input => {
      if (!dropping) seen.push(input)
    },
    controls: {
      drop: value => {
        dropping = value
      },
      notifications: () => [...seen],
    },
  }
}
export interface MemoryScopeRelease extends ScopeReleasePort {
  readonly durability: 'none'
  readonly controls: Readonly<{
    dispositions(values: readonly ScopeReleaseDisposition[]): void
    requests(): readonly Parameters<ScopeReleasePort['release']>[0][]
  }>
}
export function createMemoryScopeRelease(): MemoryScopeRelease {
  let dispositions: readonly ScopeReleaseDisposition[] = ['released']
  const requests: Parameters<ScopeReleasePort['release']>[0][] = []
  return {
    durability: 'none',
    release: async input => {
      requests.push(input)
      return {
        dispositions: [...dispositions],
        source: evidence(`scope-release/${digestOf(input)}/${digestOf(dispositions)}`),
      }
    },
    controls: {
      dispositions: values => {
        dispositions = values
      },
      requests: () => [...requests],
    },
  }
}
export interface MemoryAgentDrive extends AgentDrivePort {
  readonly durability: 'none'
  readonly controls: Readonly<{
    denied(value: boolean): void
    unavailable(value: boolean): void
    status(input: Omit<DriveTarget, 'operation'>, value: ExecutionStatus): void
  }>
}
export function createMemoryAgentDrive(): MemoryAgentDrive {
  let denied = false
  let down = false
  const executions = new Map<string, ExecutionStatus>()
  const operations = new Map<
    string,
    Readonly<{ digest: string; revision: string; evidence: ReturnType<typeof evidence> }>
  >()
  const keyOf = (input: Omit<DriveTarget, 'operation'>): string => {
    const tenant = tenantCodec.encode(input.tenant)
    if (!tenant.ok) throw new TypeError('drive input requires a minted tenant')
    return canonicalText([tenant.value, input.session, input.execution])
  }
  const refusal = (): DriveFailure | null =>
    denied
      ? { kind: 'denied' }
      : down
        ? { kind: 'unavailable', diagnostic: 'Agent provider unavailable' }
        : null
  const write = async (method: string, input: DriveTarget, value: unknown) => {
    const blocked = refusal()
    if (blocked !== null) return fail(blocked)
    const key = keyOf(input)
    const operation = `${key}/${input.operation}`
    const digest = digestOf({ method, value })
    const prior = operations.get(operation)
    if (prior !== undefined)
      return prior.digest === digest
        ? succeed({ revision: prior.revision, evidence: prior.evidence })
        : fail({ kind: 'conflict' as const })
    const current = executions.get(key)
    if (method !== 'invoke' && current === undefined)
      return fail({
        kind: 'invalid' as const,
        reason: 'execution missing',
        rejection: evidence('missing'),
      })
    if (method === 'invoke' && current !== undefined) return fail({ kind: 'conflict' as const })
    if (current?.state === 'ended' && method !== 'recordResult')
      return fail({ kind: 'terminal' as const })
    const revision = String(BigInt(current?.revision ?? '0') + 1n)
    const receipt = { revision, evidence: evidence(`drive/${digestOf(operation)}/${revision}`) }
    executions.set(key, {
      revision,
      state: method === 'detach' ? 'suspended' : current?.state === 'ended' ? 'ended' : 'open',
      attachment:
        method === 'detach'
          ? 'detached'
          : method === 'invoke' || method === 'resume'
            ? 'active'
            : (current?.attachment ?? null),
      conclusion: current?.conclusion ?? null,
      evidence: receipt.evidence,
    })
    operations.set(operation, { ...receipt, digest })
    return succeed(receipt)
  }
  return {
    durability: 'none',
    invoke: input => write('invoke', input, input),
    submit: input => write('submit', input, input),
    resume: input => write('resume', input, input),
    control: input => write('control', input, input),
    recordResult: input => write('recordResult', input, input),
    detach: async input => {
      const result = await write('detach', input, input)
      return 'failure' in result ? result : succeed(result.ok.evidence)
    },
    query: async input => {
      const blocked = refusal()
      return blocked === null
        ? succeed(operations.has(`${keyOf(input)}/${input.operation}`) ? 'committed' : 'unknown')
        : fail(blocked)
    },
    inspect: async input => {
      const blocked = refusal()
      return blocked === null
        ? succeed(
            executions.get(keyOf(input)) ?? {
              revision: null,
              state: 'missing',
              attachment: null,
              conclusion: null,
              evidence: evidence(`missing/${digestOf(keyOf(input))}`),
            },
          )
        : fail(blocked)
    },
    prewarm: async () => {
      const blocked = refusal()
      return fail(blocked ?? { kind: 'unsupported' })
    },
    controls: {
      denied: value => {
        denied = value
      },
      unavailable: value => {
        down = value
      },
      status: (input, value) => {
        executions.set(keyOf(input), value)
      },
    },
  }
}
