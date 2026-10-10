import { expectTypeOf } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SessionIngressOperations,
  SessionLifecycle,
  CoordinationStep,
  SessionWorkReading,
  OriginalRunJournal,
} from '../src/index.ts'
import {
  SessionIngressService,
  SessionLifecycleService,
  SESSION_INGRESS,
  SESSION_LIFECYCLE,
  SessionWorkReadingService,
  SessionRunJournalService,
  SESSION_WORK_READING,
  SESSION_RUN_JOURNAL,
} from '../src/cordis.ts'

expectTypeOf<SessionIngressService>().toExtend<SessionIngressOperations>()
expectTypeOf<SessionLifecycleService>().toExtend<SessionLifecycle>()
expectTypeOf<typeof SESSION_INGRESS>().toEqualTypeOf<'sessionIngress'>()
expectTypeOf<typeof SESSION_LIFECYCLE>().toEqualTypeOf<'sessionLifecycle'>()
expectTypeOf<Context['sessionIngress']>().toEqualTypeOf<SessionIngressService>()
expectTypeOf<Context['sessionLifecycle']>().toEqualTypeOf<SessionLifecycleService>()
expectTypeOf<SessionWorkReadingService>().toExtend<SessionWorkReading>()
expectTypeOf<SessionRunJournalService>().toExtend<OriginalRunJournal>()
expectTypeOf<typeof SESSION_WORK_READING>().toEqualTypeOf<'sessionWorkReading'>()
expectTypeOf<typeof SESSION_RUN_JOURNAL>().toEqualTypeOf<'sessionRunJournal'>()
expectTypeOf<Context['sessionWorkReading']>().toEqualTypeOf<SessionWorkReadingService>()
expectTypeOf<Context['sessionRunJournal']>().toEqualTypeOf<SessionRunJournalService>()

declare const ingress: SessionIngressService
declare const lifecycle: SessionLifecycleService
declare const ctx: Context
declare const authority: Parameters<SessionLifecycle['commitStep']>[0]
declare const scope: Parameters<SessionLifecycle['commitStep']>[1]
declare const source: Parameters<SessionLifecycle['commitStep']>[2]
declare const cancellation: Extract<CoordinationStep, { kind: 'cancelStage' }>
// @ts-expect-error A five-operation service cannot advertise cancellation.
ingress.cancelRun
// @ts-expect-error A five-operation service cannot advertise archival.
ingress.setArchived
// @ts-expect-error A five-operation service cannot replace the full service.
ctx.sessionRuntime = ingress
// @ts-expect-error A six-step service cannot replace the full coordination service.
ctx.sessionCoordination = lifecycle
// @ts-expect-error The subset cannot accept a full cancellation step.
lifecycle.commitStep(authority, scope, source, cancellation)
