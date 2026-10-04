import type { SystemReminderMessage } from '@omne-harness-lite/messages'



import { type RunnerExecution } from './conclusion-codec.ts'
import type { RunnerReminderAppend, RunnerReminderRead } from './run-pass-types.ts'



export interface RunnerReminderLogAdapter {
  readonly inspect: (message: SystemReminderMessage) => Promise<RunnerReminderRead>
  readonly append: (
    message: SystemReminderMessage,
    execution: RunnerExecution,
  ) => Promise<RunnerReminderAppend>
}
