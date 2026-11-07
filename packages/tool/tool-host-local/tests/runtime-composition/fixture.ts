import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import { catalogSearch, catalogView } from '../catalog-view-fixture.ts'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { expect } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  type ToolConfiguration,
  type ToolLedgerStore,
  type LedgerWrite,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore, createMemoryToolMaterials } from '@omne-harness/tool/testing'
import type {
  ToolDelivery,
  ToolInvokeOutcome,
  ToolInvokeRequest,
  ToolInvocationRef,
  ToolResultReceiver,
  ToolsExecuteAnswer,
  ToolForwardIntent,
} from '@omne-harness/tool-contract'
import { resolveToolInvocationRef, toolsCapabilityOf } from '@omne-harness/tool-contract'
import {
  defineFunctionTool,
  defineCommandTool,
  defineToolOperation,
  type ToolBindings,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolExecutionContext,
} from '@omne-harness/tool-contract/provider'
import { createMemoryToolOutputCustody } from '@omne-harness/tool-contract/testing'
import {
  ToolClockService,
  ToolPublicationAuthorityService,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  originRef,
  type ExecutionEnvironment,
  type Placement,
} from '@omne-harness/execution-environment-contract'
import {
  createLocalToolRuntimePlugins,
  type LocalToolRuntimeInput,
} from '../../src/runtime-cordis.ts'
import { createRuntimeSourceAccess } from '../../src/runtime-composition.ts'
import { createLocalToolBindings } from '../../src/executor-binding.ts'
import { createLocalToolLoader } from '../../src/author-loader.ts'
import { createLocalToolBindingRegistry } from '../../src/bindings.ts'
import { createLocalToolCatalog } from '../../src/catalog.ts'
import { createLocalToolClock } from '../../src/clock.ts'
import type { ToolRequestAccess } from '@omne-harness/tool-host-local'
import { createLocalGrantVerifiers } from '../../src/grant-verifiers.ts'
import { createLocalInvocationSource } from '../../src/invocation-source.ts'
import type { ToolEnvironmentValue } from '../../src/author-environment.ts'
import type { LocalToolControlSubject } from '../../src/control-subject-adapter.ts'
import { adoption, evidence, request, tenantA, tenantB } from '../coordinator-values.ts'
import { createLocalToolForwarding } from '../../src/tool-forwarding.ts'
import { authorityFor } from '../binding-values.ts'

export function unbox<T>(answer: Outcome<T, unknown>): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
export const configuration: ToolConfiguration = {
  authorBufferBytes: 4096,
  authorBufferItems: 32,
  authorWaitHistoryBytes: 4096,
  authorWaitHistoryItems: 8,
  processBatchBytes: 4096,
  processBatchDelayMs: 0,
  observerBufferBytes: 65536,
  resultPageBytes: 4096,
  reconciliationDelayMs: 10,
  ledgerCommitAttempts: 8,
  queueCapacity: 32,
  driverRetryDelayMs: 10,
  driverStepsPerRun: 16,
}
export type Author = (
  args: string,
  environment: ToolEnvironmentValue,
  execution: ToolExecutionContext,
) => Promise<string>

