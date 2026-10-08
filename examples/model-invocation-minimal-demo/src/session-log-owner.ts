import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { Config as SessionLogConfig } from '@omne-harness-lite/session-log-sql/cordis'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import {
  SessionLogBackingService,
  SESSION_LOG_BACKING,
} from '@omne-harness-lite/session-log/cordis'
import type { SessionLogDeployment } from './types.ts'

import { BorrowedSessionLog } from './assembly-inputs.ts'

/** The database owner validates file identity and permissions before this stage. */
export async function prepareSessionLogDeployment(
  input: SessionLogDeployment | undefined,
): Promise<SessionLogDeployment> {
  if (input === undefined) throw new Error('acceptance log deployment absent')
  return Object.freeze(SessionLogConfig.parse(input))
}

export class SessionLogBacking extends SessionLogBackingService {
  constructor(
    ctx: Context,
    private readonly operations: SessionLogBackingOperations,
  ) {
    super(ctx)
  }
  get ownerGeneration() {
    return this.operations.ownerGeneration
  }
  borrow() {
    return this.operations.borrow()
  }
}

/** JSON configuration; the application retains failed borrows and the physical close right. */
export const borrowedSessionLog = definePlugin({
  name: 'acceptance-session-log',
  inject: [SESSION_LOG_BACKING],
  Config: z.object({}).strict(),
  apply(ctx) {
    const borrow = ctx.sessionLogBacking.borrow()
    ctx.effect(() => borrow.release)
    new BorrowedSessionLog(ctx, borrow.log)
  },
})
