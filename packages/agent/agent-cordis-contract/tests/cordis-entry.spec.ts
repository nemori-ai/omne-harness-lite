import { readFileSync } from 'node:fs'
import { Context, Service } from '@deepseek-ai/cordis'
import type { AgentAccessDecision } from '@omne-harness/agent-contract'
import { describe, expect, it } from 'vitest'
import * as cordis from '@omne-harness/agent-cordis-contract/cordis'
import {
  AgentAccessCheckService,
  AgentClockService,
  AgentInstanceHostService,
  AgentInstancesService,
  AgentPublicationAuthorityService,
  agentAccessCheckKey,
  agentClockKey,
  agentInstancesKey,
  agentInstancesPlugin,
} from '@omne-harness/agent-cordis-contract/cordis'
import { describeImport, memberPath, walkModules, type ModuleKind } from './module-graph.ts'

/** The key table of docs/cordis.md: key constant to its class. */
const documentedPairs = {
  agentJournalKey: 'AgentJournalService',
  agentAccessCheckKey: 'AgentAccessCheckService',
  agentModelSelectionKey: 'ModelSelectionService',
  agentModelContextKey: 'ModelContextReaderService',
  agentActionAdmissionKey: 'ActionAdmissionService',
  agentDecisionCardsKey: 'DecisionCardsService',
  agentMessageHandoffKey: 'MessageHandoffService',
  agentExtensionsKey: 'ExtensionImplementationsService',
  agentAdoptionsKey: 'AgentAdoptionsService',
  agentConditionsKey: 'CurrentConditionsService',
  agentRequestsKey: 'RequestPreparationService',
  agentMaterialsKey: 'AgentMaterialsService',
  agentReadsKey: 'RegisteredReadsService',
  agentClockKey: 'AgentClockService',
  agentInstanceHostKey: 'AgentInstanceHostService',
  agentPublicationAuthorityKey: 'AgentPublicationAuthorityService',
  agentExecutionRecoveryKey: 'AgentExecutionRecoveryService',
  agentInstancesKey: 'AgentInstancesService',
} as const

/** The Agent packages that depend on this one. This one must not depend on either. */
const dependent = /^@omne-harness\/agent(-host-local)?(\/|$)/u

// `FiberState` is a const enum of Cordis, so its members are not values to import: 0 is PENDING and
// 2 is ACTIVE in Cordis 4.0.4.
const PENDING = 0
const ACTIVE = 2

const exported = Object.entries(cordis as Record<string, unknown>)
const keyConstants = exported.filter(([name]) => name.endsWith('Key'))
const serviceClasses = exported.filter(
  (entry): entry is [string, typeof Service & { provide: string }] =>
    typeof entry[1] === 'function' && entry[1].prototype instanceof Service,
)

describe('service keys', () => {
  it('exports 18 unique keys, one per documented pair', () => {
    const keys = keyConstants.map(([, value]) => value)
    expect(keys).toHaveLength(18)
    expect(new Set(keys).size).toBe(18)
    expect(keyConstants.map(([name]) => name).sort()).toEqual(Object.keys(documentedPairs).sort())
  })

  it.each(Object.entries(documentedPairs))(
    'takes %s from the static provide of %s',
    (key, type) => {
      const exports = cordis as Record<string, unknown>
      const definition = exports[type] as { provide: string } | undefined
      expect(serviceClasses.map(([name]) => name)).toContain(type)
      expect(exports[key]).toBe(definition?.provide)
    },
  )

  it('has one service class per key, no more, and one plugin beside them', () => {
    expect(serviceClasses).toHaveLength(18)
    expect(new Set(serviceClasses.map(([, type]) => type.provide)).size).toBe(18)
    for (const [name] of serviceClasses) expect(name).toMatch(/^[A-Z][A-Za-z]+Service$/u)
    expect(exported.map(([name]) => name).filter(name => !/(Service|Key)$/u.test(name))).toEqual([
      'agentInstancesPlugin',
    ])
  })
})

