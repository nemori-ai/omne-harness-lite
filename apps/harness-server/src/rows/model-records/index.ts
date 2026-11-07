// The `model-records` row (assembly page row table, R2-D6, facts a.1/a.3/b.1/b.2, `tmp/wire-model/design.md`):
// model-storage-sql's `createSqlModelRecordsPlugin` with the live objects of this application, and
// the send stage of model-host-local as a child fiber of the same row (plan A of R2-D6). The row
// provides `modelCommands` itself and `modelSendBoundary` through its child.
//
// What the row builds from its injects and its port of the run composition (`src/model/ports.ts`):
// - the first-execution run (`createModelInitialRun`) with the origin read check of the composition;
// - the qualification registry over `principalVerifier` and `tenantStanding` (the synchronous
//   `authority`, `execution` and `current` read what the admission points captured);
// - one evidence adapter per consumer owner adoption, over the `initial` of this activation, the
//   materialization reader the send stage installs, and the custody evidence of the Agent owner read
//   per call from the trusted `agentReceivedRecords` of the `agent-journal` row (R2-D257);
// - the trusted send sources of the official OpenAI profiles with the factory credential;
// - the combination: the configured `combinationVersion` and the digest of the same catalog the
//   `session-storage` row registers.
// At activation the row attaches `initial` and the registry to the composition (one channel is
// opened there), then the member creates the send child; the child captures its fiber into the
// composition so the host can release it before the channel. A missing credential leaves the child
// `PENDING` and the commands `ACTIVE`.
//
// The row also provides `modelDiagnostics` (#1140 A5, RFC-0013 A line): model-storage-sql's
// `createSqlModelDiagnostics` over the same storage, the same tenant domains and the same
// `authority` as the records plugin, in the same plugin body, so the three keys are one provider
// group (`model-records`). The read eligibility and the retention adoption come from the row
// configuration (`diagnostics`).
import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import {
  decodeCredentialId,
  type CredentialPort,
  type ModelClock,
} from '@omne-harness/model-contract/provider'
import {
  ModelDiagnosticsService,
  modelClockKey,
  modelCommandsKey,
  modelDiagnosticsKey,
  modelSendBoundaryKey,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  createModelSendStagePlugin,
  type ModelSendStageSettings,
} from '@omne-harness/model-host-local/cordis'
import type { ModelMaterializationEvidenceReader } from '@omne-harness/model-host-local'
import { createSqlModelRecordsPlugin } from '@omne-harness/model-storage-sql/cordis'
import { createSqlModelDiagnostics } from '@omne-harness/model-storage-sql'
import {
  createModelInitialRun,
  type ModelCommandsEvidence,
  type ModelInitialExecution,
} from '@omne-harness/model/commands'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { modelTokenizersKey, type ModelTokenizers } from '@omne-harness/tokenizer-tiktoken/cordis'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { currentForReader } from '../../entry/runtime-context-trust.ts'
import { qualifyingDiagnostics } from './diagnostics.ts'
import { agentCustodyOf, createModelEvidence } from '../../model/evidence.ts'
import { modelRecordsPortOf } from '../../model/ports.ts'
import { createModelQualification } from '../../model/qualification.ts'
import { officialSendSources } from '../../model/sources.ts'
import { defineRow } from '../../row.ts'
import { tenantCredentialSupplier } from '../../model/tenant-credential.ts'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { modelRecordsConfig, type ModelRecordsConfig } from './config.ts'

const INJECT = [
  storageKey,
  tenantDomainLookupKey,
  modelClockKey,
  principalVerifierKey,
  tenantStandingKey,
] as const

type Injected = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  modelClock: ModelClock
  principalVerifier: PrincipalVerifier
  tenantStanding: TenantStandingSource
}>

function injected(ctx: Context): Injected {
  // The row's static inject guarantees every name is ACTIVE when the body runs.
  return {
    storage: ctx.get(storageKey) as SqlStorage,
    tenantDomainLookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
    modelClock: ctx.get(modelClockKey) as ModelClock,
    principalVerifier: ctx.get(principalVerifierKey) as PrincipalVerifier,
    tenantStanding: ctx.get(tenantStandingKey) as TenantStandingSource,
  }
}

/** The evidence adapters: one per distinct consumer owner adoption. */
function evidenceOf(
  config: ModelRecordsConfig['member'],
  sources: Parameters<typeof createModelEvidence>[1],
): readonly ModelCommandsEvidence[] {
  const seen = new Set<string>()
  const adapters: ModelCommandsEvidence[] = []
  for (const owner of config.owners) {
    const key = JSON.stringify(owner.evidence)
    if (seen.has(key)) continue
    seen.add(key)
    adapters.push(createModelEvidence(owner.evidence, sources))
  }
  return adapters
}

