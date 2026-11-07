import type { Context } from '@deepseek-ai/cordis'
import { createToolLedger, type ToolLedger, type ToolLedgerPorts } from '@omne-harness/tool'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  ToolCommandsService,
  ToolReadsService,
  ToolStartAuthorityService,
  ToolStartFenceService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolLedgerGuards } from './ledger-guards.ts'
import { createLocalStartCoordinator } from './start-coordinator.ts'
import type { RuntimeCompositionInput, RuntimeStages } from './runtime-composition.ts'

export type RuntimeRecords = Readonly<{
  ledger: ToolLedger<unknown, ToolMessageContentBlock>
  authority: ReturnType<typeof createLocalStartCoordinator<unknown>>
}>

export function createRuntimeRecords(
  input: RuntimeCompositionInput,
  stages: RuntimeStages,
): RuntimeRecords {
  const authority = createLocalStartCoordinator({
    store: input.store,
    access: input.access.start,
    ...(input.access.request === undefined ? {} : { requestAccess: input.access.request }),
    guardsOf: input.guardsOf,
    permitRequirements: input.permitRequirements,
    commitAttempts: input.configuration.ledgerCommitAttempts,
  })
  const guards = createLocalToolLedgerGuards({
    access: input.access,
    sources: input.sources,
    bindings: stages.bindings,
    grants: input.grants,
  })
  const ports: ToolLedgerPorts<unknown> = {
    controlSubjects: input.controlSubjects,
    content: input.content,
    materials: input.materials,
    releaseInspection: stages.environments,
  }
  const ledger = createToolLedger(input.store, guards, input.clock, input.configuration, ports)
  return { ledger, authority }
}

export function publishRuntimeRecords(ctx: Context, records: RuntimeRecords): void {
  const { ledger, authority } = records
  class Commands extends ToolCommandsService<unknown, ToolMessageContentBlock> {
    admit = ledger.commands.admit
    control = ledger.commands.control
    acceptDecision = ledger.commands.acceptDecision
    acceptResource = ledger.commands.acceptResource
    releaseDelivery = ledger.commands.releaseDelivery
    scanPending = ledger.commands.scanPending
    loadRecovery = ledger.commands.loadRecovery
    claim = ledger.commands.claim
    planPreparation = ledger.commands.planPreparation
    prepared = ledger.commands.prepared
    enqueue = ledger.commands.enqueue
    prepareStart = ledger.commands.prepareStart
    prepareResume = ledger.commands.prepareResume
    rejectPending = ledger.commands.rejectPending
    recordStart = ledger.commands.recordStart
    preserveProcess = ledger.commands.preserveProcess
    openWait = ledger.commands.openWait
    attachRegistration = ledger.commands.attachRegistration
    attachResource = ledger.commands.attachResource
    planSuspension = ledger.commands.planSuspension
    suspend = ledger.commands.suspend
    preserveResult = ledger.commands.preserveResult
    recordResponse = ledger.commands.recordResponse
    closeWait = ledger.commands.closeWait
    recordControl = ledger.commands.recordControl
    receiveFacts = ledger.commands.receiveFacts
    recordFactAcknowledgement = ledger.commands.recordFactAcknowledgement
    recordScheduling = ledger.commands.recordScheduling
    recordAccount = ledger.commands.recordAccount
    planRelease = ledger.commands.planRelease
    recordRelease = ledger.commands.recordRelease
    recordLateFact = ledger.commands.recordLateFact
    recordLateResult = ledger.commands.recordLateResult
    settleLost = ledger.commands.settleLost
    recordTask = ledger.commands.recordTask
  }
  class Reads extends ToolReadsService<unknown, ToolMessageContentBlock> {
    lookup = ledger.reads.lookup
    operation = ledger.reads.operation
    result = ledger.reads.result
    process = ledger.reads.process
    wait = ledger.reads.wait
    diagnostics = ledger.reads.diagnostics
    account = ledger.reads.account
    content = ledger.reads.content
    body = ledger.reads.body
  }
  class Authority extends ToolStartAuthorityService<unknown> {
    exclude = authority.exclude
    prepare = authority.prepare
    consume = authority.consume
    inspect = authority.inspect
    invalidate = authority.invalidate
  }
  class Fence extends ToolStartFenceService<unknown> {
    invalidate = authority.invalidate
  }
  new Commands(ctx)
  new Reads(ctx)
  new Authority(ctx)
  new Fence(ctx)
}
