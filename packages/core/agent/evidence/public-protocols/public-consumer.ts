import type {
  ActivationPermit,
  Attachment,
  CheckResult,
  Driver,
  Factory,
  FactoryPreparation,
  ManagedReleaseResult,
  QuiescenceResult,
  ResourcePinResult,
  RuntimeAccess,
  RuntimeAccessPreparation,
  RuntimeAccessRequest,
  RuntimeOwner,
  RuntimeResource,
  RuntimeResourceBinding,
  RuntimeResourcePreparation,
  SessionAttachment,
  WorkPermit,
} from '@omne-harness-lite/agent'

type GateFrame = Parameters<RuntimeAccess['check']>[0]
type ExactUse = Extract<ResourcePinResult, { status: 'pinned' }>['use']
type UseBinding = Extract<ManagedReleaseResult, { status: 'retained' }>['remaining'][number]
type SessionRef = RuntimeAccessRequest['session']
type AgentRef = RuntimeAccessRequest['agent']
type OpaqueId = RuntimeResourceBinding['generation']

declare const frame: GateFrame
declare const accessCandidate: RuntimeAccessPreparation
declare const attachment: Attachment
declare const factoryCandidate: FactoryPreparation
declare const resourceCandidate: RuntimeResourcePreparation
declare const permit: ActivationPermit
declare const workPermit: WorkPermit
declare const exactUse: ExactUse
declare const session: SessionRef
declare const agent: AgentRef
declare const resourceBinding: RuntimeResourceBinding
declare const remaining: readonly UseBinding[]
declare const diagnosticId: OpaqueId

const request: RuntimeAccessRequest = Object.freeze({
  session,
  agent,
  operation: 'session.activate',
})

const access = {
  async prepare(input: RuntimeAccessRequest) {
    void input
    return { status: 'prepared' as const, value: accessCandidate }
  },
  check(active: GateFrame, candidate: RuntimeAccessPreparation, input: RuntimeAccessRequest) {
    void active
    void candidate
    void input
    return { status: 'ready' as const }
  },
} satisfies RuntimeAccess

const owner = {
  registerAttempt(active: GateFrame, attempt: Parameters<RuntimeOwner['registerAttempt']>[1]) {
    void active
    void attempt
    return { status: 'registered' as const }
  },
  closeAdmission(active: GateFrame, reason: Parameters<RuntimeOwner['closeAdmission']>[1]) {
    void active
    void reason
    return undefined
  },
} satisfies RuntimeOwner

const attachments = {
  async prepare(input: Parameters<SessionAttachment['prepare']>[0]) {
    void input
    return { status: 'prepared' as const, value: attachment }
  },
  checkActivation(active: GateFrame, current: Attachment, activation: ActivationPermit) {
    void active
    void current
    void activation
    return { status: 'ready' as const }
  },
  inspect(current: Attachment) {
    return { status: 'held' as const, attachment: current }
  },
  async release(current: Attachment): Promise<ManagedReleaseResult> {
    void current
    return { status: 'released' }
  },
} satisfies SessionAttachment

const driver = {
  requestRetire(reason: Parameters<Driver['requestRetire']>[0]) {
    void reason
    return undefined
  },
  async awaitQuiescent(): Promise<QuiescenceResult> {
    return { status: 'blocked', diagnosticId, remaining }
  },
  async releaseResources(): Promise<ManagedReleaseResult> {
    return { status: 'retained', diagnosticId, remaining }
  },
} satisfies Driver

const resource = {
  binding: resourceBinding,
  async prepare(input: Parameters<RuntimeResource['prepare']>[0]) {
    void input
    return { status: 'prepared' as const, value: resourceCandidate }
  },
  check(active: GateFrame, prepared: RuntimeResourcePreparation, activation: ActivationPermit) {
    void active
    void prepared
    void activation
    return { status: 'ready' as const }
  },
  pin(active: GateFrame, prepared: RuntimeResourcePreparation, activation: ActivationPermit) {
    void active
    void prepared
    void activation
    return { status: 'pinned' as const, use: exactUse }
  },
  retire(active: GateFrame, reason: Parameters<RuntimeResource['retire']>[1]) {
    void active
    void reason
    return undefined
  },
} satisfies RuntimeResource

const factory = {
  async prepare(input: Parameters<Factory['prepare']>[0]) {
    void input
    return { status: 'prepared' as const, value: factoryCandidate }
  },
  check(active: GateFrame, prepared: FactoryPreparation, activation: ActivationPermit) {
    void active
    void prepared
    void activation
    return { status: 'ready' as const }
  },
} satisfies Factory

function checkResultIsExclusive(result: CheckResult): void {
  if (result.status === 'ready') {
    // @ts-expect-error a ready check cannot carry a denial code
    void result.code
  } else if (result.status === 'unavailable') {
    void result.owner
    void result.code
  }
}

function releaseResultIsExclusive(result: ManagedReleaseResult): void {
  if (result.status === 'released') {
    // @ts-expect-error released resources cannot report retained bindings
    void result.remaining
  } else {
    void result.diagnosticId
    void result.remaining
  }
}

// @ts-expect-error exact attachment identity is immutable
attachment.session = session
// @ts-expect-error exact WorkPermit binding is immutable
workPermit.agent = agent

void [access, attachments, driver, factory, owner, request, resource]
void checkResultIsExclusive
void releaseResultIsExclusive
