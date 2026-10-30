// The structure judgments of the message admission inputs (SPEC "身份解码与结构判定" and
// "消息准入"): `judgeHandoffPrepare` for the three branches of `MessageHandoff.prepare` and
// `judgeInputOrigin` for the two branches of `InputOrigin`. Both do closed field checks on an
// `unknown` value, refuse a field that does not belong to the branch instead of guessing the branch
// from the fields that do, and give the shape only: they prove neither that a record exists nor
// that a caller is qualified.
import { judgeMessage, type Message } from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AcceptedInput } from './execution.ts'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeExecutionRevision,
  decodeInputId,
  decodePassageId,
  decodeStepId,
  judgeAdoption,
  judgeAuthority,
  judgeEvidence,
  type Adoption,
  type AgentIdentity,
  type DurableEvidence,
  type IdentityFailure,
  type StructureFailure,
} from './identity.ts'
import {
  identityMember,
  ownMembers,
  refusal,
  textMember,
  unknownMember,
  type OwnMembers,
} from './structure.ts'
import type {
  HandoffPosition,
  HandoffPrepare,
  HandoffReference,
  InputEntry,
  InputHandoff,
  InputOrigin,
  InvokeRuntimeContext,
  MessageSource,
  PendingHandoff,
  SubmitDelivery,
} from './passages.ts'

type Judged<T> = Outcome<T, StructureFailure>
type InvokeEntry = Extract<InputEntry, { kind: 'invoke' }>

/** A nested structure judged under its path; a structure-name failure becomes the member itself. */
function nested<T>(
  members: OwnMembers,
  name: string,
  structure: string,
  judge: (value: unknown) => Judged<T>,
): Judged<T> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const judged = judge(members[name])
  if (!('failure' in judged)) return judged
  const { field, reason } = judged.failure
  return refusal(field === structure ? name : `${name}.${field}`, reason)
}

function identityOf<T extends AgentIdentity<string>>(
  members: OwnMembers,
  name: string,
  decode: (value: unknown) => Outcome<T, IdentityFailure>,
): Judged<T> {
  return identityMember(members, name, decode)
}

/** A member that is either `null` or a structure judged by `judge`. */
function nullable<T>(
  members: OwnMembers,
  name: string,
  structure: string,
  judge: (value: unknown) => Judged<T>,
): Judged<T | null> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  if (members[name] === null) return succeed(null)
  return nested(members, name, structure, judge)
}

/** The closed `kind` member: present, a string, and one of the expected literals. */
function kindOf<K extends string>(members: OwnMembers, kinds: readonly K[]): Judged<K> {
  if (!Object.hasOwn(members, 'kind')) return refusal('kind', 'missing')
  const kind = members['kind']
  if (typeof kind !== 'string') return refusal('kind', 'type')
  if (kind.length === 0) return refusal('kind', 'empty')
  if (!kinds.includes(kind as K)) return refusal('kind', 'type')
  return succeed(kind as K)
}

function closed(members: OwnMembers, known: readonly string[]): StructureFailure | undefined {
  const extra = unknownMember(members, known)
  return extra === undefined ? undefined : { field: extra, reason: 'unknown-field' }
}

function judgeMessageMember(members: OwnMembers, name: string): Judged<Message> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const judged = judgeMessage(members[name])
  return 'ok' in judged ? succeed(judged.ok) : refusal(name, 'type')
}

/** A plain object whose inner shape another owner judges (a checkpoint, a result, a transition). */
function plainMember(members: OwnMembers, name: string): Judged<object> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const inner = ownMembers(members[name])
  if (inner === undefined) return refusal(name, 'type')
  return succeed(members[name] as object)
}

const EXECUTION_REFERENCE_FIELDS = ['kind', 'execution', 'operation'] as const
const INPUT_REFERENCE_FIELDS = ['kind', 'execution', 'entry', 'input'] as const

