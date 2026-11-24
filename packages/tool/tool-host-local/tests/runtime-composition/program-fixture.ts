import { Context, type Fiber } from '@deepseek-ai/cordis'
import { expect } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import { canonicalDigest, type ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolBodies, createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  programToolsOf,
  resolveToolInvocationRef,
  toolsCapabilityOf,
  type ToolForwardIntent,
  type FixedToolRequest,
  type ProgramTools,
  type ToolInvocationRef,
  type ToolInvokeRequest,
  type ToolProgramAccess,
  type ToolReturnDeclaration,
} from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  programFunctions,
  toolAvailabilityReference,
  toolInvokeRequestOf,
  type NestedAdmission,
  type NestedAdmissionInput,
  type ProgramActionAdmission,
  type ToolBindings,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import {
  ToolClockService,
  ToolPublicationAuthorityService,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  originRef,
  type ExecutionEnvironment,
  type Placement,
} from '@omne-harness/execution-environment-contract'
import { createLocalToolLoader } from '../../src/author-loader.ts'
import type { ToolEnvironmentValue } from '../../src/author-environment.ts'
import { createLocalToolBindingRegistry } from '../../src/bindings.ts'
import { createLocalToolCatalog } from '../../src/catalog.ts'
import { createLocalToolClock } from '../../src/clock.ts'
import type { LocalToolControlSubject } from '../../src/control-subject-adapter.ts'
import { createLocalToolBindings } from '../../src/executor-binding.ts'
import { createLocalGrantVerifiers } from '../../src/grant-verifiers.ts'
import { createLocalInvocationSource } from '../../src/invocation-source.ts'
import { createLocalArgumentsCheck, createLocalProgramCalls } from '../../src/program-calls.ts'
import { createLocalToolForwarding } from '../../src/tool-forwarding.ts'
import {
  createLocalToolRuntimePlugins,
  type LocalToolRuntimeInput,
} from '../../src/runtime-cordis.ts'
import { authorityFor } from '../binding-values.ts'
import { catalogSearch, catalogView } from '../catalog-view-fixture.ts'
import { adoption, evidence, request, tenantA } from '../coordinator-values.ts'
import { accepted, configuration, unbox } from './fixture.ts'

/** What stands in for a program: it drives the capability the way an executor of programs would. */
export type Script = (tools: ProgramTools, input: string) => Promise<string>
export type Said = Readonly<{ text: string; hold?: string; fail?: boolean; mute?: boolean }>
export type ProgramWorldOptions = Readonly<{
  script: Script
  /** `null` leaves the admission of nested actions absent. */
  admission?: ((asked: NestedAdmissionInput<unknown>) => Promise<NestedAdmission>) | null
  /** `false`: the stand-in returns as soon as its script does, without asking for the table. */
  settle?: boolean
}>

const OPEN: ToolProgramAccess = { kind: 'open', unless: [] }
const CLOSED: ToolProgramAccess = { kind: 'closed' }
const SAID = { type: 'object', required: ['said'], properties: { said: { type: 'string' } } }
const SAID_TREE: JsonValue = {
  kind: 'object',
  entries: [
    { key: 'type', value: { kind: 'string', value: 'object' } },
    { key: 'required', value: { kind: 'array', items: [{ kind: 'string', value: 'said' }] } },
  ],
}
const saidIdentity = { id: 'fixture-said', revision: '1', digest: canonicalDigest(SAID) }

function jsonOf(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(jsonOf) }
  return {
    kind: 'object',
    entries: Object.entries(Object(value)).map(([key, member]) => ({ key, value: jsonOf(member) })),
  }
}

function plain(value: JsonValue): unknown {
  if (value.kind === 'object')
    return Object.fromEntries(value.entries.map(entry => [entry.key, plain(entry.value)]))
  if (value.kind === 'array') return value.items.map(plain)
  if (value.kind === 'number') return Number(value.lexeme)
  return value.kind === 'null' ? null : value.value
}

export { jsonOf }