describe('the key texts', () => {
  // The texts are written out, because a key that equals the `provide` of its class would still
  // pass the pairing above if both were changed together, and a plugin reads a service by its text.
  it('are the names of the documented services', () => {
    expect(Object.fromEntries(keyConstants)).toEqual({
      agentJournalKey: 'agentJournal',
      agentAccessCheckKey: 'agentAccessCheck',
      agentModelSelectionKey: 'agentModelSelection',
      agentModelContextKey: 'agentModelContext',
      agentActionAdmissionKey: 'agentActionAdmission',
      agentDecisionCardsKey: 'agentDecisionCards',
      agentMessageHandoffKey: 'agentMessageHandoff',
      agentExtensionsKey: 'agentExtensions',
      agentAdoptionsKey: 'agentAdoptions',
      agentConditionsKey: 'agentConditions',
      agentRequestsKey: 'agentRequests',
      agentMaterialsKey: 'agentMaterials',
      agentReadsKey: 'agentReads',
      agentClockKey: 'agentClock',
      agentInstanceHostKey: 'agentInstanceHost',
      agentPublicationAuthorityKey: 'agentPublicationAuthority',
      agentExecutionRecoveryKey: 'agentExecutionRecovery',
      agentInstancesKey: 'agentInstances',
    })
  })
})

describe('the documentation that the built declaration carries', () => {
  const declaration = readFileSync(memberPath('dist/cordis.d.ts'), 'utf8')

  it('names its owner on each of the 18 service classes and claims no contract id', () => {
    expect(declaration.match(/@owner packages\/agent\/agent-cordis-contract/gu)).toHaveLength(18)
    expect(declaration).not.toContain('@contract')
  })

  it('gives instance-retired its dispatch mode and one param per payload member', () => {
    const event = declaration.slice(declaration.indexOf("'agent-cordis-contract/instance-retired'"))
    expect(declaration).toContain('@mode parallel')
    for (const name of ['tenant', 'instance', 'generation', 'reason'])
      expect(declaration).toContain(`@param ${name} - `)
    expect(event).toContain('tenant: TenantId')
  })
})

describe('the cordis definition entry has no Agent implementation', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['javascript', 'dist/cordis.js'],
    ['declaration', 'dist/cordis.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    const provider = graph.imports.filter(edge => dependent.test(edge.specifier))
    expect(provider.map(describeImport)).toEqual([])
    expect(graph.imports.map(edge => edge.specifier)).toContain('@deepseek-ai/cordis')
  })

  it('declares Cordis and the contract package, and neither dependent package', () => {
    const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/cordis': 'catalog:',
      '@omne-harness/agent-contract': 'workspace:*',
    })
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(declared.filter(name => dependent.test(name))).toEqual([])
  })
})

