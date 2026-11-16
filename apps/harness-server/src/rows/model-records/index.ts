import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { CredentialPort, ModelClock } from '@omne-harness/model-contract/provider'
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
import { toolResultDisclosureOf } from '../../model/tool-result-disclosure.ts'
import { agentCustodyOf, createModelEvidence } from '../../model/evidence.ts'
import { modelRecordsPortOf } from '../../model/ports.ts'
import { observationTiming } from '../../model/observation.ts'
import { createModelQualification } from '../../model/qualification.ts'
import { officialSendSources } from '../../model/sources.ts'
import { defineRow } from '../../row.ts'
import { providerRoutes } from '../../assets/model-providers.ts'
import { credentialLayerSupplier } from '../../model/credential-layer.ts'
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
  return {
    storage: ctx.get(storageKey) as SqlStorage,
    tenantDomainLookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
    modelClock: ctx.get(modelClockKey) as ModelClock,
    principalVerifier: ctx.get(principalVerifierKey) as PrincipalVerifier,
    tenantStanding: ctx.get(tenantStandingKey) as TenantStandingSource,
  }
}

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

function mountRecords(ctx: Context, config: ModelRecordsConfig): void {
  const requestDisclosure = toolResultDisclosureOf(ctx)
  const port = modelRecordsPortOf(ctx)
  if (port === undefined)
    throw new Error(
      'model-records: the modelHostAuthority entry object of this release is not installed',
    )
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(`model records combination is not registrable: ${manifest.diagnostic}`)
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
        current: qualification.sourceCurrent,
      }),
      initialRun,
      observation: { timing: observationTiming },
    }),
    sendStage: (coordinator, activation) => {
      if (activation?.initial === null || activation === undefined)
        throw new Error('model-records: the records activation gave no first-execution record')
      const observationLimits = config.member.observation
      if (activation.observation === null || observationLimits === undefined)
        throw new Error('model-records: the records activation gave no observation pair')
      live.initial = activation.initial
      const attached = port.attach(ctx, {
        initial: activation.initial,
        observation: { ...activation.observation, recheckMs: observationLimits.checkIntervalMs },
        qualification,
      })
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
        requestDisclosure,
        families: composeFamilies([
          createOpenAiFamily({
            tokenizer: openAiTokenizerResources(),
            executor: {
              acquire: (definition, signal) =>
                sendTokenizers.port?.acquire(definition, signal) ?? {
                  failure: { kind: 'unavailable', diagnostic: 'tokenizer-provider-unavailable' },
                },
            },
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
        routes: providerRoutes(sendStage.endpoints),
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
          supplierOf: credentialLayerSupplier(() => sendCredential.port),
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
