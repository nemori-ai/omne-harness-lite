import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { Config as SessionLogConfig } from '@omne-harness-lite/session-log-jsonl/plugin'
import type { SessionLog } from '@omne-harness-lite/session-log'
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

/** A real contribution borrowing the sole owner; withdrawal never closes it. */
export function sessionLogContribution(log: SessionLog): Plugin.Object<Record<string, never>> {
  const borrowed = Object.freeze({
    append: log.append,
    readByKey: log.readByKey,
    readSince: log.readSince,
  })
  return {
    name: 'acceptance-session-log',
    apply(ctx: Context) {
      if (ctx.get('sessionLog') !== undefined) throw new Error('duplicate acceptance log')
      new BorrowedSessionLog(ctx, borrowed)
    },
  }
}
