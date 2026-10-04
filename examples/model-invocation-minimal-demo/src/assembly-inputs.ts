import type { Context } from '@deepseek-ai/cordis'
import { ModelDirectoryDiagnosticsService } from '@omne-harness-lite/model-profile-directory/cordis'
import type { DiagnosticSink as DirectoryDiagnosticsOperations } from '@omne-harness-lite/model-profile-directory'
export class DirectoryDiagnostics extends ModelDirectoryDiagnosticsService {
  constructor(ctx: Context, private readonly operations: DirectoryDiagnosticsOperations) { super(ctx) }
  record(...args: Parameters<DirectoryDiagnosticsOperations['record']>) { return this.operations.record(...args) }
}
import { BoundCredentialReplicaReaderService } from '@omne-harness-lite/model-profile-directory/cordis'
import type { BoundCredentialReplicaReader as ReplicaReaderOperations } from '@omne-harness-lite/model-profile-directory'
export class ReplicaReader extends BoundCredentialReplicaReaderService {
  constructor(ctx: Context, private readonly operations: ReplicaReaderOperations) { super(ctx) }
  readIn(...args: Parameters<ReplicaReaderOperations['readIn']>) { return this.operations.readIn(...args) }
}
import { EvaluationInputSupportService } from '@omne-harness-lite/asset-evaluation/cordis'
import type { EvaluationInputSupport as EvaluationSupportOperations } from '@omne-harness-lite/asset-evaluation'
export class EvaluationSupport extends EvaluationInputSupportService {
  constructor(ctx: Context, private readonly operations: EvaluationSupportOperations) { super(ctx) }
  monotonicNow(...args: Parameters<EvaluationSupportOperations['monotonicNow']>) { return this.operations.monotonicNow(...args) }
  diagnostics(...args: Parameters<EvaluationSupportOperations['diagnostics']>) { return this.operations.diagnostics(...args) }
  onDiagnosticFailure(...args: Parameters<EvaluationSupportOperations['onDiagnosticFailure']>) { return this.operations.onDiagnosticFailure(...args) }
}
import { ModelRetrySampleService } from '@omne-harness-lite/model-request-runtime/cordis'
import type { ModelRetrySample as RetrySampleOperations } from '@omne-harness-lite/model-request-runtime'
export class RetrySample extends ModelRetrySampleService {
  constructor(ctx: Context, private readonly operations: RetrySampleOperations) { super(ctx) }
  sample(...args: Parameters<RetrySampleOperations['sample']>) { return this.operations.sample(...args) }
}
import { DevelopmentTransportTlsService } from '@omne-harness-lite/model-request-runtime/cordis'
import type { DevelopmentTransportTls as TransportTlsOperations } from '@omne-harness-lite/model-request-runtime'
export class TransportTls extends DevelopmentTransportTlsService {
  constructor(ctx: Context, private readonly operations: TransportTlsOperations) { super(ctx) }
  readCa(...args: Parameters<TransportTlsOperations['readCa']>) { return this.operations.readCa(...args) }
}
import { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest/cordis'
import type { AssemblyManifestService as BorrowedManifestOperations } from '@omne-harness-lite/assembly-manifest'
export class BorrowedManifest extends AssemblyManifestService {
  constructor(ctx: Context, private readonly operations: BorrowedManifestOperations) { super(ctx) }
  readHead(...args: Parameters<BorrowedManifestOperations['readHead']>) { return this.operations.readHead(...args) }
  append(...args: Parameters<BorrowedManifestOperations['append']>) { return this.operations.append(...args) }
  readHistory(...args: Parameters<BorrowedManifestOperations['readHistory']>) { return this.operations.readHistory(...args) }
  dependencyPresence(...args: Parameters<BorrowedManifestOperations['dependencyPresence']>) { return this.operations.dependencyPresence(...args) }
  readEvaluation(...args: Parameters<BorrowedManifestOperations['readEvaluation']>) { return this.operations.readEvaluation(...args) }
  readGiven(...args: Parameters<BorrowedManifestOperations['readGiven']>) { return this.operations.readGiven(...args) }
}
import { AssetRegistryService } from '@omne-harness-lite/asset-registry/cordis'
import type { AssetRegistryService as BorrowedAssetRegistryOperations } from '@omne-harness-lite/asset-registry'
export class BorrowedAssetRegistry extends AssetRegistryService {
  constructor(ctx: Context, private readonly operations: BorrowedAssetRegistryOperations) { super(ctx) }
  fill(...args: Parameters<BorrowedAssetRegistryOperations['fill']>) { return this.operations.fill(...args) }
  reload(...args: Parameters<BorrowedAssetRegistryOperations['reload']>) { return this.operations.reload(...args) }
  refreshAvailability(...args: Parameters<BorrowedAssetRegistryOperations['refreshAvailability']>) { return this.operations.refreshAvailability(...args) }
  lookup(...args: Parameters<BorrowedAssetRegistryOperations['lookup']>) { return this.operations.lookup(...args) }
  list(...args: Parameters<BorrowedAssetRegistryOperations['list']>) { return this.operations.list(...args) }
  markFailed(...args: Parameters<BorrowedAssetRegistryOperations['markFailed']>) { return this.operations.markFailed(...args) }
  onAssetChange(...args: Parameters<BorrowedAssetRegistryOperations['onAssetChange']>) { return this.operations.onAssetChange(...args) }
}
import { RunnerHostService } from '@omne-harness-lite/loop-extension-runner/cordis'
import type { RunnerServiceHost as BorrowedRunnerHostOperations } from '@omne-harness-lite/loop-extension-runner'
export class BorrowedRunnerHost extends RunnerHostService {
  constructor(ctx: Context, private readonly operations: BorrowedRunnerHostOperations) { super(ctx) }
  acquireDispatch(...args: Parameters<BorrowedRunnerHostOperations['acquireDispatch']>) { return this.operations.acquireDispatch(...args) }
  acquireReplay(...args: Parameters<BorrowedRunnerHostOperations['acquireReplay']>) { return this.operations.acquireReplay(...args) }
}
import { SessionLogService } from '@omne-harness-lite/session-log/cordis'
import type { SessionLog as BorrowedSessionLogOperations } from '@omne-harness-lite/session-log'
export class BorrowedSessionLog extends SessionLogService {
  constructor(ctx: Context, private readonly operations: BorrowedSessionLogOperations) { super(ctx) }
  append(...args: Parameters<BorrowedSessionLogOperations['append']>) { return this.operations.append(...args) }
  readByKey(...args: Parameters<BorrowedSessionLogOperations['readByKey']>) { return this.operations.readByKey(...args) }
  readSince(...args: Parameters<BorrowedSessionLogOperations['readSince']>) { return this.operations.readSince(...args) }
}

import { ModelTransportSupportService, ModelInputMetersService } from '@omne-harness-lite/model-request-runtime/cordis'
import type { ModelTransportSupport, LoadedImageCodec, Diagnostic, DiagnosticEmitter, InputMeter, MeterCoordinates } from '@omne-harness-lite/model-request-runtime'

export class TransportSupport extends ModelTransportSupportService {
  readonly imageCodec?: LoadedImageCodec | null
  readonly retirementSchedule: ModelTransportSupport['retirementSchedule']
  readonly onDiagnostic?: (event: Diagnostic) => void | Promise<void>
  readonly registryDiagnostics?: Pick<DiagnosticEmitter, 'record'>
  constructor(ctx: Context, value: ModelTransportSupport) {
    super(ctx)
    this.retirementSchedule = value.retirementSchedule
    if (value.imageCodec !== undefined) this.imageCodec = value.imageCodec
    if (value.onDiagnostic !== undefined) this.onDiagnostic = value.onDiagnostic
    if (value.registryDiagnostics !== undefined) this.registryDiagnostics = value.registryDiagnostics
  }
}
function meterKey(value: MeterCoordinates): string {
  return JSON.stringify([value.modelId, value.definitionRevision, value.implementation.name, value.implementation.revision, value.provider])
}
export class InputMeters extends ModelInputMetersService {
  private readonly meters: ReadonlyMap<string, InputMeter>
  constructor(ctx: Context, values: readonly InputMeter[]) {
    const meters = new Map<string, InputMeter>()
    for (const value of values) {
      const key = meterKey(value)
      if (meters.has(key)) throw new TypeError('duplicate exact input meter')
      meters.set(key, Object.freeze({ ...value, implementation: Object.freeze({ ...value.implementation }) }))
    }
    super(ctx)
    this.meters = meters
  }
  select(coordinates: MeterCoordinates): InputMeter | { readonly unavailable: true } {
    return this.meters.get(meterKey(coordinates)) ?? { unavailable: true }
  }
}
