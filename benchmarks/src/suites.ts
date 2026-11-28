import type { Suite } from '@omne-harness/perf-harness'
import {
  ATTACHMENTS,
  BACKGROUND_CALLS,
  CATCH_UP,
  COLD_OPEN,
  COMPACTION,
  MULTI_ROUND,
  MULTI_STEP,
  TOOL_RESULT,
} from './suites/sessions.ts'

export const SUITES: readonly Suite[] = [
  MULTI_STEP,
  MULTI_ROUND,
  COLD_OPEN,
  CATCH_UP,
  COMPACTION,
  TOOL_RESULT,
  BACKGROUND_CALLS,
  ATTACHMENTS,
]