describe('under Cordis 4.0.4', () => {
  it('resolves a provider through the abstract definition key, as an instance of the definition', async () => {
    class FixedClock extends AgentClockService {
      readonly waitUntil: AgentClockService['waitUntil'] = async () => ({ ok: 'elapsed' })
    }
    const root = new Context()
    const fiber = root.plugin({ name: 'clock', apply: ctx => void new FixedClock(ctx) })
    await fiber
    const clock = root.get(agentClockKey)
    expect(clock).toBeInstanceOf(AgentClockService)
    expect(await clock?.waitUntil('2026-01-01T00:00:00Z', new AbortController().signal)).toEqual({
      ok: 'elapsed',
    })
    await fiber.dispose()
    expect(root.get(agentClockKey)).toBeUndefined()
  })

  it('provides each definition, whichever it is, under its own key and under no other', async () => {
    // `AgentInstancesService` takes the publication authority and is loaded through its plugin.
    const definitions = serviceClasses.filter(([, type]) => type.provide !== agentInstancesKey)
    expect(definitions).toHaveLength(17)
    for (const [name, type] of definitions) {
      const root = new Context()
      const make = type as unknown as new (ctx: Context) => Service
      const fiber = root.plugin({ name: 'provider', apply: ctx => void new make(ctx) })
      await fiber
      const provided = definitions.filter(([, other]) => root.get(other.provide) !== undefined)
      expect(
        provided.map(([provider]) => provider),
        name,
      ).toEqual([name])
      expect(root.get(type.provide), name).toBeInstanceOf(type)
      await fiber.dispose()
      expect(root.get(type.provide), name).toBeUndefined()
    }
  })

  it('lets one plugin body provide several definitions on one fiber', async () => {
    class Access extends AgentAccessCheckService<string> {
      readonly check: AgentAccessCheckService<string>['check'] = async () => ({ kind: 'denied' })
    }
    class Authority extends AgentPublicationAuthorityService<string> {
      readonly check: AgentPublicationAuthorityService<string>['check'] = () => ({ ok: undefined })
    }
    const root = new Context()
    const fiber = root.plugin({
      name: 'both',
      apply(ctx: Context) {
        new Access(ctx)
        new Authority(ctx)
      },
    })
    await fiber
    expect(root.get(agentAccessCheckKey)).toBeInstanceOf(AgentAccessCheckService)
    expect(root.get('agentPublicationAuthority')).toBeInstanceOf(AgentPublicationAuthorityService)
    await fiber.dispose()
    expect(root.get(agentAccessCheckKey)).toBeUndefined()
    expect(root.get('agentPublicationAuthority')).toBeUndefined()
  })

  it('gives the host definition its in-process route beside the host operations', async () => {
    class Host extends AgentInstanceHostService<string> {
      readonly reserve: AgentInstanceHostService<string>['reserve'] = async () => ({
        failure: { kind: 'unsupported' },
      })
      readonly publish: AgentInstanceHostService<string>['publish'] = async () => ({
        failure: { kind: 'unsupported' },
      })
      readonly withdraw: AgentInstanceHostService<string>['withdraw'] = async () => ({
        failure: { kind: 'unsupported' },
      })
      readonly directory: AgentInstanceHostService<string>['directory'] = {
        resolve: async () => ({ failure: { kind: 'unsupported' } }),
        connect: async () => ({ failure: { kind: 'unsupported' } }),
      }
      route() {
        return null
      }
    }
    const root = new Context()
    await root.plugin({ name: 'host', apply: ctx => void new Host(ctx) })
    expect(root.get('agentInstanceHost')?.route).toBeTypeOf('function')
  })
})

