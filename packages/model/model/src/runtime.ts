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
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < lower)
      throw new RangeError(`Model configuration ${field} is out of range`)
  }
}
function unavailable<T>(): Reply<T> {
  return Promise.resolve({
    failure: {
      kind: 'unavailable',
      dependency: 'model-runtime',
      diagnostic: 'managed-runtime-not-implemented',
    },
  })
}
/** Validates and constructs a runtime whose managed operations return explicit unavailable failures. */
export function createModelRuntime<P>(
  dependencies: ModelDependencies<P>,
  configuration: ModelConfiguration,
): ModelRuntimeProvider<P> {
  validate(dependencies, configuration)
  return {
    runtime: {
      calls: {
        admit: unavailable,
        inspect: unavailable,
        dispatches: unavailable,
        cancel: unavailable,
      },
      consumption: {
        beginRead: unavailable,
        readNext: unavailable,
        closeRead: unavailable,
        acknowledge: unavailable,
      },
      instances: { connect: unavailable },
    },
    recover: unavailable,
    quiesce: unavailable,
    driver: { drive: unavailable },
  }
}