function judgeExecutionReference(
  value: unknown,
): Judged<Extract<HandoffReference, { kind: 'execution' }>> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('HandoffReference', 'type')
  const kind = kindOf(members, ['execution'])
  if ('failure' in kind) return kind
  const execution = identityOf(members, 'execution', decodeAgentExecutionId)
  if ('failure' in execution) return execution
  const operation = identityOf(members, 'operation', decodeAgentOperationId)
  if ('failure' in operation) return operation
  const extra = closed(members, EXECUTION_REFERENCE_FIELDS)
  if (extra !== undefined) return fail(extra)
  return succeed(
    Object.freeze({ kind: 'execution', execution: execution.ok, operation: operation.ok }),
  )
}

function judgeInputReference(value: unknown): Judged<Extract<HandoffReference, { kind: 'input' }>> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('HandoffReference', 'type')
  const kind = kindOf(members, ['input'])
  if ('failure' in kind) return kind
  const execution = identityOf(members, 'execution', decodeAgentExecutionId)
  if ('failure' in execution) return execution
  const entry = identityOf(members, 'entry', decodeAgentOperationId)
  if ('failure' in entry) return entry
  const input = identityOf(members, 'input', decodeInputId)
  if ('failure' in input) return input
  const extra = closed(members, INPUT_REFERENCE_FIELDS)
  if (extra !== undefined) return fail(extra)
  return succeed(
    Object.freeze({ kind: 'input', execution: execution.ok, entry: entry.ok, input: input.ok }),
  )
}

const POSITION_FIELDS = ['step', 'node', 'slot'] as const

function judgePosition(value: unknown): Judged<HandoffPosition> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('HandoffPosition', 'type')
  const step = identityOf(members, 'step', decodeStepId)
  if ('failure' in step) return step
  const node = textMember(members, 'node')
  if ('failure' in node) return node
  if (!Object.hasOwn(members, 'slot')) return refusal('slot', 'missing')
  const slot = members['slot']
  if (slot !== null && typeof slot !== 'string') return refusal('slot', 'type')
  if (slot === '') return refusal('slot', 'empty')
  const extra = closed(members, POSITION_FIELDS)
  if (extra !== undefined) return fail(extra)
  return succeed(Object.freeze({ step: step.ok, node: node.ok, slot }))
}

const INTERNAL_SOURCE_KINDS = [
  'model-reply',
  'tool-result',
  'action-denied',
  'reminder',
  'context-transition',
] as const
type InternalSource = Exclude<MessageSource, { kind: 'external-input' }>

/**
 * An internal message source by its kind. The identities are decoded; the produced result and the
 * transition are plain objects whose inner shape belongs to their own owners.
 */
function judgeInternalSource(value: unknown): Judged<InternalSource> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('MessageSource', 'type')
  const kind = kindOf(members, INTERNAL_SOURCE_KINDS)
  if ('failure' in kind) return kind
  switch (kind.ok) {
    case 'model-reply': {
      const step = identityOf(members, 'step', decodeStepId)
      if ('failure' in step) return step
      const action = identityOf(members, 'action', decodeActionId)
      if ('failure' in action) return action
      const call = textMember(members, 'call')
      if ('failure' in call) return call
      const result = plainMember(members, 'result')
      if ('failure' in result) return result
      const extra = closed(members, ['kind', 'step', 'action', 'call', 'result'])
      if (extra !== undefined) return fail(extra)
      return succeed(copy(value) as InternalSource)
    }
    case 'tool-result': {
      const action = identityOf(members, 'action', decodeActionId)
      if ('failure' in action) return action
      const call = textMember(members, 'call')
      if ('failure' in call) return call
      const result = plainMember(members, 'result')
      if ('failure' in result) return result
      const extra = closed(members, ['kind', 'action', 'call', 'result'])
      if (extra !== undefined) return fail(extra)
      return succeed(copy(value) as InternalSource)
    }
    case 'action-denied': {
      const action = identityOf(members, 'action', decodeActionId)
      if ('failure' in action) return action
      const evidence = nested(members, 'evidence', 'Evidence', judgeEvidence)
      if ('failure' in evidence) return evidence
      const extra = closed(members, ['kind', 'action', 'evidence'])
      if (extra !== undefined) return fail(extra)
      return succeed(copy(value) as InternalSource)
    }
    case 'reminder': {
      const passage = identityOf(members, 'passage', decodePassageId)
      if ('failure' in passage) return passage
      const extra = closed(members, ['kind', 'passage'])
      if (extra !== undefined) return fail(extra)
      return succeed(copy(value) as InternalSource)
    }
    case 'context-transition': {
      const transition = plainMember(members, 'transition')
      if ('failure' in transition) return transition
      const extra = closed(members, ['kind', 'transition'])
      if (extra !== undefined) return fail(extra)
      return succeed(copy(value) as InternalSource)
    }
  }
}