export async function programWorld(options: ProgramWorldOptions) {
  const root = new Context()
  const memory = createMemoryToolLedgerStore()
  const store: ToolLedgerStore = { ...memory, durability: 'durable' }
  const clock = createLocalToolClock()
  const principal = 'alice'
  const subject: LocalToolControlSubject = {
    kind: 'acting-for-tenant',
    tenant: tenantA,
    actor: { component: 'sessionWorkPrincipals' },
    work: { owner: 'session', work: 'session-alice' },
  }
  const qualify = async (input: { principal: unknown }) =>
    input.principal === principal
      ? { kind: 'allowed' as const }
      : { kind: 'denied' as const, reason: 'fixture-denied' }
  const access = { guard: { qualify }, start: { qualify } }
  const fixed = request()
  if (fixed.availability.definition.kind !== 'function') throw new Error('function fixture')
  const { parameters, declarations } = fixed.availability.definition

  const said: string[] = []
  const gates = new Map<string, PromiseWithResolvers<void>>()
  const gate = (name: string) => {
    const known = gates.get(name) ?? Promise.withResolvers<void>()
    gates.set(name, known)
    return known
  }
  const asked: NestedAdmissionInput<unknown>[] = []
  const answers = new Map<string, string>()

  type Run = (text: string, context: ToolExecutionContext) => Promise<string>
  const operationOf = (run: Run, returns: ToolReturnDeclaration, structured: boolean) =>
    unbox(
      defineToolOperation<
        string,
        string,
        ToolEnvironmentValue,
        ToolMessageContentBlock,
        { kind: 'declared'; value: typeof parameters }
      >({
        parameters: { kind: 'declared', value: parameters },
        returns: returns as Extract<ToolReturnDeclaration, { kind: 'ordinary' }>,
        author: {
          kind: 'ordinary',
          parameters: {
            adoption: adoption('arguments'),
            parse: input => {
              if (!structured) return succeed(input.effective)
              const value: unknown = JSON.parse(input.effective)
              return typeof Reflect.get(Object(value), 'text') === 'string'
                ? succeed(input.effective)
                : fail({ kind: 'invalid', reason: 'text: a string is required' })
            },
          },
          waits: [],
          executor: { execute: (args, _environment, context) => run(args, context) },
          codec: {
            adoption: adoption('output'),
            encode: value =>
              typeof value === 'string'
                ? succeed(new TextEncoder().encode(value))
                : fail({ reason: 'not text' }),
            decode: bytes => succeed(new TextDecoder().decode(bytes)),
          },
          output: {
            adoption: adoption('output-check'),
            check: ({ value }) =>
              typeof value === 'string' ? succeed(value) : fail({ reason: 'not text' }),
          },
          renderer: { render: value => succeed(value) },
          program:
            returns.program.kind === 'json'
              ? {
                  kind: 'json',
                  adoption: returns.program.contract,
                  schema: {
                    identity: saidIdentity,
                    maxBytes: 65_536,
                    ref: defineSchema<unknown>({
                      id: saidIdentity.id,
                      load: async () =>
                        jsonSchemaDefinition<unknown>({
                          document: SAID,
                          numbers: 'exact-or-reject',
                        }),
                    }),
                  },
                  encode: value =>
                    succeed(
                      value.startsWith('mute:')
                        ? null
                        : {
                            kind: 'object',
                            entries: [{ key: 'said', value: { kind: 'string', value } }],
                          },
                    ),
                }
              : { kind: 'none' },
        },
      }),
    )
  const text = ordinaryReturnFixture(adoption('output'))
  const data: ToolReturnDeclaration = {
    ...text,
    program: {
      kind: 'json',
      contract: adoption('program-data'),
      schema: saidIdentity,
      definition: { schema: SAID_TREE, vocabulary: adoption('json-schema'), descriptions: [] },
      maxBytes: 65_536,
      external: true,
    },
  }
  const say: Run = async (args, context) => {
    const given = JSON.parse(args) as Said
    said.push(given.text)
    if (given.hold !== undefined)
      await Promise.race([
        gate(given.hold).promise,
        new Promise<void>(resolve =>
          context.signal.addEventListener('abort', () => resolve(), { once: true }),
        ),
      ])
    if (given.fail === true) throw new Error(`cannot say ${given.text}`)
    return given.mute === true ? `mute:${given.text}` : given.text
  }
  const run: Run = async (args, context) => {
    const tools = programToolsOf(context)
    if (tools === undefined) throw new Error('No program calls on this call')
    const output = await options.script(tools, (JSON.parse(args) as { value: string }).value)
    if (options.settle === false) return JSON.stringify({ output })
    const table = await tools.settle()
    return JSON.stringify({ output, table: 'ok' in table ? table.ok : table.failure })
  }
  /** Stands in for `Tools`: it hands the target its own arguments name on to the forwarding capability. */
  const relay: Run = async (args, context) => {
    const capability = toolsCapabilityOf(context)
    if (capability === undefined) throw new Error('No forwarding on this call')
    const { name, command, arguments: given } = JSON.parse(args) as Record<string, unknown>
    const intent = { name, command, arguments: jsonOf(given) } as ToolForwardIntent
    const answer = await capability.execute(intent)
    return JSON.stringify({
      kind: answer.kind,
      failure: 'failure' in answer ? answer.failure.kind : null,
    })
  }
  const implementation = { backgroundAllowed: false, declarations }
  const modules: Readonly<
    Record<string, ToolImplementationModule<ToolEnvironmentValue, ToolMessageContentBlock>>
  > = {
    Runner: {
      executor: adoption('runtime-test-executor'),
      createAuthor: () =>
        defineCommandTool({
          encoding: 'wrapped',
          commands: {
            execute: { summary: 'Run one script', operation: operationOf(run, text, false) },
          },
          implementation: { ...implementation, description: 'Runs a stand-in for a program' },
        }),
    },
    Echo: {
      executor: adoption('runtime-test-executor'),
      createAuthor: () =>
        defineCommandTool({
          encoding: 'wrapped',
          commands: {
            say: { summary: 'Say it', operation: operationOf(say, data, true), program: OPEN },
            shout: {
              summary: 'Say it loud',
              operation: operationOf(say, data, true),
              program: { kind: 'open', unless: ['hold'] },
            },
            hush: {
              summary: 'Say nothing',
              operation: operationOf(say, text, true),
              program: CLOSED,
            },
          },
          implementation: { ...implementation, description: 'Says what it is given' },
        }),
    },
    Relay: {
      executor: adoption('runtime-test-executor'),
      createAuthor: () =>
        defineCommandTool({
          encoding: 'wrapped',
          commands: {
            execute: {
              summary: 'Forward one target',
              operation: operationOf(relay, data, false),
              program: OPEN,
            },
          },
          implementation: { ...implementation, description: 'Forwards like Tools' },
        }),
    },
    Plain: {
      executor: adoption('runtime-test-executor'),
      createAuthor: () =>
        defineFunctionTool({
          operation: operationOf(say, text, true),
          implementation: { ...implementation, description: 'Closed to programs' },
        }),
    },
  }
  const authorities = Object.keys(modules).map(name => authorityFor({ kind: 'official' }, name))
  const verifier = {
    verify: (value: (typeof authorities)[number]) =>
      authorities.some(known => canonicalDigest(known) === canonicalDigest(value))
        ? succeed(value)
        : fail({ kind: 'denied' as const }),
    admits: () => succeed(undefined),
  }
  const loadedOf = async (authority: (typeof authorities)[number]) => {
    const loader = createLocalToolLoader<unknown, ToolEnvironmentValue, ToolMessageContentBlock>({
      authority,
      verifier,
      settings: async () => succeed({ kind: 'object', entries: [] }),
      schemas: async () => succeed(undefined),
    })
    const loaded = unbox(
      await loader.load({
        principal,
        tenant: tenantA,
        asset: { asset: authority.asset, requiredCapabilities: [] },
        settings: fixed.settings,
        module: modules[authority.asset.name]!,
        services: {},
      }),
    )
    return ['Echo', 'Relay'].includes(authority.asset.name)
      ? { ...loaded, definition: { ...loaded.definition, programmable: true } }
      : loaded
  }
  const loaded = await Promise.all(authorities.map(loadedOf))
  const byName = (name: string) => loaded.find(one => one.definition.name === name)

  let children: ReturnType<typeof createLocalToolRuntimePlugins>['children'] = () => undefined
  const sources = createLocalInvocationSource({
    store,
    programs: {
      authority: () => root.get('toolStartAuthority'),
      isParent: (parent: FixedToolRequest) => parent.availability.definition.name === 'Runner',
      children: () => children(),
    },
    forwarding: {
      authority: () => root.get('toolStartAuthority'),
      isParent: (parent: FixedToolRequest) => parent.availability.definition.name === 'Relay',
    },
    commitAttempts: 8,
    definitions: { current: async ({ name }) => succeed(byName(name)?.definition ?? null) },
    authority: {
      qualify,
      samePrincipal: async input =>
        input.current === input.original
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
    principalCodec: {
      encode: () => ({
        kind: subject.kind,
        actor: { component: subject.actor.component },
        work: { owner: subject.work.owner, work: subject.work.work },
        tenant: {
          name: 'TenantId',
          organization: { name: 'OrganizationId', text: tenantA.organization.text },
          account: { name: 'AccountId', text: tenantA.account.text },
        },
      }),
      decode: () => succeed(principal),
    },
  })
  let authorFiber: Fiber | null = null
  const registry = createLocalToolBindingRegistry<
    unknown,
    ToolEnvironmentValue,
    ToolMessageContentBlock
  >({ verifier, fiber: () => (authorFiber === null ? null : String(authorFiber.uid)) })
  const catalog = createLocalToolCatalog({
    registry,
    view: catalogView(registry),
    search: catalogSearch,
    availability: {
      judge: async () =>
        succeed({
          qualification: 'allowed',
          dependencies: [],
          inputCompatible: true,
          outputCompatible: true,
          attachmentsReadable: true,
          productsStorable: true,
        }),
    },
  })
  const placement: Placement = {
    kind: 'placement',
    binding: { kind: 'host_machine' },
    provider: { name: 'frozen-execution', version: '1', generation: '1' },
    quotaDomain: 'frozen',
    continuity: { kind: 'not_guaranteed' },
    requirement: { allowedBindings: [{ kind: 'host_machine' }], facilities: [], isolation: [] },
  }
  const execution: ExecutionEnvironment<unknown> = {
    resolvePlacement: async () => placement,
    acquire: async (_access, input) => ({
      kind: 'acquired',
      lease: {
        placement,
        instance: { id: String(input.acquisition), generation: '1' },
        continuity: placement.continuity,
        facility: () => undefined,
        release: async () => ({ kind: 'released' }),
        invalidated: new Promise(() => {}),
      },
      adoption: {
        acquisition: input.acquisition,
        origin: input.origin,
        placement,
        provider: placement.provider,
        instance: { id: String(input.acquisition), generation: '1' },
        continuity: placement.continuity,
        evidence: { kind: 'null' },
      },
    }),
    inspectAcquisition: async (_access, query) =>
      query.kind === 'original'
        ? { kind: 'original', status: 'allocated', original: query.original, adoption: null }
        : { kind: 'unrecorded' },
    inspectRecoveryAcquisition: async () => ({ kind: 'queryUnavailable', cause: 'provider' }),
    describe: async () => [],
    observeRetained: async () => [],
    recoverOwned: async () => ({ kind: 'unknown', cause: 'provider' }),
    releaseScope: async () => ({ kind: 'unknown', cause: 'provider' }),
    recoverResources: async () => ({ kind: 'unknown', cause: 'provider' }),
  }
  let bindings: ToolBindings<unknown, ToolEnvironmentValue> | undefined
  const input: LocalToolRuntimeInput = {
    store,
    bodies: createMemoryToolBodies(),
    content: null,
    sources,
    access,
    clock,
    configuration,
    recoveryRescanMs: 600,
    guardsOf: () => [],
    permitRequirements: {
      check: async () => ({ kind: 'not-required', source: evidence('frozen-no-permit-action') }),
    },
    grants: createLocalGrantVerifiers(fixed.scope),
    bindings: () => bindings,
    catalog: () => catalog,
    subjects: {
      project: async () => succeed(subject),
      resolveSessionWork: async () => succeed(principal),
    },
    capacity: 32,
    observersPerCall: 4,
    observerQueueFrames: 8,
    observerResidenceMs: 1000,
    environment: {
      adoption: adoption('runtime-environment'),
      naming: { name: async () => succeed({ token: 'frozen-object' }) },
      cleanup: {
        settle: async () =>
          succeed({ kind: 'pending', diagnostic: 'Frozen provider has no cold cleanup.' }),
      },
      plan: {
        requirement: async () => succeed(placement.requirement),
        binding: async value =>
          succeed({ origin: originRef('fixture'), scope: value.request.requesterScope }),
        guard: { authorize: async () => 'authorized' },
        facts: async () =>
          succeed({ system: 'frozen', release: '1', architecture: 'test', facilities: [] }),
        ledger: async () => ({
          closed: new AbortController().signal,
          plan: async () => 'recorded',
          permit: async () => 'confirmed',
          adopt: async () => 'confirmed',
          stopped: async () => 'recorded',
        }),
      },
    },
  }
  const plugins = createLocalToolRuntimePlugins(input)
  children = plugins.children
  class Clock extends ToolClockService {
    now = clock.now
    begin = clock.begin
    elapsed = clock.elapsed
    waitUntil = clock.waitUntil
  }
  class PublicationAuthority extends ToolPublicationAuthorityService<unknown> {
    check = () => succeed(undefined)
  }
  const external = root.plugin({
    name: 'frozen-external-providers',
    apply(ctx: Context) {
      new Clock(ctx)
      new PublicationAuthority(ctx)
      ctx.provide('executionEnvironment', execution)
    },
  })
  await Promise.all([
    external,
    root.plugin(plugins.records),
    root.plugin(plugins.instanceHost),
    root.plugin(plugins.instances),
    root.plugin(plugins.environments),
    root.plugin(plugins.executor),
    root.plugin(plugins.runtime),
  ])
  const invokeRequest = (
    name: string,
    command: string | null,
    params: unknown,
    position: string,
  ) => {
    const tool = byName(name)
    if (tool === undefined) return null
    const effective = JSON.stringify(command === null ? params : { command, params })
    const made: ToolInvokeRequest = {
      ...toolInvokeRequestOf(fixed),
      availability: toolAvailabilityReference({
        kind: 'available',
        layer: tool.key.layer,
        definition: tool.definition,
        executor: tool.executor,
      }),
      command,
      consumer: { ...fixed.consumer, position },
      limits: { ...fixed.limits, concurrency: 8 },
      arguments: { original: effective, effective, complete: true },
    }
    return made
  }
  const admission: ProgramActionAdmission<unknown> | undefined =
    options.admission === null
      ? undefined
      : {
          admit: async given => {
            asked.push(given)
            return (await options.admission?.(given)) ?? { kind: 'allowed' }
          },
        }
  const calls = createLocalProgramCalls<unknown>({
    source: () => sources.programs,
    runtime: plugins.programs,
    children: plugins.children,
    admission: () => admission,
    functions: async () => succeed(loaded.flatMap(one => programFunctions(one.definition))),
    prepareTarget: async (_parent, intent) => {
      const made = invokeRequest(intent.name, intent.command, plain(intent.arguments), 'program')
      return made === null
        ? fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' })
        : succeed(made)
    },
    checkArguments: createLocalArgumentsCheck(() => registry),
    retryMs: 5,
  })
  const forwarding = createLocalToolForwarding<unknown>({
    runtime: () => root.get('toolRuntime'),
    forwarding: plugins.forwarding,
    catalog: () => catalog,
    consumer: async () =>
      succeed({
        capabilities: evidence('profile'),
        conversion: null,
        attachmentAccess: evidence('attachments'),
      }),
    prepareTarget: async (_parent, intent) => {
      const made = invokeRequest(intent.name, intent.command, plain(intent.arguments), 'forwarded')
      return made === null
        ? fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' })
        : succeed(made)
    },
    reader: () => undefined,
    attemptMs: 250,
  })
  bindings = createLocalToolBindings({
    registry,
    catalog,
    authority: root.toolStartAuthority,
    ...plugins.authorExecution,
    capability: ({ start, ...parent }, scope) => {
      const { name } = parent.request.availability.definition
      if (start.kind !== 'start') return scope
      if (name === 'Relay') return forwarding.bind({ ...parent, start }, scope)
      return name === 'Runner' ? calls.bind({ ...parent, start }, scope) : scope
    },
  })
  authorFiber = root.plugin({
    name: 'runtime-test-author',
    apply(ctx: Context) {
      authorFiber = ctx.fiber
      for (const [index, one] of loaded.entries()) {
        const contribution = unbox(
          registry.register({
            principal,
            tenant: tenantA,
            authority: authorities[index]!,
            loaded: one,
          }),
        )
        ctx.effect(() => () => contribution.release())
      }
    },
  })
  await authorFiber
  await root.plugin({
    name: 'consumer',
    inject: ['toolRuntime'],
    apply(ctx: Context) {
      ctx.toolRuntime.registerResultReceiver('consumer', {
        async push(value) {
          if (value.delivery.kind === 'result') {
            const block = value.delivery.value.content[0]
            answers.set(value.delivery.key.reference, block?.kind === 'text' ? block.text : '')
          }
          return succeed({
            key: value.delivery.key,
            evidence: { ...evidence('saved'), owner: value.delivery.consumer.owner },
          })
        },
      })
    },
  })
  const api = root.toolRuntime
  const query = (reference: ToolInvocationRef) => ({ tenant: tenantA, principal, reference })
  const callOf = (reference: ToolInvocationRef) =>
    unbox(resolveToolInvocationRef(reference, tenantA)).call
  async function settled(reference: ToolInvocationRef) {
    await expect
      .poll(
        async () => {
          const found = unbox(await api.queries.lookup(query(reference)))
          return found.kind === 'found' ? found.state.phase : found.kind
        },
        { timeout: 3000 },
      )
      .toBe('settled')
    const found = unbox(await api.queries.lookup(query(reference)))
    if (found.kind !== 'found' || found.state.phase !== 'settled') throw new Error('not settled')
    return found.state
  }
  return {
    root,
    api,
    plugins,
    store,
    sources,
    said,
    asked,
    gate,
    principal,
    tenant: tenantA,
    query,
    callOf,
    settled,
    invokeRequest,
    /** Starts the stand-in program as one direct call and gives its reference. */
    async start(position: string, value = '') {
      const made = invokeRequest('Runner', 'execute', { value }, position)
      if (made === null) throw new Error('Runner is not loaded')
      return accepted(await api.invoke({ principal, tenant: tenantA, request: made }))
    },
    /** The text the stand-in program's call ended with, once its consumer has it. */
    async finished(reference: ToolInvocationRef) {
      await settled(reference)
      await expect.poll(() => answers.has(reference), { timeout: 3000 }).toBe(true)
      return answers.get(reference) ?? ''
    },
    /** Runs the stand-in program to its end: what it returned and the table it was given. */
    async run(position: string, value = '') {
      const reference = await this.start(position, value)
      const state = await settled(reference)
      return { reference, state, text: await this.finished(reference) }
    },
    table: async (reference: ToolInvocationRef) =>
      unbox(
        await plugins.children()!.table({ principal, tenant: tenantA, call: callOf(reference) }),
      ),
    close: async () => {
      for (const one of gates.values()) one.resolve()
      await forwarding.close()
      await plugins.close()
      await root.fiber.dispose()
    },
  }
}
