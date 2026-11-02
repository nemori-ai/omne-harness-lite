import { Context, type Fiber } from '@deepseek-ai/cordis'
import { expect } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolConfiguration, type ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type {
  ToolDelivery,
  ToolInvokeOutcome,
  ToolInvokeRequest,
  ToolInvocationRef,
  ToolResultReceiver,
} from '@omne-harness/tool-contract'
import {
  defineFunctionTool,
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
import { createLocalToolBindings } from '../../src/executor-binding.ts'
import { createLocalToolLoader } from '../../src/author-loader.ts'
import { createLocalToolBindingRegistry } from '../../src/bindings.ts'
import { createLocalToolCatalog } from '../../src/catalog.ts'
import { createLocalToolClock } from '../../src/clock.ts'
import { createLocalGrantVerifiers } from '../../src/grant-verifiers.ts'
import { createLocalInvocationSource } from '../../src/invocation-source.ts'
import type { ToolEnvironmentValue } from '../../src/author-environment.ts'
import { adoption, evidence, request, tenantA, tenantB } from '../coordinator-values.ts'
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
) {
  const root = new Context()
  const memory = createMemoryToolLedgerStore<ToolMessageContentBlock>()
  const store: ToolLedgerStore<ToolMessageContentBlock> = {
    durability: 'durable',
    read: memory.read,
    commit: memory.commit,
  }
  const custody = createMemoryToolOutputCustody<unknown>()
  const clock = createLocalToolClock()
  const deliveries: ToolDelivery<ToolMessageContentBlock>[] = []
  const signals = new Map<string, AbortSignal>()
  let launches = 0
  let allowed = true
  const principal = (tenant: typeof tenantA) =>
    canonicalDigest(tenant) === canonicalDigest(tenantA) ? 'alice' : 'bob'
  const qualify = async (input: { principal: unknown; tenant: typeof tenantA }) =>
    allowed &&
    (canonicalDigest(input.tenant) === canonicalDigest(tenantA) ||
      canonicalDigest(input.tenant) === canonicalDigest(tenantB)) &&
    input.principal === principal(input.tenant)
      ? { kind: 'allowed' as const }
      : { kind: 'denied' as const, reason: 'fixture-denied' }
  const access = { guard: { qualify }, start: { qualify } }
  const sources = createLocalInvocationSource({
    store,
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
        if (typeof value !== 'string') throw new TypeError('not a fixture principal')
        return value
      },
      decode(value) {
        return typeof value === 'string'
          ? succeed(value)
          : fail({ reason: 'not a fixture principal' })
      },
    },
  })
  let bindings: ToolBindings<unknown, ToolMessageContentBlock, ToolEnvironmentValue> | undefined
  const authority = authorityFor({ kind: 'official' }, 'read_file')
  const verifier = { verify: () => succeed(authority), admits: () => succeed(undefined) }
  let authorFiber: Fiber | null = null
  const registry = createLocalToolBindingRegistry<
    unknown,
    ToolEnvironmentValue,
    ToolMessageContentBlock
  >({ verifier, fiber: () => (authorFiber === null ? null : String(authorFiber.uid)) })
  const catalog = createLocalToolCatalog({
    registry,
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
  const module: ToolImplementationModule<ToolEnvironmentValue, ToolMessageContentBlock> = {
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
        returns: { kind: 'ordinary', program: { kind: 'none' } },
        author: {
          kind: 'ordinary',
          parameters: { adoption: adoption('arguments'), parse: input => succeed(input.effective) },
          waits: [],
          executor: {
            async execute(args, environment, context) {
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
      return defineFunctionTool({
        operation: operation.ok,
        implementation: {
          description: 'Executable composition fixture',
          backgroundAllowed: false,
          declarations: fixed.availability.definition.declarations,
        },
      })
    },
  }
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
    custody,
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
    resolveAccess: async value => succeed({ ...value, principal: principal(value.tenant) }),
    controlSubjects: {
      capture: async value => succeed(evidence(canonicalDigest([value.tenant, value.principal]))),
      matches: async value =>
        value.subject.record === canonicalDigest([value.tenant, value.principal])
          ? qualify(value)
          : { kind: 'denied', reason: 'wrong-controller' },
      qualify: async value =>
        value.subject.record === canonicalDigest([value.tenant, principal(value.tenant)])
          ? qualify({ ...value, principal: principal(value.tenant) })
          : { kind: 'denied', reason: 'wrong-controller' },
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
          return call.revision === value.callExpected
            ? store.commit(value.hostCommit)
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
  bindings = createLocalToolBindings({
    registry,
    catalog,
    authority: root.toolStartAuthority,
    ...plugins.authorExecution,
  })
  authorFiber = root.plugin({
    name: 'runtime-test-author',
    apply(ctx: Context) {
      authorFiber = ctx.fiber
      const contribution = unbox(
        registry.register({ principal: 'alice', tenant: tenantA, authority, loaded }),
      )
      ctx.effect(() => () => contribution.release())
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
    access: { tenant, principal: principal(tenant) },
    reference,
  })
  async function settled(reference: ToolInvocationRef, tenant = tenantA) {
    await expect
      .poll(
        async () => {
          const found = await api.queries.lookup(query(reference, tenant))
          return 'ok' in found && found.ok.kind === 'found' ? found.ok.state.phase : 'absent'
        },
        { timeout: 2000 },
      )
      .toBe('settled')
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
    invocation,
    query,
    settled,
    tenantA,
    tenantB,
    revoke: () => {
      allowed = false
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
        close: async () => {
          await next.close()
          await nextRoot.fiber.dispose()
        },
      }
    },
    close: async () => {
      await plugins.close()
      await root.fiber.dispose()
    },
  }
}

export function accepted(answer: ToolInvokeOutcome) {
  if (answer.kind !== 'accepted') throw new Error(JSON.stringify(answer))
  return answer.reference
}
