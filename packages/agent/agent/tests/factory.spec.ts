// C1 of #509: createAgentRuntime checks configuration, binding, registration handle, required
// dependencies and joint commits before it builds anything. Each failure builds no runtime and calls
// no dependency method: no Journal write, no event, no registration, no access check.
import { describe, expect, it } from 'vitest'
import { createAgentRuntime, type AgentConfiguration } from '@omne-harness/agent'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import type { Failure } from '@omne-harness/agent-contract'
import {
  createdProvider,
  options,
  registrationHandle,
  take,
  watched,
  type Dependencies,
} from './factory-support.ts'
import { adoption, failure, instance, ok, type Principal } from './journal-support.ts'

const OWNER = '@omne-harness/agent'

/** Creates with a watched copy of the test assembly; returns the result and the call log. */
async function create(
  configure: (dependencies: Dependencies) => Dependencies = dependencies => dependencies,
  creation = options(),
  journal: {
    participants?: readonly ('message' | 'context-transition' | 'custody' | 'processed')[]
    coordination?: 'standalone' | 'coordinated'
  } = {},
) {
  const assembly = createTestAgentDependencies<Principal>({ journal })
  const { dependencies, calls } = watched(configure(assembly.dependencies))
  const created = await createAgentRuntime(dependencies, creation)
  return { created, calls }
}

async function refused(
  configure?: (dependencies: Dependencies) => Dependencies,
  creation = options(),
  journal = {},
): Promise<Failure> {
  const { created, calls } = await create(configure, creation, journal)
  expect(calls, 'a refused creation calls no dependency').toEqual([])
  return failure(created)
}

/** A configuration value that the type forbids, as an untyped caller could pass it. */
const loose = (value: unknown) => value as never

describe('C1 invalid: a configuration value out of range', () => {
  const cases: readonly [keyof AgentConfiguration, unknown, string][] = [
    ['observerBufferBytes', 0, 'observerBufferBytes'],
    ['observerBufferBytes', 1.5, 'observerBufferBytes'],
    ['observerBufferBytes', Number.MAX_SAFE_INTEGER + 1, 'observerBufferBytes'],
    ['observerBufferBytes', '1024', 'observerBufferBytes'],
    ['reconciliationDelayMs', -1, 'reconciliationDelayMs'],
    ['reconciliationDelayMs', 0.5, 'reconciliationDelayMs'],
    ['reconciliationDelayMs', Number.POSITIVE_INFINITY, 'reconciliationDelayMs'],
    ['reconciliationBatchLimit', 0, 'reconciliationBatchLimit'],
    ['reconciliationBatchLimit', Number.NaN, 'reconciliationBatchLimit'],
    ['denialBackoffMs', -1, 'denialBackoffMs'],
    ['toolConcurrency', 0, 'toolConcurrency'],
    ['toolConcurrency', -3, 'toolConcurrency'],
    ['jointCommits', 'message', 'jointCommits'],
    ['jointCommits', ['none'], 'jointCommits'],
    ['jointCommits', ['message', 'message'], 'jointCommits'],
    ['coordination', 'both', 'coordination'],
    ['coordination', undefined, 'coordination'],
    ['coordination', null, 'coordination'],
    ['loopGuardPolicy', null, 'loopGuardPolicy'],
    ['loopGuardPolicy', { ...adoption('loop-guard'), digest: '' }, 'loopGuardPolicy.digest'],
    ['loopGuardPolicy', { owner: 'o', name: 'n', revision: '1' }, 'loopGuardPolicy.digest'],
    ['loopGuardPolicy', { ...adoption('loop-guard'), extra: 'x' }, 'loopGuardPolicy.extra'],
  ]
  it.each(cases)('%s = %j is invalid at configuration.%s', async (key, value, field) => {
    const result = await refused(undefined, options({ [key]: loose(value) }))
    expect(result).toMatchObject({ kind: 'invalid', field: `configuration.${field}` })
  })

  it('accepts the bounds: zero delays and the largest safe capacities', async () => {
    const { created, calls } = await create(
      undefined,
      options({
        observerBufferBytes: Number.MAX_SAFE_INTEGER,
        reconciliationBatchLimit: Number.MAX_SAFE_INTEGER,
        toolConcurrency: Number.MAX_SAFE_INTEGER,
        reconciliationDelayMs: 0,
        denialBackoffMs: 0,
      }),
    )
    ok(created)
    expect(calls).toEqual([])
  })
})

