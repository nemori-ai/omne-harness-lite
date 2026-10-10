import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  SessionIngressService,
  SessionLifecycleService,
  SessionWorkReadingService,
  SessionRunJournalService,
} from '@omne-harness-lite/session-runtime/cordis'
import type { LocalSessionIngress } from './runtime-types.ts'

class Ingress extends SessionIngressService {
  readonly createSession: SessionIngressService['createSession']
  readonly readSession: SessionIngressService['readSession']
  readonly submitInput: SessionIngressService['submitInput']
  readonly readReceipt: SessionIngressService['readReceipt']
  readonly readProgress: SessionIngressService['readProgress']
  constructor(ctx: Context, original: LocalSessionIngress) {
    super(ctx)
    this.createSession = (...args) => original.operations.createSession(...args)
    this.readSession = (...args) => original.operations.readSession(...args)
    this.submitInput = (...args) => original.operations.submitInput(...args)
    this.readReceipt = (...args) => original.operations.readReceipt(...args)
    this.readProgress = (...args) => original.operations.readProgress(...args)
  }
}
class Lifecycle extends SessionLifecycleService {
  readonly commitStep: SessionLifecycleService['commitStep']
  constructor(ctx: Context, original: LocalSessionIngress) {
    super(ctx)
    this.commitStep = (...args) => original.lifecycle.commitStep(...args)
  }
}
class WorkReading extends SessionWorkReadingService {
  readonly scanWork: SessionWorkReadingService['scanWork']
  readonly readWork: SessionWorkReadingService['readWork']
  constructor(ctx: Context, original: LocalSessionIngress) {
    super(ctx)
    this.scanWork = (...args) => original.scanWork(...args)
    this.readWork = (...args) => original.readWork(...args)
  }
}
class RunJournal extends SessionRunJournalService {
  readonly borrow: SessionRunJournalService['borrow']
  constructor(ctx: Context, original: LocalSessionIngress) {
    super(ctx)
    this.borrow = (...args) => original.runJournal.borrow(...args)
  }
}
/** Bind the same trusted owner; service removal never closes or grants access to the borrowed Ingress. */
export function createLocalSessionIngressBinding(original: LocalSessionIngress) {
  return definePlugin({
    name: 'session-ingress-binding',
    Config: z.object({}).strict(),
    apply(ctx) {
      new Ingress(ctx, original)
      new Lifecycle(ctx, original)
      new WorkReading(ctx, original)
      new RunJournal(ctx, original)
    },
  })
}