/** Frozen external contracts. The in-memory store's declaration tests assembly, not durability. */
export async function fixture(
  author: Author = async value => `answer:${value}`,
  receiver?: ToolResultReceiver<unknown, ToolMessageContentBlock>,
  capacity = 32,
  enableForwarding = false,
  requestAccess?: ToolRequestAccess<unknown>,
  forwardingPreparation?: () => Promise<void>,
) {
  const root = new Context()
  const memory = createMemoryToolLedgerStore()
  const store: ToolLedgerStore = {
    durability: 'durable',
    read: memory.read,
    commit: memory.commit,
  }
  const custody = createMemoryToolOutputCustody<unknown>()
  const clock = createLocalToolClock()
  const deliveries: ToolDelivery<ToolMessageContentBlock>[] = []
  const signals = new Map<string, AbortSignal>()
  let launches = 0
  const forwarded: ToolsExecuteAnswer[] = []
  const forwardIntent: ToolForwardIntent = {
    name: 'read_file',
    command: null,
    arguments: {
      kind: 'object',
      entries: [{ key: 'value', value: { kind: 'string', value: 'forwarded' } }],
    },
  }

  let allowed = true
  let subjectRecoveryGate: Readonly<{
    entered: PromiseWithResolvers<void>
    released: PromiseWithResolvers<void>
  }> | null = null
  const principal = (tenant: typeof tenantA) =>
    canonicalDigest(tenant) === canonicalDigest(tenantA) ? 'alice' : 'bob'
  const subject = (value: unknown): LocalToolControlSubject => {
    if (value !== 'alice' && value !== 'bob') throw new TypeError('Unknown frozen principal.')
    return {
      kind: 'acting-for-tenant',
      tenant: value === 'alice' ? tenantA : tenantB,
      actor: { component: 'sessionWorkPrincipals' },
      work: { owner: 'session', work: `session-${value}` },
    }
  }
  const qualify = async (input: { principal: unknown; tenant: typeof tenantA }) =>
    allowed &&
    (canonicalDigest(input.tenant) === canonicalDigest(tenantA) ||
      canonicalDigest(input.tenant) === canonicalDigest(tenantB)) &&
    input.principal === principal(input.tenant)
      ? { kind: 'allowed' as const }
      : { kind: 'denied' as const, reason: 'fixture-denied' }
  const access = {
    guard: { qualify },
    start: { qualify },
    ...(requestAccess === undefined ? {} : { request: requestAccess }),
  }
  const sources = createLocalInvocationSource({
    store,
    ...(enableForwarding
      ? {
          forwarding: {
            authority: () => root.get('toolStartAuthority'),
            isParent: (request: import('@omne-harness/tool-contract').FixedToolRequest) =>
              request.availability.definition.adoption.name === 'Tools',
          },
        }
      : {}),
    commitAttempts: 8,
    authority: {
      qualify,
      samePrincipal: async input =>
        input.current === input.original
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
    principalCodec: {
      encode(value: unknown) {
        const identity = subject(value)
        return {
          kind: identity.kind,
          actor: { component: identity.actor.component },
          work: { owner: identity.work.owner, work: identity.work.work },
          tenant: {
            name: 'TenantId',
            organization: { name: 'OrganizationId', text: identity.tenant.organization.text },
            account: { name: 'AccountId', text: identity.tenant.account.text },
          },
        }
      },
      decode(value) {
        const stored: unknown = value
        if (
          typeof stored === 'object' &&
          stored !== null &&
          'work' in stored &&
          typeof stored.work === 'object' &&
          stored.work !== null &&
          'work' in stored.work
        ) {
          if (stored.work.work === 'session-alice') return succeed('alice')
          if (stored.work.work === 'session-bob') return succeed('bob')
        }
        return fail({ reason: 'not a fixture principal' })
      },
    },
  })
  let bindings: ToolBindings<unknown, ToolEnvironmentValue> | undefined
  const authority = authorityFor({ kind: 'official' }, 'read_file')
  const toolsAuthority = authorityFor({ kind: 'official' }, 'Tools')
  const verifier = {
    verify: (value: typeof authority) =>
      [authority, toolsAuthority].some(known => canonicalDigest(known) === canonicalDigest(value))
        ? succeed(value)
        : fail({ kind: 'denied' as const }),
    admits: () => succeed(undefined),
  }
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
        }),
    },
  })
  const fixed = request()
  if (fixed.availability.definition.kind !== 'function')
    throw new Error('Expected function fixture.')
  const parameters = fixed.availability.definition.parameters
  const moduleFor = (
    forwarding = false,
  ): ToolImplementationModule<ToolEnvironmentValue, ToolMessageContentBlock> => ({
    executor: adoption('runtime-test-executor'),
    createAuthor() {
      const operation = defineToolOperation<
        string,
        string,
        ToolEnvironmentValue,
        ToolMessageContentBlock,
        { kind: 'declared'; value: typeof parameters }
      >({
        parameters: { kind: 'declared', value: parameters },
        returns: ordinaryReturnFixture(adoption('output')),
        author: {
          kind: 'ordinary',
          parameters: { adoption: adoption('arguments'), parse: input => succeed(input.effective) },
          waits: [],
          executor: {
            async execute(args, environment, context) {
              if (forwarding) {
                const capability = toolsCapabilityOf(context)
                if (capability === undefined) throw new Error('No forwarding attachment')
                const answer = await capability.execute(forwardIntent)
                forwarded.push(answer)
                return JSON.stringify(answer)
              }
              launches += 1
              signals.set(args, context.signal)
              return author(args, environment, context)
            },
          },
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
          program: { kind: 'none' },
        },
      })
      if ('failure' in operation) return operation
      if (forwarding)
        return defineCommandTool({
          encoding: 'wrapped',
          commands: { execute: { summary: 'Forward one target', operation: operation.ok } },
          implementation: {
            description: 'Forwarding fixture',
            backgroundAllowed: false,
            declarations: fixed.availability.definition.declarations,
          },
        })
      return defineFunctionTool({
        operation: operation.ok,
        implementation: {
          description: 'Executable composition fixture',
          backgroundAllowed: false,
          declarations: fixed.availability.definition.declarations,
        },
      })
    },
  })
  const module = moduleFor()
  const loader = createLocalToolLoader<unknown, ToolEnvironmentValue, ToolMessageContentBlock>({
    authority,
    verifier,
    settings: async () => succeed({ kind: 'object', entries: [] }),
    schemas: async () => succeed(undefined),
  })
  const loaded = unbox(
    await loader.load({
      principal: 'alice',
      tenant: tenantA,
      asset: { asset: authority.asset, requiredCapabilities: [] },
      settings: fixed.settings,
      module,
      services: {},
    }),
  )
  const toolsLoader = createLocalToolLoader<unknown, ToolEnvironmentValue, ToolMessageContentBlock>(
    {
      authority: toolsAuthority,
      verifier,
      settings: async () => succeed({ kind: 'object', entries: [] }),
      schemas: async () => succeed(undefined),
    },
  )
  const toolsLoaded = enableForwarding
    ? unbox(
        await toolsLoader.load({
          principal: 'alice',
          tenant: tenantA,
          asset: { asset: toolsAuthority.asset, requiredCapabilities: [] },
          settings: fixed.settings,
          module: moduleFor(true),
          services: {},
        }),
      )
    : null
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
    recoverOwned: async () => ({ kind: 'unknown', cause: 'provider' }),
    releaseScope: async () => ({ kind: 'unknown', cause: 'provider' }),
  }
  const input: LocalToolRuntimeInput = {
    store,
    materials: createMemoryToolMaterials(),
    content: null,
    sources,
    access,
    clock,
    configuration,
    guardsOf: () => [],
    permitRequirements: {
      check: async () => ({ kind: 'not-required', source: evidence('frozen-no-permit-action') }),
    },
    grants: createLocalGrantVerifiers(fixed.scope),
    bindings: () => bindings,
    catalog: () => catalog,
    subjects: {
      async project(value) {
        try {
          return succeed(subject(value))
        } catch {
          return fail({ kind: 'denied', action: 'project' })
        }
      },
      async resolveSessionWork(value) {
        if (subjectRecoveryGate !== null) {
          subjectRecoveryGate.entered.resolve()
          await subjectRecoveryGate.released.promise
        }
        const name =
          value.session === 'session-alice'
            ? 'alice'
            : value.session === 'session-bob'
              ? 'bob'
              : null
        return name !== null &&
          canonicalDigest(subject(name).tenant) === canonicalDigest(value.tenant)
          ? succeed(name)
          : fail({ kind: 'denied', action: 'resolve-session-work' })
      },
    },
    capacity,
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
      guarded: {
        commit: async value => {
          const call = await store.read(value.call)
          if (call.kind !== 'complete')
            return { kind: 'unavailable', diagnostic: 'fixture read failure' }
          const writes: LedgerWrite[] = []
          for (const write of value.hostCommit.writes) {
            if (write.kind === 'delete') writes.push(write)
            else if (write.record.kind === 'host')
              writes.push({ kind: 'put', record: write.record })
            else
              return {
                kind: 'unavailable',
                diagnostic: 'the frozen host commit accepts only host records',
              }
          }
          return call.revision === value.callExpected
            ? store.commit({ ...value.hostCommit, writes })
            : { kind: 'call-changed' }
        },
      },
      plan: {
        requirement: async () => succeed(placement.requirement),
        binding: async value =>
          succeed({
            origin: originRef('fixture'),
            scope: value.preparation.request.requesterScope,
          }),
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
  const records = root.plugin(plugins.records)
  const host = root.plugin(plugins.instanceHost)
  const directory = root.plugin(plugins.instances)
  const environments = root.plugin(plugins.environments)
  const executor = root.plugin(plugins.executor)
  const runtime = root.plugin(plugins.runtime)
  await Promise.all([external, records, host, directory, environments, executor, runtime])
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
    prepareTarget: async parent => {
      await forwardingPreparation?.()
      return succeed({
        ...invocation('forwarded').request,
        scope: parent.request.scope,
        requesterScope: parent.request.requesterScope,
        context: parent.request.context,
        workspace: parent.request.workspace,
        resources: parent.request.resources,
        mode: parent.request.mode,
        limits: parent.request.limits,
      })
    },
    reader: () => undefined,
    attemptMs: 250,
  })
  bindings = createLocalToolBindings({
    registry,
    catalog,
    authority: root.toolStartAuthority,
    ...plugins.authorExecution,
    ...(enableForwarding ? { capability: forwarding.bind } : {}),
  })
  authorFiber = root.plugin({
    name: 'runtime-test-author',
    apply(ctx: Context) {
      authorFiber = ctx.fiber
      const contribution = unbox(
        registry.register({ principal: 'alice', tenant: tenantA, authority, loaded }),
      )
      ctx.effect(() => () => contribution.release())
      if (toolsLoaded !== null) {
        const tools = unbox(
          registry.register({
            principal: 'alice',
            tenant: tenantA,
            authority: toolsAuthority,
            loaded: toolsLoaded,
          }),
        )
        ctx.effect(() => () => tools.release())
      }
    },
  })
  await authorFiber
  const defaultReceiver: ToolResultReceiver<unknown, ToolMessageContentBlock> = {
    async push(value) {
      deliveries.push(structuredClone(value.delivery))
      return succeed({
        kind: 'saved',
        key: value.delivery.key,
        evidence: { ...evidence('saved'), owner: value.delivery.consumer.owner },
      })
    },
  }
  const receive = () =>
    root.plugin({
      name: `consumer-${deliveries.length}`,
      inject: ['toolRuntime'],
      apply(ctx: Context) {
        ctx.toolRuntime.registerResultReceiver('consumer', receiver ?? defaultReceiver)
      },
    })
  let consumer = receive()
  await consumer
  const api = root.toolRuntime
  function invocation(value: string, tenant = tenantA): Parameters<typeof api.invoke>[0] {
    const { invocation: _invocation, ...base } = fixed
    const request: ToolInvokeRequest = {
      ...base,
      availability: {
        kind: 'available',
        layer: loaded.key.layer,
        definition: loaded.definition,
        executor: loaded.executor,
      },
      consumer: { ...fixed.consumer, position: value },
      limits: { ...fixed.limits, concurrency: 8 },
      arguments: {
        original: JSON.stringify({ value }),
        effective: JSON.stringify({ value }),
        complete: true,
      },
    }
    return { principal: principal(tenant), tenant, request }
  }
  const query = (reference: ToolInvocationRef, tenant = tenantA) => ({
    tenant,
    principal: principal(tenant),
    reference,
  })
  const streamQuery = (reference: ToolInvocationRef, tenant = tenantA) => ({
    access: { tenant, principal: principal(tenant) },
    reference,
  })
  const snapshot = async (reference: ToolInvocationRef, tenant = tenantA) => {
    const parts = unbox(resolveToolInvocationRef(reference, tenant))
    const recovery = await root.toolCommands.loadRecovery({
      tenant,
      principal: principal(tenant),
      call: parts.call,
    })
    const source =
      subjectRecoveryGate === null
        ? await createRuntimeSourceAccess({ store, sources, access, recovery: input.subjects })({
            tenant,
            call: parts.call,
          })
        : null
    return {
      runtime: plugins.diagnostics(),
      source:
        source === null ? 'held-by-fixture' : 'failure' in source ? source.failure : 'resolved',
      recovery:
        'failure' in recovery
          ? recovery.failure
          : {
              phase: recovery.ok.state.phase,
              execution: recovery.ok.state.execution,
              tasks: recovery.ok.tasks.map(task => ({
                kind: task.kind,
                state: 'state' in task ? task.state : null,
              })),
            },
    }
  }
  async function settled(reference: ToolInvocationRef, tenant = tenantA) {
    try {
      await expect
        .poll(
          async () => {
            const found = unbox(await api.queries.lookup(query(reference, tenant)))
            return found.kind === 'found' ? found.state.phase : found.kind
          },
          { timeout: 2000 },
        )
        .toBe('settled')
    } catch (cause) {
      throw new Error(
        `The call did not settle: ${JSON.stringify(await snapshot(reference, tenant))}`,
        { cause },
      )
    }
    const found = unbox(await api.queries.lookup(query(reference, tenant)))
    if (found.kind !== 'found' || found.state.phase !== 'settled')
      throw new Error('Missing settlement')
    return unbox(
      await api.queries.readResult({
        ...query(reference, tenant),
        result: found.state.result,
        after: null,
      }),
    )
  }
  return {
    root,
    input,
    plugins,
    api,
    directory,
    environments,
    executor,
    custody,
    store,
    deliveries,
    signals,
    launches: () => launches,
    forwarded,
    forwarding,
    forwardInvocation(value: string) {
      if (toolsLoaded === null) throw new Error('Forwarding fixture is disabled')
      const base = invocation(value)
      const text = JSON.stringify({
        command: 'execute',
        params: { name: 'read_file', command: null, arguments: { value: 'forwarded' } },
      })
      return {
        ...base,
        request: {
          ...base.request,
          command: 'execute',
          arguments: { original: text, effective: text, complete: true },
          availability: {
            kind: 'available' as const,
            layer: toolsLoaded.key.layer,
            definition: toolsLoaded.definition,
            executor: toolsLoaded.executor,
          },
          limits: { ...base.request.limits, concurrency: 1 },
        },
      }
    },
    invocation,
    query,
    streamQuery,
    snapshot,
    settled,
    async authorLookup(reference: ToolInvocationRef) {
      const { call } = unbox(resolveToolInvocationRef(reference, tenantA))
      const access = { tenant: tenantA, principal: principal(tenantA), call }
      const recovery = unbox(await root.toolCommands.loadRecovery(access))
      if (recovery.start === null) throw new Error('Missing author start')
      const binding = unbox(await bindings.recover({ ...access, start: recovery.start }))
      return unbox(await binding.inspectStart(recovery.start))
    },
    tenantA,
    tenantB,
    revoke: () => {
      allowed = false
    },
    holdSubjectRecovery() {
      subjectRecoveryGate = {
        entered: Promise.withResolvers<void>(),
        released: Promise.withResolvers<void>(),
      }
      return {
        entered: subjectRecoveryGate.entered.promise,
        release: subjectRecoveryGate.released.resolve,
      }
    },
    removeReceiver: () => consumer.dispose(),
    restoreReceiver: async () => {
      consumer = receive()
      await consumer
    },
    async newExecutor() {
      const nextRoot = new Context()
      const next = createLocalToolRuntimePlugins(input)
      const external = nextRoot.plugin({
        name: 'frozen-reopened-external',
        apply(ctx: Context) {
          new Clock(ctx)
          new PublicationAuthority(ctx)
          ctx.provide('executionEnvironment', execution)
        },
      })
      await Promise.all([
        external,
        nextRoot.plugin(next.records),
        nextRoot.plugin(next.instanceHost),
        nextRoot.plugin(next.instances),
        nextRoot.plugin(next.environments),
        nextRoot.plugin(next.executor),
        nextRoot.plugin(next.runtime),
      ])
      return {
        api: nextRoot.toolRuntime,
        plugins: next,
        schedule: (wake: Parameters<typeof nextRoot.toolInstanceHost.schedule>[0]) =>
          nextRoot.toolInstanceHost.schedule(wake),
        close: async () => {
          await next.close()
          await nextRoot.fiber.dispose()
        },
      }
    },
    close: async () => {
      await forwarding.close()
      await plugins.close()
      await root.fiber.dispose()
    },
  }
}

export function accepted(answer: ToolInvokeOutcome) {
  if (answer.kind !== 'accepted') throw new Error(JSON.stringify(answer))
  return answer.reference
}