describe('C1 invalid: a binding field that is not well formed', () => {
  const base = options()
  const cases: readonly [string, unknown, string][] = [
    ['instance', '', 'binding.instance'],
    ['instance', 'has space', 'binding.instance'],
    ['tenant', { name: 'TenantId', organization: 'org', account: 'acc' }, 'binding.tenant'],
    ['scope', { owner: 'o', record: 'r', revision: '1' }, 'binding.scope.digest'],
    ['definition', { ...adoption('definition'), name: '' }, 'binding.definition.name'],
  ]
  it.each(cases)('binding.%s = %j is invalid at %s', async (key, value, field) => {
    const creation = { ...base, binding: { ...base.binding, [key]: loose(value) } }
    expect(await refused(undefined, creation)).toMatchObject({ kind: 'invalid', field })
  })

  it('reports the configuration before the binding', async () => {
    const creation = {
      binding: { ...base.binding, instance: loose('') },
      configuration: { ...base.configuration, toolConcurrency: 0 },
    }
    expect(await refused(undefined, creation)).toMatchObject({
      field: 'configuration.toolConcurrency',
    })
  })
})

describe('C1 denied: the registration handle names another instance', () => {
  it('refuses a handle of another instance and never calls it', async () => {
    const handleCalls: string[] = []
    const result = await refused(dependencies => ({
      ...dependencies,
      registration: registrationHandle(instance('instance-2'), handleCalls),
    }))
    expect(result.kind).toBe('denied')
    expect(handleCalls).toEqual([])
  })

  it('accepts a handle of the bound instance and does not call it during creation', async () => {
    const handleCalls: string[] = []
    const { created, calls } = await create(dependencies => ({
      ...dependencies,
      registration: registrationHandle(instance(), handleCalls),
    }))
    ok(created)
    expect([...calls, ...handleCalls]).toEqual([])
  })
})

describe('C1 unavailable: a required dependency is absent', () => {
  const required = [
    'journal',
    'access',
    'models',
    'adoptions',
    'conditions',
    'requests',
    'selection',
    'modelContext',
    'handoff',
    'clock',
  ] as const
  it.each(required)('%s absent returns unavailable that names it', async name => {
    const result = await refused(dependencies => ({ ...dependencies, [name]: loose(undefined) }))
    expect(result).toMatchObject({ kind: 'unavailable', owner: OWNER })
    expect(result.kind === 'unavailable' && result.diagnostic).toContain(name)
  })

  it('reports the binding before an absent dependency', async () => {
    const base = options()
    const creation = { ...base, binding: { ...base.binding, instance: loose('') } }
    const result = await refused(
      dependencies => ({ ...dependencies, journal: loose(null) }),
      creation,
    )
    expect(result).toMatchObject({ kind: 'invalid', field: 'binding.instance' })
  })

  // Cards, materials and reads fail only on their own path, never the creation (public-api
  // dependency table). Tools, admission and extensions depend on the adopted definition, which the
  // factory cannot read at creation; see tests/README.md.
  it.each(['cards', 'materials', 'reads'] as const)(
    '%s absent does not stop the creation',
    async name => {
      const { created, calls } = await create(dependencies => ({
        ...dependencies,
        [name]: loose(undefined),
      }))
      ok(created)
      expect(calls).toEqual([])
    },
  )

  it('registration null is a complete runtime without a directory route', async () => {
    const { created } = await create(dependencies => ({ ...dependencies, registration: null }))
    ok(created)
  })
})

