import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { Config as SessionLogConfig } from '@omne-harness-lite/session-log-jsonl/plugin'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import {
  SessionLogBackingService,
  SESSION_LOG_BACKING,
} from '@omne-harness-lite/session-log/cordis'
import type { SessionLogDeployment } from './types.ts'

import { BorrowedSessionLog } from './assembly-inputs.ts'

/** The deployment supplies ownership evidence; this checks its shape, not its truth. */
export async function prepareSessionLogDeployment(
  input: SessionLogDeployment | undefined,
): Promise<SessionLogDeployment> {
  if (
    input === undefined ||
    input === null ||
    typeof input.dir !== 'string' ||
    !isAbsolute(input.dir) ||
    input.dir.includes('\0') ||
    input.policy === undefined ||
    input.policy === null ||
    !Object.hasOwn(input.policy, 'appendQueueLimit') ||
    !Object.hasOwn(input.policy, 'residentLogsLimit') ||
    !Number.isInteger(input.policy.appendQueueLimit) ||
    input.policy.appendQueueLimit < 1 ||
    !Number.isInteger(input.policy.residentLogsLimit) ||
    input.policy.residentLogsLimit < 1
  )
    throw new Error('acceptance log deployment invalid')
  SessionLogConfig.parse(input)
  const directory = await lstat(input.dir)
  if (
    !directory.isDirectory() ||
    directory.uid !== process.getuid?.() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('acceptance log directory invalid')
  return Object.freeze({
    dir: input.dir,
    processOwnership: input.processOwnership,
    policy: Object.freeze({ ...input.policy }),
  })
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
