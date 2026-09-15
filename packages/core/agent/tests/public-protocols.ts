import type { ExactUse, GateFrame } from '@omne-harness-lite/admission'
import type { UseBinding } from '@omne-harness-lite/records'
import type {
  AgentRef,
  DefinitionVersion,
  OpaqueId,
  RunRef,
  SessionRef,
} from '@omne-harness-lite/work-data'
import type {
  ActivationPermit,
  Attachment,
  AttachmentInspection,
  CheckResult,
  Driver,
  Factory,
  FactoryBinding,
  FactoryPreparation,
  FactorySelection,
  ManagedReleaseResult,
  QuiescenceResult,
  RuntimeAccess,
  RuntimeAccessPreparation,
  RuntimeAccessRequest,
  RuntimeOwner,
  RuntimeResource,
  RuntimeResourceBinding,
  RuntimeResourcePreparation,
  RuntimeResourceRequirement,
  WorkPermit,
} from '@omne-harness-lite/agent'

declare const frame: GateFrame
declare const accessPreparation: RuntimeAccessPreparation
declare const attachment: Attachment
declare const factoryPreparation: FactoryPreparation
declare const resourcePreparation: RuntimeResourcePreparation
declare const permit: ActivationPermit
declare const workPermit: WorkPermit
declare const exactUse: ExactUse
declare const session: SessionRef
declare const agent: AgentRef
declare const run: RunRef
declare const definition: DefinitionVersion
declare const binding: FactoryBinding
declare const selection: FactorySelection
declare const resourceBinding: RuntimeResourceBinding
declare const remaining: readonly UseBinding[]
declare const opaqueId: OpaqueId

const accessRequest: RuntimeAccessRequest = Object.freeze({
  session,
  agent,
  operation: 'session.activate',
})

const access = {
  async prepare(request: RuntimeAccessRequest) {
    void request
    return { status: 'prepared' as const, value: accessPreparation }
  },
  check(
    activeFrame: GateFrame,
    candidate: RuntimeAccessPreparation,
    request: RuntimeAccessRequest,
  ) {
    void activeFrame
    void candidate
    void request
    return { status: 'ready' as const }
  },
} satisfies RuntimeAccess

const owner = {
  registerAttempt(activeFrame: GateFrame, attempt: Parameters<RuntimeOwner['registerAttempt']>[1]) {
    void activeFrame
    void attempt
    return { status: 'registered' as const }
  },
  closeAdmission(activeFrame: GateFrame, reason: Parameters<RuntimeOwner['closeAdmission']>[1]) {
    void activeFrame
    void reason
    return undefined
  },
} satisfies RuntimeOwner

const sessionAttachment = {
  async prepare(
    request: Parameters<import('@omne-harness-lite/agent').SessionAttachment['prepare']>[0],
  ) {
    void request
    return { status: 'prepared' as const, value: attachment }
  },
  checkActivation(activeFrame: GateFrame, current: Attachment, activation: ActivationPermit) {
    void activeFrame
    void current
    void activation
    return { status: 'ready' as const }
  },
  inspect(current: Attachment): AttachmentInspection {
    return { status: 'held', attachment: current }
  },
  async release(current: Attachment): Promise<ManagedReleaseResult> {
    void current
    return { status: 'released' }
  },
} satisfies import('@omne-harness-lite/agent').SessionAttachment

const driver = {
  requestRetire(reason: Parameters<Driver['requestRetire']>[0]) {
    void reason
    return undefined
  },
  async awaitQuiescent(): Promise<QuiescenceResult> {
    return { status: 'blocked', diagnosticId: opaqueId, remaining }
  },
  async releaseResources(): Promise<ManagedReleaseResult> {
    return { status: 'retained', diagnosticId: opaqueId, remaining }
  },
} satisfies Driver

const resource = {
  binding: resourceBinding,
  async prepare(request: Parameters<RuntimeResource['prepare']>[0]) {
    void request
    return { status: 'prepared' as const, value: resourcePreparation }
  },
  check(
    activeFrame: GateFrame,
    prepared: RuntimeResourcePreparation,
    activation: ActivationPermit,
  ) {
    void activeFrame
    void prepared
    void activation
    return { status: 'ready' as const }
  },
  pin(activeFrame: GateFrame, prepared: RuntimeResourcePreparation, activation: ActivationPermit) {
    void activeFrame
    void prepared
    void activation
    return { status: 'pinned' as const, use: exactUse }
  },
  retire(activeFrame: GateFrame, reason: Parameters<RuntimeResource['retire']>[1]) {
    void activeFrame
    void reason
    return undefined
  },
} satisfies RuntimeResource

const requirement: RuntimeResourceRequirement = Object.freeze({
  purpose: 'instance_required',
  resource,
})

const factory = {
  async prepare(request: Parameters<Factory['prepare']>[0]) {
    void request
    return { status: 'prepared' as const, value: factoryPreparation }
  },
  check(activeFrame: GateFrame, prepared: FactoryPreparation, activation: ActivationPermit) {
    void activeFrame
    void prepared
    void activation
    return { status: 'ready' as const }
  },
} satisfies Factory

function checkIsExclusive(result: CheckResult): void {
  if (result.status === 'ready') {
    // @ts-expect-error a successful current check has no denial code
    void result.code
  } else if (result.status === 'prepare_again') {
    // @ts-expect-error a stale preparation does not claim an unavailable owner
    void result.owner
  } else {
    void result.code
  }
}

function releaseIsExclusive(result: ManagedReleaseResult): void {
  if (result.status === 'released') {
    // @ts-expect-error released resources cannot report retained identities
    void result.remaining
  } else {
    void result.diagnosticId
    void result.remaining
  }
}

// Public protocol snapshots are immutable. Runtime providers still have to
// recognize their own candidates and generations; readonly/brands are not authorization.
// @ts-expect-error exact factory generations are immutable snapshots
binding.generation = opaqueId
// @ts-expect-error an attachment cannot be redirected to another Session
attachment.session = session
// @ts-expect-error a WorkPermit cannot be rebound to another Run
workPermit.run = run

void [
  access,
  accessRequest,
  agent,
  definition,
  driver,
  factory,
  frame,
  owner,
  permit,
  requirement,
  resource,
  selection,
  sessionAttachment,
  checkIsExclusive,
  releaseIsExclusive,
]