describe('the instance directory service, given input that is not valid', () => {
  const authority = { check: () => ({ ok: undefined }) }
  const allowed: AgentAccessDecision = { kind: 'denied' }

  async function directory() {
    const root = new Context()
    await root.plugin({
      name: 'directory',
      apply(ctx: Context) {
        new AgentInstancesService<unknown>(ctx, authority)
        new (class extends AgentAccessCheckService<unknown> {
          readonly check: AgentAccessCheckService<unknown>['check'] = async () => allowed
        })(ctx)
      },
    })
    const service = root.get(agentInstancesKey)
    if (service === undefined) throw new Error('the directory did not load')
    return service
  }

  const garbage: readonly unknown[] = [
    undefined,
    null,
    1,
    'text',
    {},
    [],
    { tenant: 'not a tenant' },
  ]

  it.each(garbage)('answers register with a named failure and does not throw: %j', async input => {
    const service = await directory()
    const answer = await service.register(input as never)
    expect(answer).toMatchObject({ failure: { kind: 'invalid', field: 'input' } })
  })

  it.each(garbage)('answers withdraw with a named failure and does not throw: %j', async input => {
    const service = await directory()
    const answer = await service.withdraw(input as never)
    expect(answer).toMatchObject({ failure: { kind: 'invalid', field: 'input' } })
  })

  it.each(garbage)('answers resolve and connect with a named failure: %j', async input => {
    const service = await directory()
    expect(await service.resolve(input as never)).toMatchObject({ failure: { kind: 'invalid' } })
    expect(await service.connect(input as never)).toMatchObject({ failure: { kind: 'invalid' } })
  })

  it('answers unavailable, not a throw, when register is called without its service', async () => {
    const { register } = await directory()
    expect(await register({} as never)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('the directory plugin', () => {
  class Access extends AgentAccessCheckService<unknown> {
    readonly check: AgentAccessCheckService<unknown>['check'] = async () => ({ kind: 'denied' })
  }
  class Authority extends AgentPublicationAuthorityService<unknown> {
    readonly check: AgentPublicationAuthorityService<unknown>['check'] = () => ({ ok: undefined })
  }

  it('names the two services that it needs and one that it provides', () => {
    expect(agentInstancesPlugin.inject).toEqual(['agentPublicationAuthority', 'agentAccessCheck'])
    expect(agentInstancesPlugin.name).toBe('agentInstances')
  })

  it('waits while the access check is missing and loads when it arrives', async () => {
    const root = new Context()
    await root.plugin({ name: 'authority', apply: ctx => void new Authority(ctx) })
    const directory = root.plugin(agentInstancesPlugin)
    await Promise.resolve()
    expect(directory.state).toBe(PENDING)
    expect(root.get(agentInstancesKey)).toBeUndefined()
    await root.plugin({ name: 'access', apply: ctx => void new Access(ctx) })
    await directory
    expect(directory.state).toBe(ACTIVE)
    expect(root.get(agentInstancesKey)).toBeInstanceOf(AgentInstancesService)
  })

  it('loads again when a provider of the publication authority changes', async () => {
    const root = new Context()
    await root.plugin({ name: 'access', apply: ctx => void new Access(ctx) })
    const first = root.plugin({ name: 'authority-1', apply: ctx => void new Authority(ctx) })
    await first
    await root.plugin(agentInstancesPlugin)
    const before = root.get(agentInstancesKey)
    await first.dispose()
    expect(root.get(agentInstancesKey)).toBeUndefined()
    await root.plugin({ name: 'authority-2', apply: ctx => void new Authority(ctx) })
    const after = root.get(agentInstancesKey)
    expect(after).toBeInstanceOf(AgentInstancesService)
    expect(after).not.toBe(before)
  })

  it.each([undefined, null, {}])('accepts the empty configuration %j', async config => {
    const root = new Context()
    await root.plugin({ name: 'access', apply: ctx => void new Access(ctx) })
    await root.plugin({ name: 'authority', apply: ctx => void new Authority(ctx) })
    // The plugin types its configuration as absent, so the runtime check gets values by assertion.
    await root.plugin(agentInstancesPlugin, config as never)
    expect(root.get(agentInstancesKey)).toBeInstanceOf(AgentInstancesService)
  })

  it.each([{ extra: 1 }, [], 'text', 3])(
    'refuses the configuration %j and provides nothing',
    async config => {
      const root = new Context()
      await root.plugin({ name: 'access', apply: ctx => void new Access(ctx) })
      await root.plugin({ name: 'authority', apply: ctx => void new Authority(ctx) })
      await expect(root.plugin(agentInstancesPlugin, config as never)).rejects.toThrow(
        /invalid config/u,
      )
      expect(root.get(agentInstancesKey)).toBeUndefined()
    },
  )
})

describe('the configuration check of the directory plugin', () => {
  const validate = (value: unknown) =>
    (
      agentInstancesPlugin.Config['~standard'] as {
        validate(value: unknown): { value?: unknown; issues?: readonly { message: string }[] }
      }
    ).validate(value)

  it('names its vendor and takes an absent, a null and an empty object configuration as the empty one', () => {
    expect(agentInstancesPlugin.Config['~standard'].vendor).toBe('agent-cordis-contract')
    expect(agentInstancesPlugin.Config['~standard'].version).toBe(1)
    for (const value of [undefined, null, {}, Object.create(null)]) {
      expect(validate(value), JSON.stringify(value) ?? 'undefined').toEqual({ value: {} })
    }
  })

  it('refuses every other value with one issue that has a message', () => {
    for (const value of [{ extra: 1 }, [], 'text', 3, true, () => undefined]) {
      const answer = validate(value)
      expect(answer.value, JSON.stringify(value) ?? 'function').toBeUndefined()
      expect(answer.issues, JSON.stringify(value) ?? 'function').toHaveLength(1)
      expect(answer.issues?.[0]?.message, JSON.stringify(value) ?? 'function').not.toBe('')
      expect(typeof answer.issues?.[0]?.message, JSON.stringify(value) ?? 'function').toBe('string')
    }
  })
})
