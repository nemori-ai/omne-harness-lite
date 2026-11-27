import type { Suite } from '@omne-harness/perf-harness'
import { MULTI_ROUND, MULTI_STEP } from './suites/sessions.ts'

export const SUITES: readonly Suite[] = [MULTI_STEP, MULTI_ROUND]
