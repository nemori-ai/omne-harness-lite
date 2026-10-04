





import type { RunnerPorts } from './run-pass-types.ts'
import type { RunnerLogBinding } from './task-owner-types.ts'


export interface RunnerLogAdapter {
  readonly binding: RunnerLogBinding
  readonly readConclusions: RunnerPorts['readConclusions']
  readonly record: RunnerPorts['record']
}