/** One activation of the row: the plugin class is built for it, so every live object is in its closure. */
function mountRecords(ctx: Context, config: ModelRecordsConfig): void {
  const port = modelRecordsPortOf(ctx)
  if (port === undefined)
    throw new Error(
      'model-records: the modelHostAuthority entry object of this release is not installed',
    )
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(`model records combination is not registrable: ${manifest.diagnostic}`)
  const factoryQueryId = decodeCredentialId(config.app.sendStage.factoryQueryId)
  if ('failure' in factoryQueryId)
    throw new Error(`model-records: sendStage.factoryQueryId is not a credential id`)
  const given = injected(ctx)
  const qualification = createModelQualification({
    verifier: given.principalVerifier,
    standing: given.tenantStanding,
  })
  const live: {
    initial: ModelInitialExecution<unknown> | undefined
    reader: ModelMaterializationEvidenceReader | undefined
  } = { initial: undefined, reader: undefined }
  const initialRun = createModelInitialRun<unknown>({
    limits: config.app.initial,
    checkOriginRead: target => port.checkOriginRead(target),
  })
  const { sendStage } = config.app
  // The credential port the send child injects. The stage's own preparation leases complete a
  // supplier through it, like the preparation row; outside the child's life there is none.
  const sendCredential: { port: CredentialPort | undefined } = { port: undefined }
  const sendTokenizers: { port: ModelTokenizers | undefined } = { port: undefined }
  const Records = createSqlModelRecordsPlugin<unknown, ModelSendStageSettings>({
    inject: [...INJECT],
    resolve: () => ({
      storage: given.storage,
      domains: given.tenantDomainLookup,
      authority: qualification.authority,
      evidence: evidenceOf(config.member, {
        initial: () => live.initial,
        reader: () => live.reader,
        custody: () => agentCustodyOf(ctx),
      }),
      clock: given.modelClock,
      manifestDigest: manifest.digest,
      sources: officialSendSources({
        profiles: sendStage.profiles,
        factoryQueryId: factoryQueryId.ok,
        current: qualification.sourceCurrent,
      }),
      initialRun,
    }),
    sendStage: (coordinator, activation) => {
      if (activation?.initial === null || activation === undefined)
        throw new Error('model-records: the records activation gave no first-execution record')
      live.initial = activation.initial
      const attached = port.attach(ctx, { initial: activation.initial, qualification })
      if ('failure' in attached)
        throw new Error(
          `model-records: the run composition refused the attachment (${attached.failure.kind})`,
        )
      const handle = attached.ok
      ctx.effect(() => () => {
        live.initial = undefined
        handle.detach()
      })
      const Stage = createModelSendStagePlugin<unknown>({
        families: composeFamilies([
          createOpenAiFamily({
            tokenizer: openAiTokenizerResources(),
            executor: {
              acquire: (definition, signal) =>
                sendTokenizers.port?.acquire(definition, signal) ?? {
                  failure: { kind: 'unavailable', diagnostic: 'tokenizer-provider-unavailable' },
                },
            },
            maxSerializedBytes: sendStage.preparation.openai.maxSerializedBytes,
            limits: sendStage.preparation.openai.limits,
            margin: sendStage.preparation.openai.margin,
          }),
        ]),
        coordinator,
        materialization: {
          maxRecords: sendStage.materialization.maxRecords,
          execution: qualification.authority.execution,
        },
        network: sendStage.network,
        routes: sendStage.routes,
        transportLimits: {
          connectTimeoutMs: sendStage.transportLimits.connectTimeoutMs,
          connectRetry: sendStage.transportLimits.connectRetry,
          maxErrorBodyBytes: sendStage.transportLimits.maxErrorBodyBytes,
          maxEventBytes: sendStage.transportLimits.maxEventBytes,
          json: sendStage.transportLimits.json,
          ...(sendStage.transportLimits.streamStallTimeoutMs === undefined
            ? {}
            : { streamStallTimeoutMs: sendStage.transportLimits.streamStallTimeoutMs }),
        },
        preparation: {
          maxCitedCalls: sendStage.preparation.maxCitedCalls,
          supplierOf: tenantCredentialSupplier(() => sendCredential.port),
        },
        executionChannel: () => handle.executionChannel(),
        installMaterialization: reader => {
          live.reader = reader
          return () => {
            if (live.reader === reader) live.reader = undefined
          }
        },
      })
      // The child's fiber is captured here, before the stage constructs, so the host can release it.
      const plugin: Plugin.Object = {
        name: 'model-send-stage',
        inject: [...Stage.inject, modelTokenizersKey],
        Config: Stage.Config,
        apply(child: Context, settings: ModelSendStageSettings) {
          handle.captureSendChild(child.fiber as Fiber)
          const port: CredentialPort | undefined = child.modelCredential
          sendCredential.port = port
          const tokenizers = child.get(modelTokenizersKey)
          sendTokenizers.port = tokenizers
          child.effect(() => () => {
            if (sendCredential.port === port) sendCredential.port = undefined
            if (sendTokenizers.port === tokenizers) sendTokenizers.port = undefined
          })
          new Stage(child, settings)
        },
      }
      return { plugin, config: { maxRetainedAttempts: sendStage.maxRetainedAttempts } }
    },
  })
  new Records(ctx, config.member)
  // The read face over the same records: the same storage, domains and authority as the commands.
  const current = currentForReader(new WeakMap(), ctx)
  class Diagnostics extends ModelDiagnosticsService<unknown> {
    readonly list
    constructor() {
      super(ctx)
      this.list = qualifyingDiagnostics(
        createSqlModelDiagnostics({
          storage: given.storage,
          domains: given.tenantDomainLookup,
          authority: qualification.authority,
          ...config.diagnostics,
        }),
        access => qualification.qualifyRead(access, current),
      ).list
    }
  }
  new Diagnostics()
}

const recordsPlugin: Plugin.Object = {
  name: 'model-records',
  inject: [...INJECT],
  Config: modelRecordsConfig,
  apply(ctx: Context, config: ModelRecordsConfig) {
    mountRecords(ctx, config)
  },
}

export const modelRecordsRow = defineRow({
  row: 'model-records',
  implementation: 'real',
  manifest: {
    provides: [modelCommandsKey, modelSendBoundaryKey, modelDiagnosticsKey],
    injects: [...INJECT],
    sameProviderGroup: 'model-records',
  },
  lifecycle: { kind: 'none' },
  plugin: recordsPlugin,
})