function judgeExternalSource(
  value: unknown,
): Judged<Extract<MessageSource, { kind: 'external-input' }>> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('MessageSource', 'type')
  const kind = kindOf(members, ['external-input'])
  if ('failure' in kind) return kind
  const input = identityOf(members, 'input', decodeInputId)
  if ('failure' in input) return input
  const extra = closed(members, ['kind', 'input'])
  if (extra !== undefined) return fail(extra)
  return succeed(Object.freeze({ kind: 'external-input', input: input.ok }))
}

const PENDING_FIELDS = [
  'kind',
  'reference',
  'predecessor',
  'position',
  'source',
  'candidate',
  'originalAdvance',
  'predecessorHandoff',
] as const

function judgePendingHandoff(value: unknown): Judged<PendingHandoff> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('PendingHandoff', 'type')
  const kind = kindOf(members, ['execution'])
  if ('failure' in kind) return kind
  const reference = nested(members, 'reference', 'HandoffReference', judgeExecutionReference)
  if ('failure' in reference) return reference
  const predecessor = identityOf(members, 'predecessor', decodeExecutionRevision)
  if ('failure' in predecessor) return predecessor
  const position = nested(members, 'position', 'HandoffPosition', judgePosition)
  if ('failure' in position) return position
  const source = nested(members, 'source', 'MessageSource', judgeInternalSource)
  if ('failure' in source) return source
  const candidate = judgeMessageMember(members, 'candidate')
  if ('failure' in candidate) return candidate
  const advance = nested(members, 'originalAdvance', 'Authority', judgeAuthority)
  if ('failure' in advance) return advance
  const predecessorHandoff = nullable(
    members,
    'predecessorHandoff',
    'HandoffReference',
    judgeExecutionReference,
  )
  if ('failure' in predecessorHandoff) return predecessorHandoff
  const extra = closed(members, PENDING_FIELDS)
  if (extra !== undefined) return fail(extra)
  return succeed(
    Object.freeze({
      kind: 'execution',
      reference: reference.ok,
      predecessor: predecessor.ok,
      position: position.ok,
      source: source.ok,
      candidate: candidate.ok,
      originalAdvance: advance.ok,
      predecessorHandoff: predecessorHandoff.ok,
    }),
  )
}

const ACCEPTED_INPUT_FIELDS = ['id', 'content', 'source', 'priority'] as const

function judgeAcceptedInput(value: unknown): Judged<AcceptedInput> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('AcceptedInput', 'type')
  const id = identityOf(members, 'id', decodeInputId)
  if ('failure' in id) return id
  const content = judgeMessageMember(members, 'content')
  if ('failure' in content) return content
  const source = nullable(members, 'source', 'Evidence', judgeEvidence)
  if ('failure' in source) return source
  const priority = textMember(members, 'priority')
  if ('failure' in priority) return priority
  if (priority.ok !== 'ordinary' && priority.ok !== 'urgent') return refusal('priority', 'type')
  const extra = closed(members, ACCEPTED_INPUT_FIELDS)
  if (extra !== undefined) return fail(extra)
  return succeed(
    Object.freeze({ id: id.ok, content: content.ok, source: source.ok, priority: priority.ok }),
  )
}

