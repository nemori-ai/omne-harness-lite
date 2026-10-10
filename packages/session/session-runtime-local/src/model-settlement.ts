import type { SessionModelSettlement } from '@omne-harness-lite/model-request-runtime'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { createSettlementWork } from './settlement-work.ts'
import { recoverSettlementWork } from './settlement-work-recovery.ts'

export const sessionModelSettlement: SessionModelSettlement = Object.freeze({
  create: createSettlementCoordinator,
  createWork: createSettlementWork,
  recoverWork: recoverSettlementWork,
})
