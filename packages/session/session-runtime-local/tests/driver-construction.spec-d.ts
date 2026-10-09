import { expectTypeOf } from 'vitest'
import type { SessionDriverControl } from '@omne-harness-lite/session-runtime'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { AssetRegistryService } from '@omne-harness-lite/asset-registry'
import type {
  LoopExtensionRunnerService,
  RunnerActionRequest,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionModelResultSource } from '../src/index.ts'
import type {
  LocalSessionDriverFactory,
  LocalSessionDriverOptions,
  LocalSessionIngress,
  SessionDriverIngress,
  SessionDriverRunSources,
  SessionDriverWorkToken,
} from '../src/index.ts'

expectTypeOf<ReturnType<LocalSessionDriverFactory['create']>>().toEqualTypeOf<
  Promise<SessionDriverControl>
>()
expectTypeOf<SessionDriverIngress>().toExtend<LocalSessionIngress>()
expectTypeOf<SessionDriverRunSources['evaluation']>().toEqualTypeOf<CurrentEvaluationInputs>()
expectTypeOf<SessionDriverRunSources['registry']>().toEqualTypeOf<
  Pick<AssetRegistryService, 'refreshAvailability' | 'list'>
>()
expectTypeOf<
  SessionDriverRunSources['actions']['runner']
>().toEqualTypeOf<LoopExtensionRunnerService>()
expectTypeOf<SessionDriverRunSources['actions']['admission']>().toEqualTypeOf<
  Omit<RunnerActionRequest['admission'], 'report'>
>()
expectTypeOf<
  LocalSessionDriverOptions['model']['results']
>().toEqualTypeOf<SessionModelResultSource>()
declare const ingress: LocalSessionIngress
const complete: SessionDriverIngress = ingress
declare const incomplete: Omit<LocalSessionIngress, 'toolDelivery'>
// @ts-expect-error The driver requires the original tool delivery facet.
const missing: SessionDriverIngress = incomplete
declare const options: LocalSessionDriverOptions
declare const withoutResults: Omit<LocalSessionDriverOptions['model'], 'results'>
// @ts-expect-error Execution snapshots cannot replace original result capture and release.
const missingResults: LocalSessionDriverOptions['model'] = withoutResults
// @ts-expect-error OS transport must not be part of reusable driver construction.
options.socketPath
// @ts-expect-error Whole attempt construction belongs to the driver, not a CLI callback.
options.configureAttempt
declare const sources: SessionDriverRunSources
declare const withoutReport: Omit<SessionDriverRunSources, 'registry'>
// @ts-expect-error Lookup alone cannot produce the original Run availability report.
const missingReport: SessionDriverRunSources = withoutReport
declare const withoutActions: Omit<SessionDriverRunSources, 'actions'>
// @ts-expect-error Session access does not supply official action grants or a Runner.
const missingActions: SessionDriverRunSources = withoutActions
// @ts-expect-error The driver constructs the report, ordered calls and action request itself.
sources.actions.configureBatch
// @ts-expect-error Source values do not supply a complete executable attempt.
sources.attempt
void missing
void complete
// @ts-expect-error A copied caller object is not an original work token.
const copiedWork: SessionDriverWorkToken = {}
void copiedWork
void [missingResults, missingReport, missingActions]