function judgeInputEntry(value: unknown): Judged<InputEntry> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('InputEntry', 'type')
  const kind = kindOf(members, ['invoke', 'submit'])
  if ('failure' in kind) return kind
  const operation = identityOf(members, 'operation', decodeAgentOperationId)
  if ('failure' in operation) return operation
  const execution = identityOf(members, 'execution', decodeAgentExecutionId)
  if ('failure' in execution) return execution
  if (kind.ok === 'invoke') {
    const initial = nested(members, 'initial', 'AcceptedInput', judgeAcceptedInput)
    if ('failure' in initial) return initial
    const checkpoint = plainMember(members, 'checkpoint')
    if ('failure' in checkpoint) return checkpoint
    const extra = closed(members, ['kind', 'operation', 'execution', 'initial', 'checkpoint'])
    if (extra !== undefined) return fail(extra)
    return succeed(
      Object.freeze({
        kind: 'invoke',
        operation: operation.ok,
        execution: execution.ok,
        initial: initial.ok,
        checkpoint: copy(checkpoint.ok) as InvokeEntry['checkpoint'],
      }),
    )
  }
  const entryValue = nested(members, 'value', 'AcceptedInput', judgeAcceptedInput)
  if ('failure' in entryValue) return entryValue
  const extra = closed(members, ['kind', 'operation', 'execution', 'value'])
  if (extra !== undefined) return fail(extra)
  return succeed(
    Object.freeze({
      kind: 'submit',
      operation: operation.ok,
      execution: execution.ok,
      value: entryValue.ok,
    }),
  )
}

const INPUT_HANDOFF_FIELDS = ['kind', 'reference', 'entry', 'source'] as const

/**
 * An external request, with the cross-check of its three parts: the reference names the entry's
 * execution and operation, and the source names the entry's input.
 */
function judgeInputHandoff(value: unknown): Judged<InputHandoff> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('InputHandoff', 'type')
  const kind = kindOf(members, ['input'])
  if ('failure' in kind) return kind
  const reference = nested(members, 'reference', 'HandoffReference', judgeInputReference)
  if ('failure' in reference) return reference
  const entry = nested(members, 'entry', 'InputEntry', judgeInputEntry)
  if ('failure' in entry) return entry
  const source = nested(members, 'source', 'MessageSource', judgeExternalSource)
  if ('failure' in source) return source
  const extra = closed(members, INPUT_HANDOFF_FIELDS)
  if (extra !== undefined) return fail(extra)
  const accepted = entry.ok.kind === 'invoke' ? entry.ok.initial : entry.ok.value
  if (reference.ok.execution !== entry.ok.execution)
    return refusal('reference.execution', 'identity')
  if (reference.ok.entry !== entry.ok.operation) return refusal('reference.entry', 'identity')
  if (reference.ok.input !== accepted.id) return refusal('reference.input', 'identity')
  if (source.ok.input !== accepted.id) return refusal('source.input', 'identity')
  return succeed(
    Object.freeze({ kind: 'input', reference: reference.ok, entry: entry.ok, source: source.ok }),
  )
}

const RUNTIME_FIELDS = ['instance', 'scope', 'definition', 'grant'] as const

function judgeRuntimeContext(value: unknown): Judged<InvokeRuntimeContext> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('InvokeRuntimeContext', 'type')
  const binding = judgeBinding(members)
  if ('failure' in binding) return binding
  const extra = closed(members, RUNTIME_FIELDS)
  if (extra !== undefined) return fail(extra)
  return succeed(Object.freeze(binding.ok))
}

/** The instance, scope, definition and grant members that the runtime context and the invoke origin share. */
function judgeBinding(members: OwnMembers): Judged<{
  instance: InvokeRuntimeContext['instance']
  scope: DurableEvidence
  definition: Adoption
  grant: DurableEvidence | null
}> {
  const instance = identityOf(members, 'instance', decodeAgentInstanceId)
  if ('failure' in instance) return instance
  const scope = nested(members, 'scope', 'Evidence', judgeEvidence)
  if ('failure' in scope) return scope
  const definition = nested(members, 'definition', 'Adoption', judgeAdoption)
  if ('failure' in definition) return definition
  const grant = nullable(members, 'grant', 'Evidence', judgeEvidence)
  if ('failure' in grant) return grant
  return succeed({
    instance: instance.ok,
    scope: scope.ok,
    definition: definition.ok,
    grant: grant.ok,
  })
}

/**
 * Judges the structure of a `HandoffPrepare`: the branch by `kind`, then exactly the members of
 * that branch. A member of another branch is `unknown-field`; the branch is never guessed from the
 * members. Nested failures carry the path of the member (`request.reference.operation`). The
 * success value is a frozen new value. The judgment gives the shape only.
 */