describe('C1 unsupported: a joint commit kind that the Journal does not declare', () => {
  it('refuses message when the Journal declares no participant', async () => {
    const result = await refused(undefined, options({ jointCommits: ['message'] }))
    expect(result).toEqual({ kind: 'unsupported' })
  })

  it('refuses when one kind of several is missing', async () => {
    const result = await refused(undefined, options({ jointCommits: ['message', 'custody'] }), {
      participants: ['message', 'processed'],
    })
    expect(result).toEqual({ kind: 'unsupported' })
  })

  it('creates when every kind is declared, in any order', async () => {
    const { created, calls } = await create(
      undefined,
      options({ jointCommits: ['custody', 'message'] }),
      { participants: ['message', 'custody'] },
    )
    ok(created)
    expect(calls).toEqual([])
  })

  it('creates when all four kinds are declared', async () => {
    const all = ['message', 'context-transition', 'custody', 'processed'] as const
    const { created, calls } = await create(undefined, options({ jointCommits: all }), {
      participants: all,
    })
    ok(created)
    expect(calls).toEqual([])
  })

  it('reports an absent Journal as unavailable, not unsupported', async () => {
    const result = await refused(
      dependencies => ({ ...dependencies, journal: loose(undefined) }),
      options({ jointCommits: ['message'] }),
    )
    expect(result).toMatchObject({ kind: 'unavailable', owner: OWNER })
  })
})

// SPEC "提交参加者协议": the factory compares the configured mode with the binding's declaration
// strictly, before it creates the runtime, registers or writes any state; there is no default.
describe('C1 unsupported: the coordination mode of the Journal binding', () => {
  it('refuses a coordinated binding under a standalone configuration', async () => {
    const result = await refused(undefined, options({ coordination: 'standalone' }), {
      coordination: 'coordinated',
    })
    expect(result).toEqual({ kind: 'unsupported' })
  })

  it('refuses a standalone binding under a coordinated configuration', async () => {
    const result = await refused(undefined, options({ coordination: 'coordinated' }), {
      coordination: 'standalone',
    })
    expect(result).toEqual({ kind: 'unsupported' })
  })

  it('refuses a binding that declares no coordination mode', async () => {
    const result = await refused(dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        capabilities: loose({ participants: dependencies.journal.capabilities.participants }),
      },
    }))
    expect(result).toEqual({ kind: 'unsupported' })
  })

  it('creates a coordinated runtime when the binding declares coordinated', async () => {
    const { created, calls } = await create(undefined, options({ coordination: 'coordinated' }), {
      coordination: 'coordinated',
    })
    ok(created)
    expect(calls).toEqual([])
  })

  it('checks the mode before the joint commit kinds', async () => {
    const result = await refused(
      undefined,
      options({ coordination: 'coordinated', jointCommits: ['message'] }),
      { coordination: 'standalone' },
    )
    expect(result).toEqual({ kind: 'unsupported' })
  })
})

describe('C1 success: an idle provider', () => {
  it('returns the four faces for the bound instance', async () => {
    const provider = await createdProvider()
    expect(provider.runtime.instance).toBe(instance())
    expect(provider.observation.instance).toBe(instance())
    expect(provider.recovery).toBeTypeOf('object')
    expect(provider.control).toBeTypeOf('object')
  })

  it('observe shows the state idle of the bound instance', async () => {
    const provider = await createdProvider()
    const controller = new AbortController()
    const [first] = await take(
      provider.observation.observe({
        principal: 'alice',
        tenant: options().binding.tenant,
        signal: controller.signal,
      }),
      1,
    )
    controller.abort()
    expect(first).toEqual({ kind: 'state', value: { kind: 'idle', instance: instance() } })
  })

  it('two creations with one binding give two independent providers', async () => {
    const first = await createdProvider()
    const second = await createdProvider()
    expect(first).not.toBe(second)
    expect(first.runtime).not.toBe(second.runtime)
  })
})
