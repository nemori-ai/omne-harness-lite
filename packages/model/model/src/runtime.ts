import { createModelDriver } from './driver.ts'
import type {
  ModelCommands,
  ModelSendBoundary,
  ModelRetryPolicy,
  ModelInstanceHost,
  ModelClock,
  ModelProvider,
  ModelDriver,
  Reply,
} from '@omne-harness/model-contract'

export type ModelConfiguration = Readonly<{
  outputBatchBytes: number
  outputBatchDelayMs: number
  observerBufferBytes: number
  observerCheckIntervalMs: number
  readIdleMs: number
  resultPageTargetBytes: number
  retryBackoffMs: number
  cleanupRetryMs: number
}>
export type ModelDependencies<P> = Readonly<{
  commands: ModelCommands<P>
  send: ModelSendBoundary<P>
  retry: ModelRetryPolicy<P>
  instances: ModelInstanceHost<P>
  clock: ModelClock
}>
export type ModelRuntimeProvider<P> = ModelProvider<P> & Readonly<{ driver: ModelDriver<P> }>
const METHODS = {
  commands: [
    'admit',
    'recall',
    'scanPending',
    'loadRecovery',
    'claim',
    'prepareDispatch',
    'recordMaterialization',
    'recordSend',
    'openReceiveWindow',
    'preserve',
    'recordLateFact',
    'prepareRetry',
    'decideRetry',
    'settle',
    'control',
    'acquireRead',
    'nextRead',
    'endRead',
    'handoff',
    'advanceCleanup',
    'query',
    'dispatches',
  ],
  send: ['send'],
  retry: ['decide', 'inspect'],
  instances: ['schedule', 'publish', 'withdraw'],
  clock: ['now', 'waitUntil'],
} as const
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function validate(dependencies: unknown, configuration: unknown): void {
  if (!record(dependencies)) throw new TypeError('Model dependencies must be an object')
  for (const [name, methods] of Object.entries(METHODS)) {
    const port = dependencies[name]
    if (!record(port) || methods.some(method => typeof port[method] !== 'function'))
      throw new TypeError(`invalid Model dependency ${name}`)
    if (
      name === 'instances' &&
      (!record(port.directory) || typeof port.directory.connect !== 'function')
    )
      throw new TypeError('invalid Model instance directory')
  }
  if (!record(configuration)) throw new TypeError('Model configuration must be an object')
  const fields = {
    outputBatchBytes: 1,
    observerBufferBytes: 1,
    observerCheckIntervalMs: 1,
    resultPageTargetBytes: 1,
    readIdleMs: 1,
    outputBatchDelayMs: 0,
    retryBackoffMs: 0,
    cleanupRetryMs: 0,
  }
  for (const [field, lower] of Object.entries(fields)) {
    const value = configuration[field]
    if (typeof value !== 'number')
      throw new TypeError(`missing or invalid Model configuration ${field}`)
    if (
      !Number.isFinite(value) ||
      !(field === 'observerCheckIntervalMs'
        ? Number.isSafeInteger(value)
        : Number.isInteger(value)) ||
      value < lower
    )
      throw new RangeError(`Model configuration ${field} is out of range`)
  }
}
function unavailable(operation: string, stage: string): Reply<never> {
  return Promise.resolve({
    failure: {
      kind: 'unavailable',
      dependency: 'model-runtime',
      diagnostic: `managed-runtime-not-implemented operation=${operation} stage=${stage}`,
    },
  })
}
/** Constructs the call facade, result consumption, stream driver and instance observations. */
export function createModelRuntime<P>(
  dependencies: ModelDependencies<P>,
  configuration: ModelConfiguration,
): ModelRuntimeProvider<P> {
  validate(dependencies, configuration)
  const { commands, instances } = dependencies
  const activity = createModelDriver(
    commands,
    instances,
    dependencies.clock,
    configuration,
    dependencies.send,
  )
  async function wake(input: Parameters<typeof instances.schedule>[0]): Promise<void> {
    try {
      await instances.schedule(input)
    } catch {
      /* Committed work remains pending for recovery. */
    }
  }
  const reserved = (operation: string) =>
    operation.startsWith('mop_--')
      ? Promise.resolve({
          failure: { kind: 'invalid', field: 'operation', reason: 'reserved' },
        } as const)
      : null
  return {
    runtime: {
      calls: {
        admit: async ({ principal, tenant, call, operation, request, consumer, capacity }) => {
          const input = {
            principal,
            tenant,
            ...structuredClone({ call, operation, request, consumer, capacity }),
          }
          const result = await commands.admit(input)
          if ('ok' in result) await wake({ tenant: input.tenant, call: input.call })
          return result
        },
        inspect: ({ principal, tenant, call, admission }) =>
          commands.recall({ principal, tenant, call, admission }),
        dispatches: ({ principal, tenant, call }) =>
          commands.dispatches({ principal, tenant, call }),
        cancel: async ({ principal, tenant, call, operation }) => {
          const input = { principal, tenant, call, operation }
          const result = await commands.control(input)
          if ('ok' in result) {
            activity.requestRefresh(input)
            await wake({ tenant: input.tenant, call: input.call })
          }
          return result
        },
      },
      consumption: {
        beginRead: async ({ principal, tenant, call, operation, result }) =>
          reserved(operation) ??
          commands.acquireRead({ principal, tenant, call, operation, result }),
        readNext: async ({ principal, tenant, call, read, after }) =>
          commands.nextRead({ principal, tenant, call, read, after }),
        closeRead: async ({ principal, tenant, call, read }) =>
          commands.endRead({ principal, tenant, call, read }),
        acknowledge: async ({ principal, tenant, call, operation, result, evidence }) => {
          const refused = reserved(operation)
          if (refused) return refused
          if (evidence.kind === 'retained') return unavailable('consumption.acknowledge', '6.1')
          const { owner, record, revision, digest } = evidence.completion
          const input = {
            principal,
            tenant,
            call,
            operation,
            result,
            evidence: {
              kind: 'processed',
              completion: { owner, record, revision, digest },
            } as const,
          }
          const outcome = await commands.handoff(input)
          if ('ok' in outcome) {
            try {
              activity.requestRefresh(input)
            } catch {
              // Observation refresh has no authority to reverse a confirmed acknowledgement.
            }
          }
          return outcome
        },
      },
      instances: {
        connect: ({ principal, tenant, call }) =>
          instances.directory.connect({ principal, tenant, call }),
      },
    },
    recover: () => unavailable('recover', '5.4'),
    quiesce: () => unavailable('quiesce', '5.5'),
    driver: activity.driver,
  }
}