export function judgeHandoffPrepare(value: unknown): Judged<HandoffPrepare> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('HandoffPrepare', 'type')
  const kind = kindOf(members, ['execution', 'invoke', 'submit'])
  if ('failure' in kind) return kind
  switch (kind.ok) {
    case 'execution': {
      const request = nested(members, 'request', 'PendingHandoff', judgePendingHandoff)
      if ('failure' in request) return request
      const advance = nested(members, 'advance', 'Authority', judgeAuthority)
      if ('failure' in advance) return advance
      const extra = closed(members, ['kind', 'request', 'advance'])
      if (extra !== undefined) return fail(extra)
      return succeed(Object.freeze({ kind: 'execution', request: request.ok, advance: advance.ok }))
    }
    case 'invoke': {
      const request = nested(members, 'request', 'InputHandoff', judgeInputHandoff)
      if ('failure' in request) return request
      const runtime = nested(members, 'runtime', 'InvokeRuntimeContext', judgeRuntimeContext)
      if ('failure' in runtime) return runtime
      const extra = closed(members, ['kind', 'request', 'runtime'])
      if (extra !== undefined) return fail(extra)
      return succeed(Object.freeze({ kind: 'invoke', request: request.ok, runtime: runtime.ok }))
    }
    case 'submit': {
      const request = nested(members, 'request', 'InputHandoff', judgeInputHandoff)
      if ('failure' in request) return request
      const extra = closed(members, ['kind', 'request'])
      if (extra !== undefined) return fail(extra)
      return succeed(Object.freeze({ kind: 'submit', request: request.ok }))
    }
  }
}

function judgeDelivery(value: unknown): Judged<SubmitDelivery> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('SubmitDelivery', 'type')
  const kind = kindOf(members, ['runtime-view', 'durable-view'])
  if ('failure' in kind) return kind
  if (kind.ok === 'durable-view') {
    const extra = closed(members, ['kind'])
    if (extra !== undefined) return fail(extra)
    return succeed(Object.freeze({ kind: 'durable-view' }))
  }
  const instance = identityOf(members, 'instance', decodeAgentInstanceId)
  if ('failure' in instance) return instance
  const extra = closed(members, ['kind', 'instance'])
  if (extra !== undefined) return fail(extra)
  return succeed(Object.freeze({ kind: 'runtime-view', instance: instance.ok }))
}

/**
 * Judges the structure of an `InputOrigin`: the invoke branch with the runtime binding of that
 * time, or the submit branch with the execution binding reference and the delivery route. A
 * member of the other branch is `unknown-field`. The success value is a frozen new value. The
 * judgment gives the shape only; it does not prove that the provider wrote it.
 */
export function judgeInputOrigin(value: unknown): Judged<InputOrigin> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('InputOrigin', 'type')
  const kind = kindOf(members, ['invoke', 'submit'])
  if ('failure' in kind) return kind
  if (kind.ok === 'invoke') {
    const binding = judgeBinding(members)
    if ('failure' in binding) return binding
    const extra = closed(members, ['kind', ...RUNTIME_FIELDS])
    if (extra !== undefined) return fail(extra)
    return succeed(Object.freeze({ kind: 'invoke', ...binding.ok }))
  }
  const executionBinding = nested(members, 'executionBinding', 'Evidence', judgeEvidence)
  if ('failure' in executionBinding) return executionBinding
  const delivery = nested(members, 'delivery', 'SubmitDelivery', judgeDelivery)
  if ('failure' in delivery) return delivery
  const extra = closed(members, ['kind', 'executionBinding', 'delivery'])
  if (extra !== undefined) return fail(extra)
  return succeed(
    Object.freeze({ kind: 'submit', executionBinding: executionBinding.ok, delivery: delivery.ok }),
  )
}

/** A frozen deep copy of a plain value whose inner shape another owner judges. */
function copy<T>(value: T): T {
  return deepFreeze(structuredClone(value))
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner)
    Object.freeze(value)
  }
  return value
}
