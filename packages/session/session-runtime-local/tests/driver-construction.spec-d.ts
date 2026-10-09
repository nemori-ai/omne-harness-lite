import { expectTypeOf } from 'vitest'
import type { SessionDriverControl } from '@omne-harness-lite/session-runtime'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
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
declare const ingress: LocalSessionIngress
// @ts-expect-error The existing narrow Ingress lacks actual tool custody, delivery and original support.
const missing: SessionDriverIngress = ingress
declare const options: LocalSessionDriverOptions
// @ts-expect-error OS transport must not be part of reusable driver construction.
options.socketPath
// @ts-expect-error Whole attempt construction belongs to the driver, not a CLI callback.
options.configureAttempt
declare const sources: SessionDriverRunSources
// @ts-expect-error Source values do not supply a complete executable attempt.
sources.attempt
void missing
// @ts-expect-error A copied caller object is not an original work token.
const copiedWork: SessionDriverWorkToken = {}
void copiedWork
