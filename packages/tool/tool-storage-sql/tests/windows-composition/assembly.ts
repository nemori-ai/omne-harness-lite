import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolConfiguration } from '@omne-harness/tool'
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createRetainedTerminalLedger,
  createLocalGrantVerifiers,
  createLocalInvocationSource,
  createLocalToolClock,
  createLocalToolMaterialClock,
  createLocalToolLoader,
} from '@omne-harness/tool-host-local'
import {
  createLocalToolRuntimePlugins,
  createLocalToolBindingsPlugin,
  createLocalToolHostPlugin,
  type LocalToolRuntimeInput,
} from '@omne-harness/tool-host-local/cordis'
import {
  ToolClockService,
  ToolContributionAuthorityService,
  ToolPublicationAuthorityService,
  ToolResidencyReaderService,
  type VerifiedAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  describedAdoption,
  decodeToolRevision,
  type ToolMessageContentBlock,
  type ToolAuthority,
} from '@omne-harness/tool-contract/provider'
import {
  decodeToolCallId,
  type ToolDelivery,
  type ToolInvokeRequest,
  type ToolResultReceiver,
} from '@omne-harness/tool-contract'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  createHostFilesDomain,
  createHostFilesProvider,
} from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  filesFacilityPlugin,
  commandFacilityPlugin,
  terminalFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import {
  ExecutionEnvironmentAuthorityService,
  ExecutionRecoveryAuthorityService,
  ExecutionScopeBindingService,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import {
  originRef,
  createRecoveryAccess,
  type ResourceLedger,
  type ManagedResource,
} from '@omne-harness/execution-environment-contract'
import { createAuthority, witnessStore } from './authority.ts'
import { createAuthors, type Environment } from './authors.ts'
import { createNegativeFixtureProvider } from './negative-fixture.ts'
import { openStorage } from './storage.ts'
import { createEnvironmentSchemaCheck } from './schema.ts'
import { evidence, failureDetails, until, value } from './helpers.ts'
import type {
  AcquisitionEvidence,
  CompletedInvocation,
  Invocation,
  WindowsAssembly,
} from './types.ts'

const RESULT_MAX_BYTES = 32768
const configuration: ToolConfiguration = {
  authorBufferBytes: 65536,
  authorBufferItems: 256,
  authorWaitHistoryBytes: 65536,
  authorWaitHistoryItems: 32,
  processBatchBytes: 65536,
  processBatchDelayMs: 0,
  observerBufferBytes: 262144,
  resultPageBytes: 65536,
  reconciliationDelayMs: 50,
  ledgerCommitAttempts: 16,
  queueCapacity: 64,
  driverRetryDelayMs: 50,
  driverStepsPerRun: 32,
  readResultArguments: {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 4096,
    maxMembers: 256,
    maxStringLength: 32_768,
    maxNumberLength: 64,
  },
  offloading: {
    maxInlineUtf8Bytes: 65_536,
    maxRetentionMs: 86_400_000,
    maxBodyBytes: 16_777_216,
    previewUtf8Bytes: 1_024,
    maxPageBytes: 65_536,
    maxPageLeaseMs: 30_000,
    maxWriterMetadataBytes: 1_048_576,
    jsonDocument: {
      maxBytes: 1_048_576,
      maxDepth: 64,
      maxItems: 65_536,
      maxMembers: 65_536,
      maxStringLength: 1_048_576,
      maxNumberLength: 64,
    },
    jsonRecord: {
      maxBytes: 65_536,
      maxDepth: 32,
      maxItems: 4096,
      maxMembers: 4096,
      maxStringLength: 65_536,
      maxNumberLength: 64,
    },
  },
}

async function cleanupStep<T>(failures: Error[], step: string, operation: () => T | Promise<T>) {
  try {
    return await operation()
  } catch (cause) {
    const error = new Error(`Cleanup failed: ${step}`, { cause })
    failures.push(error)
    return { kind: 'unconfirmed' as const, step, diagnostic: String(cause) }
  }
}

export async function openWindowsAssembly(evidenceDirectory: string): Promise<WindowsAssembly> {
  assert.equal(process.platform, 'win32', 'This runner requires the Windows host')
  const run = randomUUID()
  const workspace = resolve(evidenceDirectory, 'workspace')
  const outside = resolve(evidenceDirectory, 'outside')
  const stateDirectory = resolve(evidenceDirectory, 'native-state')
  await Promise.all(
    [workspace, outside, stateDirectory].map(path => mkdir(path, { recursive: true })),
  )
  await writeFile(join(evidenceDirectory, 'events.jsonl'), '', { flag: 'wx' })
  const fixedRoot = await realpath(workspace)
  let events = Promise.resolve()
  let sequence = 0
  const record = (event: string, facts: unknown) => {
    const row = {
      sequence: ++sequence,
      at: new Date().toISOString(),
      monotonicMs: performance.now(),
      event,
      facts,
    }
    events = events.then(() =>
      appendFile(join(evidenceDirectory, 'events.jsonl'), JSON.stringify(row) + '\n', 'utf8'),
    )
    return events
  }
  const authority = createAuthority(fixedRoot, run)
  const schemas = createEnvironmentSchemaCheck()
  const sql = await openStorage(resolve(evidenceDirectory, 'sql'), [
    authority.tenant,
    authority.foreignTenant,
  ])
  const root = new Context()
  const fiberFailures: unknown[] = []
  const fiberObservations: Promise<void>[] = []
  root.on('internal/status', fiber => {
    if (fiber.state !== 3) return
    const uid = fiber.uid
    fiberObservations.push(
      fiber.await().then(
        () => undefined,
        async cause => {
          fiberFailures.push(cause)
          await record('cordis-fiber-failed', { uid, failure: failureDetails(cause) })
        },
      ),
    )
  })
  let retireProvider: () => Promise<unknown> = async () => undefined
  let stopBundle: () => Promise<void> = async () => {}
  try {
    const witness = witnessStore(sql.store)
    const store = witness.store
    const state = createEnvironmentStateStore({
      store,
      guarded: sql.guarded,
      mode: 'production',
      commitAttempts: configuration.ledgerCommitAttempts,
    })
    const clock = createLocalToolClock()
    const executable = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    )
    const env = {
      SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
      WINDIR: process.env.SystemRoot ?? 'C:\\Windows',
      TEMP: stateDirectory,
      TMP: stateDirectory,
    }
    const authors = createAuthors(fixedRoot, executable, env, RESULT_MAX_BYTES)
    const sources = createLocalInvocationSource({
      store,
      authority: authority.sourceAuthority,
      principalCodec: authority.principalCodec,
      commitAttempts: configuration.ledgerCommitAttempts,
    })
    const domain = createHostFilesDomain({
      quotaDomain: `windows-e2-${run}`,
      quota: () => ({ perTenant: 32, global: 64 }),
    })
    const provider = createHostFilesProvider({
      domain,
      filesRoot: fixedRoot,
      stateDirectory,
      drainBoundMs: 20_000,
      command: {
        startBoundMs: 20_000,
        stopBoundMs: 15_000,
        graceMs: 500,
        maxBufferedBytes: 1_048_576,
        maxChunkBytes: 32768,
      },
      terminal: {
        startBoundMs: 20_000,
        stopBoundMs: 15_000,
        graceMs: 500,
        maxBufferedBytes: 1_048_576,
        maxChunkBytes: 32768,
        retainedCapacity: 8,
      },
      diagnose: diagnostic => {
        void record('provider-diagnostic', diagnostic)
      },
    })
    retireProvider = () => provider.retire()
    const negative = createNegativeFixtureProvider(provider)
    const recoveryAccess = createRecoveryAccess()
    const acquisitions: AcquisitionEvidence[] = []
    const origins = new Map<string, { call: string; preparation: string }>()
    const resources = new Map<
      string,
      { call: string; resource: ManagedResource; stopped: 'confirmed' | 'unconfirmed' | null }
    >()
    const ledgerViews = new Map<
      string,
      Promise<{
        regular: ResourceLedger
        retained: Awaited<ReturnType<typeof createRetainedTerminalLedger>>
      }>
    >()
    const currentAccess = async (call: string) => {
      const p = await authority.subjects.resolveSessionWork({
        tenant: authority.tenant,
        session: authority.session,
      })
      if ('failure' in p) return 'unavailable' as const
      const result = await authority.qualify({
        principal: p.ok,
        tenant: authority.tenant,
        call: value(decodeToolCallId(call)),
        action: 'write',
      })
      return result.kind === 'allowed'
        ? ('authorized' as const)
        : result.kind === 'denied'
          ? ('notAuthorized' as const)
          : ('unavailable' as const)
    }
    const track = <L extends Pick<ResourceLedger, 'closed' | 'plan' | 'permit' | 'stopped'>>(
      call: string,
      ledger: L,
    ): L => {
      const wrapped = {
        ...ledger,
        async plan(resource: ManagedResource) {
          const answer = await ledger.plan(resource)
          const key = canonicalDigest([call, resource.provider, resource.key])
          const old = resources.get(key)
          if (old) assert.equal(canonicalDigest(old.resource), canonicalDigest(resource))
          else resources.set(key, { call, resource: structuredClone(resource), stopped: null })
          await record('resource-plan', { call, resource, answer })
          return answer
        },
        async stopped(key: string, stopped: 'confirmed' | 'unconfirmed') {
          const answer = await ledger.stopped(key, stopped)
          if (answer === 'recorded')
            for (const row of resources.values())
              if (row.call === call && row.resource.key === key) row.stopped = stopped
          await record('resource-stop', { call, key, stopped, answer })
          return answer
        },
      }
      return wrapped
    }
    type Preparation = Parameters<LocalToolRuntimeInput['environment']['plan']['ledger']>[0]
    const ledgers = (request: Preparation) => {
      const key = canonicalDigest([request.tenant, request.call, request.preparation.operation])
      let found = ledgerViews.get(key)
      if (!found) {
        found = (async () => {
          const input = {
            state,
            address: request.preparation,
            authorize: () => currentAccess(request.call),
          }
          const regular = track(request.call, await createEnvironmentResourceLedger(input))
          const retained = track(
            request.call,
            await createRetainedTerminalLedger({ ...input, scope: authority.scope }),
          )
          return { regular, retained }
        })()
        ledgerViews.set(key, found)
      }
      return found
    }
    let readBindings: LocalToolRuntimeInput['bindings'] = () => undefined
    const scopeGrant = {
      owner: 'windows-composition',
      key: authority.session,
      grant: authority.evidence,
    }
    const bundle = createLocalToolRuntimePlugins({
      store,
      materials: {
        provider: sql.materialProvider,
        store: sql.materialStore,
        clock: createLocalToolMaterialClock({
          wallMs: () => Date.now(),
          monotonicMs: () => performance.now(),
        }),
      },
      content: null,
      sources,
      access: authority.access,
      subjects: authority.subjects,
      grants: createLocalGrantVerifiers(scopeGrant),
      guardsOf: () => [],
      permitRequirements: {
        check: async request =>
          'ok' in (await authority.project(request.principal)) &&
          ['Files', 'Shell'].includes(request.request.availability.definition.name)
            ? {
                kind: 'not-required',
                source: evidence(`no-permit:${request.call}`, request.request),
              }
            : {
                kind: 'unavailable',
                diagnostic: 'Outside the explicitly granted Windows test action',
              },
      },
      clock,
      configuration,
      bindings: () => readBindings(),
      catalog: () => root.get('toolCatalog'),
      capacity: 64,
      observersPerCall: 4,
      observerQueueFrames: 16,
      observerResidenceMs: 5000,
      environment: {
        adoption: describedAdoption({
          owner: 'windows-composition',
          name: 'real-host-environment',
          revision: '1',
        }),
        guarded: sql.guarded,
        naming: authority.naming,
        cleanup: {
          settle: async () =>
            succeed({
              kind: 'pending',
              diagnostic:
                'Cold Tool acquisition attach is not part of R60; original cleanup remains owned.',
            }),
        },
        plan: {
          requirement: async request => {
            const checked = await schemas.check(request.preparation.request.availability.definition)
            if ('failure' in checked) return checked
            if (!checked.ok.layers.includes('host_machine'))
              return fail({ kind: 'denied', action: 'windows-e2-placement' })
            return succeed({
              allowedBindings: [{ kind: 'host_machine' }],
              facilities: checked.ok.facilities,
              isolation: checked.ok.isolation,
            })
          },
          binding: async request => {
            const origin = originRef(`tool:${request.call}:${request.preparation.operation}`)
            authority.origin(origin, request.call)
            origins.set(origin, { call: request.call, preparation: request.preparation.operation })
            const view = await ledgers(request)
            return succeed({
              origin,
              scope: request.preparation.request.requesterScope,
              retention: { scope: authority.scope, ledger: view.retained },
            })
          },
          guard: authority.guard,
          ledger: async request => (await ledgers(request)).regular,
          facts: async placement => {
            const facts = await provider.describe()
            if (
              placement.provider.generation !== provider.generation ||
              facts.prerequisites !== 'satisfied'
            )
              return fail({
                kind: 'unavailable',
                dependency: 'windows-provider',
                diagnostic: JSON.stringify(facts),
              })
            return succeed({
              system: facts.platform.os,
              release: facts.platform.release,
              architecture: process.arch,
              facilities: facts.facilities,
            })
          },
        },
      },
    })
    stopBundle = bundle.close
    class Clock extends ToolClockService {
      now = clock.now
      begin = clock.begin
      elapsed = clock.elapsed
      waitUntil = clock.waitUntil
    }
    class Contribution extends ToolContributionAuthorityService<unknown> {
      readonly verify = (candidate: ToolAuthority) => {
        return authors.tool(candidate) && authority.active()
          ? succeed(candidate as VerifiedAuthority)
          : fail({ kind: 'denied' as const })
      }
      readonly admits = (access: { principal: unknown; tenant: typeof authority.tenant }) => {
        return authority.active() &&
          access.principal === authority.principal &&
          tenantEquals(access.tenant, authority.tenant)
          ? succeed(undefined)
          : fail({ kind: 'denied' as const })
      }
    }
    class Residency extends ToolResidencyReaderService {
      readonly referencing = async () => {
        return succeed({ items: [], next: null })
      }
    }
    class Publication extends ToolPublicationAuthorityService<unknown> {
      readonly check = (
        request: Parameters<ToolPublicationAuthorityService<unknown>['check']>[0],
      ): ReturnType<ToolPublicationAuthorityService<unknown>['check']> => {
        const [execution, handle] = request.publication
        return authority.active() &&
          tenantEquals(execution.tenant, authority.tenant) &&
          execution.instance === handle.instance &&
          execution.generation === handle.generation &&
          witness.check(execution, request.authority, [execution.tenant, execution.call])
          ? succeed(undefined)
          : fail({ kind: 'denied' })
      }
    }
    class EnvironmentAuthority extends ExecutionEnvironmentAuthorityService<unknown> {
      async authorize(
        access: Parameters<ExecutionEnvironmentAuthorityService<unknown>['authorize']>[0],
        action: Parameters<ExecutionEnvironmentAuthorityService<unknown>['authorize']>[1],
      ) {
        const checked = await authority.project(access.principal)
        const scope =
          'scope' in action
            ? action.scope
            : 'original' in action
              ? action.original.scope
              : authority.scope
        if (
          !('ok' in checked) ||
          !tenantEquals(access.tenant, authority.tenant) ||
          scope.ref !== authority.scope.ref
        )
          return { kind: 'refused' as const }
        if (action.kind === 'acquire') {
          const original = action.original
          const context = origins.get(original.origin)
          if (!context || !tenantEquals(original.tenant, authority.tenant))
            return { kind: 'refused' as const }
          const row = {
            ...context,
            origin: original.origin,
            acquisition: original.acquisition,
            sessionScope: original.scope.ref,
          }
          const previous = acquisitions.find(item => item.acquisition === original.acquisition)
          if (previous) assert.deepEqual(previous, row)
          else acquisitions.push(row)
          await record('environment-acquire-authorized', row)
        }
        return {
          kind: 'authorized' as const,
          principal: access.principal,
          current: authority.active,
        }
      }
    }
    class ScopeBindings extends ExecutionScopeBindingService {
      async lookup(scope: typeof authority.scope) {
        return scope.ref === authority.scope.ref
          ? { kind: 'bound' as const, tenant: authority.tenant }
          : { kind: 'unavailable' as const }
      }
    }
    class Recovery extends ExecutionRecoveryAuthorityService {
      async authorizeRecovery(access: typeof recoveryAccess, scope: typeof authority.scope) {
        return access === recoveryAccess && scope.ref === authority.scope.ref
          ? ('authorized' as const)
          : ('notAuthorized' as const)
      }
    }
    await root.plugin({
      name: 'windows-e2-authorities',
      apply(ctx: Context) {
        new Clock(ctx)
        new Contribution(ctx)
        new Residency(ctx)
        new Publication(ctx)
        new EnvironmentAuthority(ctx)
        new ScopeBindings(ctx)
        new Recovery(ctx)
      },
    })
    await root.plugin(ExecutionEnvironmentRegistry)
    await Promise.all([
      root.plugin(filesFacilityPlugin),
      root.plugin(commandFacilityPlugin),
      root.plugin(terminalFacilityPlugin),
    ])
    await root.plugin({
      name: 'real-windows-provider',
      inject: { executionEnvironment: { caller: 'provider' as const } },
      apply(ctx: Context) {
        // The negative fixture forwards to this same provider; it only narrows the lease a real
        // acquisition hands back, so every positive case keeps the real facilities.
        return ctx.executionEnvironment.registerProvider(negative.provider)
      },
    })
    const prerequisites = await provider.describe()
    await record('provider-ready', prerequisites)
    assert.equal(prerequisites.prerequisites, 'satisfied', JSON.stringify(prerequisites))
    await Promise.all([
      root.plugin(bundle.records),
      root.plugin(bundle.instanceHost),
      root.plugin(bundle.instances),
      root.plugin(bundle.environments),
      root.plugin(bundle.executor),
      root.plugin(bundle.runtime),
    ])
    const verifier = root.toolContributionAuthority
    const Bindings = createLocalToolBindingsPlugin<unknown, Environment, ToolMessageContentBlock>({
      authority: root.toolStartAuthority,
      view: {
        async read(access) {
          if (
            !tenantEquals(access.tenant, authority.tenant) ||
            'failure' in (await authority.project(access.principal))
          )
            return fail({ kind: 'denied', action: 'catalog-view' })
          return succeed({
            scope: evidence('windows-catalog-scope', authority.tenant),
            revision: '1',
            entries: Object.values(authors.authorities).map(({ layer, asset }) => ({
              key: { layer, asset },
              resident: true,
            })),
          })
        },
      },
      search: { k1: 1.2, b: 0.75, maxCachedCorpora: 2 },
      availability: {
        judge: async input => {
          if ('failure' in (await authority.project(input.principal)))
            return fail({ kind: 'denied', action: 'inspect' })
          const facts = await provider.describe()
          return succeed({
            qualification: 'allowed',
            dependencies: [
              { name: 'windows-host', available: facts.prerequisites === 'satisfied' },
            ],
            inputCompatible: true,
            outputCompatible: true,
            attachmentsReadable: true,
          })
        },
      },
      settle: bundle.authorExecution.settle,
      scope(input) {
        const scope = bundle.authorExecution.scope(input)
        authors.bind(scope.context, input.call)
        return scope
      },
    })
    await root.plugin(Bindings)
    const currentBindings = root.toolBindings
    if (!(currentBindings instanceof Bindings))
      throw new Error('The real bindings provider has the wrong adoption')
    readBindings = () => {
      const current: unknown = root.get('toolBindings')
      return current instanceof Bindings ? current : undefined
    }
    const Host = createLocalToolHostPlugin<unknown, Environment, ToolMessageContentBlock>({
      source: {
        resolve: async requested => {
          const name = authors.tool(requested)
          if (!name) return fail({ kind: 'denied' })
          return succeed({
            module: authors.modules[name],
            config: {
              authority: requested,
              construction: authors.construction[name],
              settings: authors.settings[name],
            },
            context: {
              access: { principal: authority.principal, tenant: authority.tenant },
              asset: { asset: requested.asset, requiredCapabilities: [] },
              services: {},
            },
          })
        },
      },
      loaderFor: requested =>
        createLocalToolLoader({
          authority: requested,
          verifier,
          settings: async () => {
            const name = authors.tool(requested)
            return name
              ? succeed(authors.construction[name])
              : fail({ kind: 'denied', action: 'settings' })
          },
          schemas: async (_input, loaded) => {
            const name = authors.tool(requested)
            if (
              !name ||
              canonicalDigest(loaded.implementation.facts) !==
                canonicalDigest(authors.implementations[name].facts) ||
              canonicalDigest(loaded.settings) !== canonicalDigest(authors.settings[name])
            )
              return fail({
                kind: 'invalid',
                field: 'schema',
                reason: 'the loaded builtin differs from the verified construction snapshot',
              })
            const checked = await schemas.check(loaded.definition)
            return 'failure' in checked ? checked : succeed(undefined)
          },
        }),
      recordRejection: async (requested, reason) => {
        const row = { requested, reason }
        const domain = {
          kind: 'host' as const,
          tenant: authority.tenant,
          key: 'windows-e2-author-rejections',
        }
        const key = canonicalDigest(row)
        for (let attempt = 0; attempt < 16; attempt++) {
          const read = await store.read(domain)
          if (read.kind !== 'complete') throw new Error('Author rejection storage unavailable')
          const receipt = evidence(`author-rejection:${key}`, row)
          const commit = await store.commit({
            domain,
            expected: read.revision,
            revision: value(decodeToolRevision(String(BigInt(read.revision) + 1n))),
            writes: [
              { kind: 'put', record: { kind: 'host', host: { key, value: { ...row, receipt } } } },
            ],
          })
          if (commit.kind === 'committed') return receipt
          if (commit.kind !== 'conflict') throw new Error('Author rejection custody is unknown')
        }
        throw new Error('Author rejection storage conflicted')
      },
    })
    await root.plugin(Host)
    for (const requested of Object.values(authors.authorities)) {
      const loaded = await root.toolGenerations.ensureLoaded({
        authority: requested,
        access: { principal: authority.principal, tenant: authority.tenant },
      })
      await Promise.all(fiberObservations)
      if ('failure' in loaded)
        throw new AggregateError(
          [loaded.failure, ...fiberFailures],
          `Author ${requested.asset.name} failed to load: ${JSON.stringify(loaded.failure)}`,
        )
    }
    const api = root.toolRuntime
    const accepted: Invocation[] = []
    const saved = new Map<string, ToolDelivery<ToolMessageContentBlock>>()
    const receiver: ToolResultReceiver<unknown, ToolMessageContentBlock> = {
      async push(input) {
        if (
          'failure' in (await authority.project(input.access.principal)) ||
          !tenantEquals(input.access.tenant, authority.tenant) ||
          input.delivery.consumer.owner !== 'windows-e2-consumer' ||
          input.delivery.consumer.work !== authority.session
        )
          return fail({ kind: 'denied' })
        const original = accepted.find(item => item.reference === input.delivery.key.reference)
        if (
          !original ||
          canonicalDigest(original.request.consumer) !== canonicalDigest(input.delivery.consumer)
        )
          return fail({ kind: 'invalid', field: 'consumer', reason: 'not-the-original-invocation' })
        const key = canonicalDigest(input.delivery.key)
        const previous = saved.get(key)
        if (previous && canonicalDigest(previous) !== canonicalDigest(input.delivery))
          return fail({ kind: 'conflict' })
        await record('receiver-saved', input.delivery)
        saved.set(key, structuredClone(input.delivery))
        return succeed({
          key: input.delivery.key,
          evidence: {
            ...evidence(`saved:${key}`, input.delivery),
            owner: input.delivery.consumer.owner,
          },
        })
      },
    }
    await root.plugin({
      name: 'windows-e2-message-consumer',
      inject: ['toolRuntime'],
      apply(ctx: Context) {
        ctx.toolRuntime.registerResultReceiver('windows-e2-consumer', receiver)
      },
    })
    let positions = 0
    const attempt: WindowsAssembly['attempt'] = async (tool, command, args, options = {}) => {
      if (options.authorizeScript !== false && typeof args.script === 'string')
        authority.allowScript(args.script)
      const access = options.foreignTenant
        ? { tenant: authority.foreignTenant, principal: authority.foreignPrincipal }
        : { tenant: authority.tenant, principal: authority.principal }
      const availability = await api.inspect({
        principal: authority.principal,
        tenant: authority.tenant,
        name: tool,
        command,
        consumer: {
          capabilities: evidence('text-only-consumer'),
          conversion: null,
          attachmentAccess: evidence('no-attachments'),
        },
      })
      if ('failure' in availability) throw new Error(JSON.stringify(availability.failure))
      const request: ToolInvokeRequest = {
        availability: availability.ok,
        command,
        // A multi-command tool takes the whole call; its command codec cuts out the parameters.
        arguments: {
          original: JSON.stringify(command === null ? args : { command, params: args }),
          effective: JSON.stringify(command === null ? args : { command, params: args }),
          complete: true,
        },
        settings: authors.settings[tool],
        context: describedAdoption({
          owner: 'windows-composition',
          name: 'context',
          revision: '1',
        }),
        workspace: null,
        environment: availability.ok.definition.declarations.environment,
        requesterScope: authority.scope,
        resources: [],
        scope: scopeGrant,
        consumer: {
          owner: 'windows-e2-consumer',
          work: authority.session,
          position: `${run}:${++positions}:${tool}:${command}`,
          purpose: 'tool-result',
        },
        batchDecision: null,
        mode: 'foreground',
        limits: { concurrency: 8, foregroundMs: null, backgroundAfterMs: null },
      }
      const outcome = await api.invoke({ ...access, request })
      await record('invoke', {
        tool,
        command,
        access: { tenant: tenantCodec.encode(access.tenant) },
        request,
        outcome,
      })
      if (outcome.kind === 'accepted' || outcome.kind === 'commit-unknown')
        accepted.push({ reference: outcome.reference, access, request })
      return { access, request, outcome }
    }
    const stops = new Map<string, ReturnType<WindowsAssembly['stop']>>()
    await writeFile(
      join(evidenceDirectory, 'authority.json'),
      JSON.stringify(
        {
          authority: authority.evidence,
          tenant: tenantCodec.encode(authority.tenant),
          session: authority.session,
          workspace: fixedRoot,
          permittedTools: ['Files', 'Shell'],
          commandPolicy: 'explicit test script allowlist; no OS sandbox claim',
          modules: authors.authorities,
          environmentSchema: { resource: schemas.resource, digest: schemas.digest },
        },
        null,
        2,
      ),
    )
    return {
      workspace: fixedRoot,
      outside,
      evidenceDirectory,
      resultMaxBytes: RESULT_MAX_BYTES,
      attempt,
      async invoke(tool, command, args, options) {
        const entry = await attempt(tool, command, args, options)
        if (entry.outcome.kind !== 'accepted' && entry.outcome.kind !== 'commit-unknown')
          throw new Error(JSON.stringify(entry.outcome))
        return { reference: entry.outcome.reference, access: entry.access, request: entry.request }
      },
      async settle(invocation): Promise<CompletedInvocation> {
        const found = await until(
          () => api.queries.lookup({ ...invocation.access, reference: invocation.reference }),
          result =>
            'ok' in result &&
            result.ok.kind === 'found' &&
            result.ok.state.phase === 'settled' &&
            result.ok.state.delivery?.kind === 'released',
          60_000,
        )
        if (!('ok' in found) || found.ok.kind !== 'found' || found.ok.state.phase !== 'settled')
          throw new Error('The original result is not settled')
        const first = value(
          await api.queries.readResult({
            ...invocation.access,
            reference: invocation.reference,
            result: found.ok.state.result,
            after: null,
          }),
        )
        const content = [...first.value.content]
        let after = first.next
        const seen = new Set<string>()
        while (after !== null) {
          assert.ok(!seen.has(after))
          seen.add(after)
          const page = value(
            await api.queries.readResult({
              ...invocation.access,
              reference: invocation.reference,
              result: first.result,
              after,
            }),
          )
          content.push(...page.value.content)
          after = page.next
        }
        const textContent = content.map(block => {
          if (block.kind !== 'text')
            throw new Error(`The declared text-only consumer received ${block.kind}`)
          return block
        })
        if (first.value.original.kind !== 'none')
          throw new Error('This wave does not provide offloaded Tool results.')
        const result = {
          ...first,
          value: { ...first.value, original: first.value.original, content: textContent },
          next: null,
        }
        const delivery = [...saved.values()].find(
          item =>
            item.kind === 'result' &&
            item.key.reference === invocation.reference &&
            item.key.result === result.result,
        )
        assert.ok(
          delivery && delivery.kind === 'result',
          'The original consumer never saved this result',
        )
        assert.equal(canonicalDigest(delivery.value), canonicalDigest(result.value))
        assert.equal(delivery.delivery, result.delivery)
        const text = result.value.content
          .map(block => {
            assert.equal(block.kind, 'text')
            return block.kind === 'text' ? block.text : ''
          })
          .join('')
        return { invocation, state: found.ok.state, result, delivery, text }
      },
      stop(invocation) {
        let sent = stops.get(invocation.reference)
        if (!sent) {
          sent = api.commands.control({
            ...invocation.access,
            reference: invocation.reference,
            intent: { kind: 'stop' },
          })
          stops.set(invocation.reference, sent)
        }
        return sent
      },
      resources: () => [...resources.values()].map(row => structuredClone(row)),
      acquisitions: () => [...acquisitions],
      authorExecutions: authors.executions,
      negativeFacilities: negative.control,
      record,
      async close() {
        const failures: Error[] = []
        const coldEnumeration = await cleanupStep(failures, 'cold enumeration', () =>
          provider.listRecoveryResources
            ? provider.listRecoveryResources(authority.scope)
            : { kind: 'unavailable' },
        )
        const providerClose = await cleanupStep(failures, 'provider retirement', () =>
          provider.retire(),
        )
        const maintained = await cleanupStep(failures, 'domain maintenance', () =>
          domain.maintain(),
        )
        await cleanupStep(failures, 'provider evidence', () =>
          record('provider-close', { providerClose, maintained, coldEnumeration }),
        )
        await cleanupStep(failures, 'Tool runtime', () => bundle.close())
        authority.retire()
        await cleanupStep(failures, 'Cordis root', () => root.fiber.dispose())
        const storage = await cleanupStep(failures, 'SQLite', () => sql.close())
        await cleanupStep(failures, 'evidence writes', () => events)
        const result = {
          provider: { result: providerClose, maintained },
          storage,
          knownResources: [...resources.values()],
          coldEnumeration,
        }
        if (failures.length > 0) {
          await cleanupStep(failures, 'cleanup failure evidence', () =>
            record('cleanup-failed', {
              result,
              failures: failures.map(failureDetails),
            }),
          )
          throw new AggregateError(failures, 'Windows composition cleanup was not fully confirmed')
        }
        return result
      },
    }
  } catch (error) {
    const failures: Error[] = []
    const provider = await cleanupStep(failures, 'setup provider retirement', retireProvider)
    const runtime = await cleanupStep(failures, 'setup Tool runtime', stopBundle)
    authority.retire()
    const cordis = await cleanupStep(failures, 'setup Cordis root', () => root.fiber.dispose())
    const storage = await cleanupStep(failures, 'setup SQLite', () => sql.close())
    await cleanupStep(failures, 'setup failure evidence', () =>
      record('setup-failed', {
        failure: failureDetails(error),
        provider,
        runtime,
        cordis,
        storage,
      }),
    )
    if (failures.length > 0)
      throw new AggregateError([error, ...failures], 'Windows composition setup and cleanup failed')
    throw error
  }
}
