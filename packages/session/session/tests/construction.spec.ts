// The factory checks its start conditions and its configuration before it builds or calls anything
// (docs/public-api.md「依赖」「配置」, SPEC「资源与替换」, SR-3).
import { describe, expect, it } from 'vitest'
import {
  createSessionInstance,
  defaultSchedulingPolicy,
  type SchedulingPolicy,
  type SessionDependencies,
} from '../src/index.ts'

/** Dependencies whose every method call is counted; the factory must call none at construction. */
function countedDependencies(): { dependencies: SessionDependencies<string>; calls: () => number } {
  let calls = 0
  const port = new Proxy(
    {},
    {
      get: () => () => {
        calls += 1
        return Promise.resolve({ failure: { kind: 'unavailable', owner: 't', diagnostic: 't' } })
      },
    },
  )
  const current = { current: () => null }
  const dependencies = {
    accessCheck: port,
    transactions: port,
    workPrincipals: port,
    directory: current,
    identity: port,
    evidence: port,
    clock: port,
    idle: port,
    context: port,
    notifier: current,
    agentDrive: current,
    scopeRelease: current,
    principals: { coordinator: 'system:coordinator', maintainer: 'system:maintainer' },
    admission: { current: () => [] },
  } as unknown as SessionDependencies<string>
  return { dependencies, calls: () => calls }
}

const configuration = { policy: defaultSchedulingPolicy }

describe('start conditions', () => {
  for (const missing of ['accessCheck', 'transactions', 'workPrincipals', 'principals'] as const)
    it(`without ${missing} no instance is constructed and no dependency is called`, () => {
      const { dependencies, calls } = countedDependencies()
      const without = {
        ...dependencies,
        [missing]: undefined,
      } as unknown as SessionDependencies<string>
      expect(() => createSessionInstance(without, configuration)).toThrow(missing)
      expect(calls()).toBe(0)
    })

  it('the ports resolved per call may be absent at construction', () => {
    const { dependencies, calls } = countedDependencies()
    const instance = createSessionInstance(dependencies, configuration)
    expect(typeof instance.facesFor).toBe('function')
    expect(calls()).toBe(0)
  })
})

describe('configuration (SR-3)', () => {
  it('the defaults are the SPEC SchedulingPolicy seeds', () => {
    expect(defaultSchedulingPolicy).toEqual({
      command: { retriesOnChanged: 3 },
      advance: { retryDelaysMs: [1000, 5000, 30000] },
      idle: { checkIntervalMs: 60000, clockToleranceMs: 5000 },
      recoveryScan: {
        periodMs: 30000,
        pageSize: 100,
        sessionBackoff: { initialMs: 5000, multiplier: 2, maxMs: 300000 },
      },
      pendingResolution: { retryIntervalMs: 5000, maxAttempts: 60 },
      controlReplay: { intervalMs: 10000, maxReplays: 30 },
      cascade: { intervalMs: 10000, maxDrives: 30 },
      preEvaluation: { concurrency: 2, prewarm: false },
      boundedRecovery: { maxInspectAttempts: 10, retryIntervalMs: 30000 },
      cache: { entryBudgetBytes: 67108864, snapshotSessions: 1024 },
    })
  })

  /** Replaces one field at `path` of the default policy. */
  function withField(path: string, value: unknown): SchedulingPolicy {
    const policy = structuredClone(defaultSchedulingPolicy) as Record<string, unknown>
    const keys = path.split('.')
    let node = policy
    for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>
    node[keys.at(-1) as string] = value
    return policy as SchedulingPolicy
  }

  const numeric = [
    'command.retriesOnChanged',
    'idle.checkIntervalMs',
    'idle.clockToleranceMs',
    'recoveryScan.periodMs',
    'recoveryScan.pageSize',
    'recoveryScan.sessionBackoff.initialMs',
    'recoveryScan.sessionBackoff.multiplier',
    'recoveryScan.sessionBackoff.maxMs',
    'pendingResolution.retryIntervalMs',
    'pendingResolution.maxAttempts',
    'controlReplay.intervalMs',
    'controlReplay.maxReplays',
    'cascade.intervalMs',
    'cascade.maxDrives',
    'preEvaluation.concurrency',
    'boundedRecovery.maxInspectAttempts',
    'boundedRecovery.retryIntervalMs',
    'cache.entryBudgetBytes',
    'cache.snapshotSessions',
  ]
  for (const path of numeric)
    it(`${path}: a negative or non-finite value is refused with the field path`, () => {
      const { dependencies, calls } = countedDependencies()
      for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '5'])
        expect(() =>
          createSessionInstance(dependencies, { policy: withField(path, value) }),
        ).toThrow(`policy.${path}`)
      expect(calls()).toBe(0)
    })

  const limits = numeric.filter(path => path !== 'idle.clockToleranceMs')
  for (const path of limits)
    it(`${path}: zero is refused`, () => {
      const { dependencies } = countedDependencies()
      expect(() => createSessionInstance(dependencies, { policy: withField(path, 0) })).toThrow(
        `policy.${path}`,
      )
    })

  it('a zero clock tolerance is a valid configuration', () => {
    const { dependencies } = countedDependencies()
    expect(() =>
      createSessionInstance(dependencies, { policy: withField('idle.clockToleranceMs', 0) }),
    ).not.toThrow()
  })

  it('an empty or negative backoff sequence is refused', () => {
    const { dependencies } = countedDependencies()
    expect(() =>
      createSessionInstance(dependencies, { policy: withField('advance.retryDelaysMs', []) }),
    ).toThrow('policy.advance.retryDelaysMs')
    expect(() =>
      createSessionInstance(dependencies, { policy: withField('advance.retryDelaysMs', [10, -1]) }),
    ).toThrow('policy.advance.retryDelaysMs.1')
  })

  it('prewarm cannot be switched on before the Agent host instance-creation entry exists', () => {
    const { dependencies } = countedDependencies()
    expect(() =>
      createSessionInstance(dependencies, { policy: withField('preEvaluation.prewarm', true) }),
    ).toThrow('policy.preEvaluation.prewarm')
  })

  it('a non-integer count is refused', () => {
    const { dependencies } = countedDependencies()
    expect(() =>
      createSessionInstance(dependencies, { policy: withField('recoveryScan.pageSize', 1.5) }),
    ).toThrow('policy.recoveryScan.pageSize')
  })
})
