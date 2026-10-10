import { observeSessionToolPool } from './session-tool-presentation.ts'
import { createAssetEvaluator, type AssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import type { SessionPresentationStore } from './session-presentation.ts'
import {
  tenantIdEquals,
  parseOpaqueIdentifier,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { createRecoveryAccess } from '@omne-harness-lite/execution-environments'
import {
  createEnvironmentRegistry,
  createHostEnvironment,
} from '@omne-harness-lite/execution-environments-host'
import { isToolReturn, toolResultOf } from '@omne-harness-lite/tool-definition'
import {
  createOriginalIssueToolRuntime,
  createToolInvoker,
  createToolImplementationRegistry,
  createToolRuntimeRegistry,
  createToolEnvironmentPlacementSource,
  createToolOriginalIssueVerifier,
} from '@omne-harness-lite/tool-execution-local'
import {
  openToolResultStorage,
  openToolResultCustodySource,
} from '@omne-harness-lite/tool-result-files'
import {
  createSessionToolActionHistory,
  type SessionDriverToolFactory,
} from '@omne-harness-lite/session-runtime-local'
import { readPassConclusions } from '@omne-harness-lite/loop-extension-runner-local'
import type {
  ToolOriginalIssueSupport,
  ToolOriginalIssueClaim,
  ToolPoolInstance,
} from '@omne-harness-lite/tool-execution-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RuntimeContextOperations } from '@omne-harness-lite/runtime-context'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type {
  SessionRuntimeRootOwners,
  SessionDriverRuntimeRootOptions,
} from './session-runtime-root-types.ts'
import { createSessionShell, sessionShellAsset } from './session-shell.ts'
import { randomUUID } from 'node:crypto'

interface RunSources {
  readonly run: string
  readonly scope: SessionScope
  readonly input: CurrentEvaluationInputs
  readonly context: RuntimeContextOperations
  readonly admission: ToolAdmissionOperations
}
type ToolsOptions = NonNullable<SessionDriverRuntimeRootOptions['tools']>
const runKey = (scope: SessionScope, run: string) => JSON.stringify([scope.session, run])
function resultBlockId() {
  const id = parseOpaqueIdentifier(randomUUID(), 'BlockId')
  if (!('ok' in id)) throw new Error('invalid result BlockId')
  return id.ok
}

/** One tenant pool. Session supplies each original Run's admission and Context bindings. */
export function createProductionSessionTools(
  tenant: TenantId,
  directory: string,
  presentation?: SessionPresentationStore,
  evaluator: AssetEvaluator = createAssetEvaluator(),
) {
  const owner = new ProductionTools(tenant, directory, presentation, evaluator)
  return {
    options: owner.options,
    open: owner.open,
    registerRun: owner.registerRun,
    factory: owner.factory,
  }
}
class ProductionTools {
  readonly runs = new Map<string, RunSources>()
  readonly admissions = new Map<string, ToolOriginalIssueSupport>()
  readonly claims = new WeakMap<ToolOriginalIssueClaim, ToolOriginalIssueSupport>()
  readonly implementations: ReturnType<typeof createToolImplementationRegistry>
  readonly runtimeRegistry = createToolRuntimeRegistry()
  readonly history: ReturnType<typeof createSessionToolActionHistory>
  owners?: SessionRuntimeRootOwners
  original?: ToolOriginalIssueSupport
  pool?: ToolPoolInstance
  results?: Awaited<ReturnType<typeof openToolResultStorage>>
  custody?: Awaited<ReturnType<typeof openToolResultCustodySource>>
  environments?: ReturnType<typeof createEnvironmentRegistry>
  withdrawHost?: () => Promise<void>
  withdrawPlacement?: () => Promise<void>
  withdrawRuntime?: () => Promise<void>
  withdrawImplementation?: () => void
  stopped = false
  constructor(
    readonly tenant: TenantId,
    readonly directory: string,
    readonly presentation?: SessionPresentationStore,
    readonly evaluator: AssetEvaluator = createAssetEvaluator(),
  ) {
    this.implementations = createToolImplementationRegistry({ parameters: evaluator.parameters })
    this.history = createSessionToolActionHistory({
      readConclusions: readPassConclusions,
      parameters: evaluator.parameters,
    })
  }
  readonly options: ToolsOptions = {
    toolIssue: {
      maxRecords: 128,
      current: {
        authorizeIn: async (unit, identity) => {
          const original = this.original
          if (!this.owners || !original || this.stopped) return { kind: 'unavailable' }
          unit.assertStorage(original.storage)
          const scope = { tenant: identity.ref.tenant, session: identity.ref.session }
          const source = await this.owners.log.participant.sourceIn(unit, original.access, scope)
          if (!('source' in source)) return { kind: 'unavailable' }
          const prefix = await this.owners.log.participant.readPrefixIn(
            unit,
            original.access,
            source.source,
          )
          if (!('entries' in prefix)) return { kind: 'unavailable' }
          const found = this.history.inspect(
            {
              scope,
              ownerGeneration: this.owners.log.backing.ownerGeneration,
              entries: prefix.entries,
              tail: source.source.tail,
            },
            identity.ref.callId,
          )
          if (found.kind !== 'known') return { kind: 'denied' }
          const call = found.facts.calls.find(value => value.callId === identity.ref.callId)
          const selected = found.facts.adoption.tools.find(value => value.name === call?.tool)
          if (!selected) return { kind: 'denied' }
          const acquired = this.implementations.acquire({
            ...selected,
            adoption: found.facts.adoption.key,
          })
          if (!('implementation' in acquired)) return { kind: 'denied' }
          acquired.release()
          return { kind: 'authorized' }
        },
      },
    },
    toolResults: {
      maxRecords: 128,
      source: {
        verifyIn: (...args) =>
          this.custody
            ? this.custody.source.verifyIn(...args)
            : Promise.resolve({ failure: 'unavailable' }),
      },
    },
    toolDelivery: { readConclusions: readPassConclusions },
    close: async () => {
      this.stopped = true
      await this.pool?.close()
      await this.custody?.close()
      await this.withdrawRuntime?.()
      await this.results?.close()
      await this.withdrawPlacement?.()
      await this.withdrawHost?.()
      await this.environments?.close()
      this.withdrawImplementation?.()
    },
  }
  run(scope: SessionScope) {
    const value = this.runs.get(scope.session)
    return value && tenantIdEquals(value.scope.tenant, scope.tenant) ? value : undefined
  }
  readonly admission: ToolAdmissionOperations = {
    forPass: (access, scope, pass) =>
      this.run(scope)?.admission.forPass(access, scope, pass) ??
      Promise.resolve({ kind: 'rejected', reason: 'unavailable' }),
    verifyToken: (access, scope, token, call) =>
      this.run(scope)?.admission.verifyToken(access, scope, token, call) ??
      Promise.resolve({ kind: 'failed', reason: 'unavailable' }),
  }
  registerRun = (sources: RunSources) => {
    if (
      this.stopped ||
      !tenantIdEquals(sources.scope.tenant, this.tenant) ||
      this.runs.has(sources.scope.session)
    )
      throw new Error('one original active Run per Session required')
    this.runs.set(sources.scope.session, sources)
    return () => {
      if (this.runs.get(sources.scope.session) === sources) this.runs.delete(sources.scope.session)
    }
  }
  readonly factory: SessionDriverToolFactory = {
    acquire: async (support, binding) => {
      const run = this.run(binding.scope)
      if (
        this.stopped ||
        !this.pool ||
        !run ||
        run.run !== binding.run ||
        this.admissions.has(runKey(binding.scope, binding.run)) ||
        support.storage !== this.original?.storage
      )
        return { unavailable: true }
      const key = runKey(binding.scope, binding.run)
      this.admissions.set(key, support)
      return {
        tenant: this.tenant,
        runtime: observeSessionToolPool(this.pool, binding.scope, binding.run, this.presentation),
        release: async () => {
          if (this.admissions.get(key) === support) this.admissions.delete(key)
        },
      }
    },
  }
  open = async (
    owners: SessionRuntimeRootOwners,
    files: { storage: AtomicStorage; clock: Clock },
  ) => {
    if (this.owners || this.stopped) throw new Error('Tool owner already opened or stopped')
    this.owners = owners
    const original = await owners.ingress.toolInvocation.support(
      owners.ingress.coordinationAuthority,
    )
    if ('unavailable' in original) throw new Error('original Session Tool support unavailable')
    this.original = original
    const recovery = createRecoveryAccess()
    const recoveryAuthority = {
      authorizeRecovery: async (candidate: typeof recovery, scope: SessionScope) => {
        if (candidate !== recovery || !tenantIdEquals(scope.tenant, this.tenant))
          return 'notAuthorized' as const
        const actual = await owners.ingress.tenancy.holdingTenant(scope.session)
        return 'tenant' in actual && tenantIdEquals(actual.tenant, this.tenant)
          ? ('authorized' as const)
          : ('unavailable' as const)
      },
    }
    const environments = createEnvironmentRegistry({
      access: owners.contextAccess.operations,
      recovery: recoveryAuthority,
    })
    this.environments = environments
    this.withdrawHost = environments.registrations.registerProvider(
      createHostEnvironment({
        name: 'cli-local-host',
        access: owners.contextAccess.operations,
        storage: files.storage,
      }),
    )
    this.results = await openToolResultStorage(
      { directory: this.directory, storage: 'cli-tool-results' },
      {
        authorization: owners.contextAccess.operations,
        backing: owners.log.backing,
        history: this.history,
        recoveryAuthority,
      },
    )
    this.custody = await openToolResultCustodySource(
      { directory: this.directory, storage: 'cli-tool-results' },
      {
        storage: files.storage,
        log: original.log,
        access: original.access,
        original: createToolOriginalIssueVerifier(files.storage),
      },
    )
    this.withdrawImplementation = this.implementations.register({
      capability: capabilityCanonicalString(sessionShellAsset.capability),
      asset: sessionShellAsset.id,
      version: '1',
      ...createSessionShell(this.evaluator.parameters),
    })
    this.withdrawPlacement = environments.placements.registerPlacementSource(
      createToolEnvironmentPlacementSource(
        {
          name: 'cli-tool-placement',
          factoryPermission: 'always-allow',
        },
        {
          evaluator: this.evaluator,
          currentInputs: {
            read: async (session, tenant) => {
              const current = typeof session === 'string' ? this.runs.get(session) : undefined
              return current ? current.input.read(session, tenant) : { failure: 'unavailable' }
            },
          },
          tools: this.runtimeRegistry,
          select: async (_placement, candidates) =>
            candidates.length === 1
              ? { kind: 'selected', reference: candidates[0]!.reference }
              : { kind: 'rejected', reason: 'ambiguousEnvironment' },
        },
      ),
    )
    this.pool = createOriginalIssueToolRuntime(
      {
        frameQueueBytes: 65_536,
        tailRetry: { attempts: 8, minDelayMs: 2, maxDelayMs: 20 },
        resultStorage: 'cli-tool-results',
      },
      {
        tenant: this.tenant,
        recoveryPageSize: 16,
        recovery,
        originalIssue: this.routed(original),
        authorization: owners.contextAccess.operations,
        admission: () => this.admission,
        implementations: this.implementations,
        context: {
          bind: (access, scope, consumer) =>
            this.run(scope)?.context.bind(access, scope, consumer) ??
            Promise.resolve({ kind: 'rejected', reason: 'unavailable' }),
        },
        environments: { ...environments.operations, ...environments.registrations },
        results: this.results.operations,
        invoke: createToolInvoker({
          parameters: this.evaluator.parameters,
          judgeResult: value =>
            isToolReturn(value)
              ? {
                  kind: 'valid',
                  result: typeof value === 'string' ? value : toolResultOf(value, resultBlockId()),
                }
              : { kind: 'invalid' },
        }),
        clock: files.clock,
      },
    )
    this.withdrawRuntime = this.runtimeRegistry.register(this.pool.operations)
    await this.pool.ready
  }
  routed(original: ToolOriginalIssueSupport): ToolOriginalIssueSupport {
    return {
      ...original,
      admission: {
        admitOriginal: async participant => {
          const { identity } = participant
          const run = this.run({ tenant: identity.ref.tenant, session: identity.ref.session })
          const source =
            run?.run === identity.origin.run
              ? this.admissions.get(runKey(run.scope, run.run))
              : undefined
          if (!source) return { kind: 'denied' }
          const result = await source.admission.admitOriginal(participant)
          if (result.kind === 'issued') this.claims.set(result.claim, source)
          return result
        },
        consumeOriginal: claim =>
          this.claims.get(claim)?.admission.consumeOriginal(claim) ??
          Promise.resolve({ kind: 'denied' }),
      },
    }
  }
}
