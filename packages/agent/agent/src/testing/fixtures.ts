import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ActionAdmission,
  Adoption,
  AdmissionDecision,
  AgentAccessCheck,
  AgentAccessDecision,
  AgentAdoptions,
  AgentExecutionId,
  AgentMaterials,
  CurrentConditions,
  DecisionCards,
  DurableEvidence,
  ExtensionImplementations,
  Failure,
  HandoffOutcome,
  HandoffPrepare,
  HandoffRequest,
  HandoffResolution,
  InputOrigin,
  MessageHandoff,
  ModelContextReader,
  ModelSelection,
  RegisteredReads,
  RequestPreparation,
  RuntimeConditions,
} from '@omne-harness/agent-contract'
import { decodeProviderName, type ProviderName } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { scriptedMethod, type In, type Out, type ScriptOf } from './script.ts'

export const TEST_OWNER = 'agent-testing'

export function testEvidence(record: string): DurableEvidence {
  return { owner: TEST_OWNER, record, revision: '1', digest: `test:${record}` }
}

export function testAdoption(name: string): Adoption {
  return {
    owner: TEST_OWNER,
    name,
    revision: '1',
    digest: createHash('sha256').update(name).digest('hex'),
  }
}

export function notScripted(owner: string): Failure {
  return { kind: 'unavailable', owner, diagnostic: `${owner} has no scripted answer` }
}

function unavailable(owner: string): () => Outcome<never, Failure> {
  return () => fail(notScripted(owner))
}

export type ScriptedAccessCheck<P> = Readonly<{
  port: AgentAccessCheck<P>
  check: ScriptOf<AgentAccessCheck<P>['check']>
}>

export function createScriptedAccessCheck<P>(): ScriptedAccessCheck<P> {
  const check = scriptedMethod<In<AgentAccessCheck<P>['check']>, AgentAccessDecision>(input => ({
    kind: 'allowed',
    evidence: testEvidence(`access/${input.operation}`),
  }))
  return { port: { check: check.call }, check: check.script }
}

export type ScriptedActionAdmission<P> = Readonly<{
  port: ActionAdmission<P>
  admit: ScriptOf<ActionAdmission<P>['admit']>
}>

export function createScriptedActionAdmission<P>(): ScriptedActionAdmission<P> {
  const admit = scriptedMethod<
    In<ActionAdmission<P>['admit']>,
    Outcome<AdmissionDecision, Failure>
  >(input => succeed({ kind: 'allow', evidence: testEvidence(`admission/${input.action}`) }))
  return { port: { admit: admit.call }, admit: admit.script }
}

export type ScriptedMessageHandoff<P> = Readonly<{
  port: MessageHandoff<P>
  prepare: ScriptOf<MessageHandoff<P>['prepare']>
  lookup: ScriptOf<MessageHandoff<P>['lookup']>
  exclude: ScriptOf<MessageHandoff<P>['exclude']>
}>

type Message = Extract<HandoffOutcome['decision'], { kind: 'prepared' }>['message']

function candidateOf(request: HandoffRequest): Message {
  if (request.kind === 'execution') return request.candidate
  return request.entry.kind === 'invoke'
    ? request.entry.initial.content
    : request.entry.value.content
}

function originOf(input: HandoffPrepare): InputOrigin | null {
  switch (input.kind) {
    case 'execution':
      return null
    case 'invoke':
      return { kind: 'invoke', ...input.runtime }
    case 'submit':
      return {
        kind: 'submit',
        executionBinding: testEvidence(`binding/${input.request.reference.execution}`),
        delivery: { kind: 'durable-view' },
      }
  }
}

function handoffText(request: HandoffRequest): string {
  const reference = request.reference
  return reference.kind === 'execution'
    ? reference.operation
    : `${reference.entry}/${reference.input}`
}

export function createScriptedMessageHandoff<P>(): ScriptedMessageHandoff<P> {
  const prepare = scriptedMethod<
    In<MessageHandoff<P>['prepare']>,
    Outcome<HandoffOutcome, Failure>
  >(input => {
    const { principal: _principal, tenant: _tenant, ...rest } = input
    const request = rest.request
    return succeed({
      request,
      origin: originOf(rest),
      provider: testAdoption('message-handoff'),
      qualification: testEvidence(`qualification/${handoffText(request)}`),
      record: testEvidence(`handoff-record/${handoffText(request)}`),
      decision: {
        kind: 'prepared',
        message: candidateOf(request),
        admission: testEvidence(`handoff/${handoffText(request)}`),
      },
    })
  })
  const lookup = scriptedMethod<
    In<MessageHandoff<P>['lookup']>,
    Outcome<HandoffResolution, Failure>
  >(() => succeed({ kind: 'unknown', original: null }))
  const exclude = scriptedMethod<
    In<MessageHandoff<P>['exclude']>,
    Outcome<HandoffResolution, Failure>
  >(input =>
    succeed({
      kind: 'unknown',
      original: {
        request: input.request,
        origin: null,
        record: testEvidence(`handoff-record/${handoffText(input.request)}`),
      },
    }),
  )
  return {
    port: { prepare: prepare.call, lookup: lookup.call, exclude: exclude.call },
    prepare: prepare.script,
    lookup: lookup.script,
    exclude: exclude.script,
  }
}

export type ScriptedRequestPreparation<P> = Readonly<{
  port: RequestPreparation<P>
  prepare: ScriptOf<RequestPreparation<P>['prepare']>
  derive: ScriptOf<RequestPreparation<P>['derive']>
  resume: ScriptOf<RequestPreparation<P>['resume']>
}>

type PrepareInput<P> = In<RequestPreparation<P>['prepare']>
type ReadyPreparation = Extract<
  Extract<Out<RequestPreparation<unknown>['prepare']>, { ok: unknown }>['ok'],
  { kind: 'ready' }
>

function providerOf(route: string): ProviderName {
  const decoded = decodeProviderName(route)
  if ('failure' in decoded) throw new RangeError(`test route ${route} is not a provider name`)
  return decoded.ok
}

export function readyPreparation<P>(input: PrepareInput<P>): ReadyPreparation {
  const profile = input.selection.recipient.profile
  return {
    kind: 'ready',
    id: input.action,
    purpose: input.purpose,
    position: input.position,
    source: testEvidence(`preparation/${input.action}`),
    state: { kind: 'null' },
    schema: testAdoption('preparation-state'),
    request: {
      profile,
      suppliers: [
        {
          adoption: profile,
          provider: providerOf(input.selection.recipient.route),
          model: 'test-model',
          credential: { layer: 'official' },
        },
      ],
      fallback: false,
      retryPolicy: testAdoption('retry-policy'),
      parameters: input.selection.parameters,
      system: [],
      messages: [],
      tools: [],
      toolChoice: 'auto',
      declarations: [
        {
          produces: `${input.selection.recipient.route}/test-model`,
          accepts: [`${input.selection.recipient.route}/test-model`],
          foreignThinking: 'omit',
        },
      ],
      representation: testAdoption('representation'),
      parameterAdoptions: [],
      source: testAdoption('request-source'),
    },
    budget: testEvidence(`budget/${input.action}`),
    recipient: input.selection.recipient,
    coverage: input.context.coverage,
  }
}

export function createScriptedRequestPreparation<P>(): ScriptedRequestPreparation<P> {
  const prepare = scriptedMethod<PrepareInput<P>, Out<RequestPreparation<P>['prepare']>>(input => {
    const { request, ...common } = readyPreparation(input)
    if (input.previous !== null) return succeed({ ...common, kind: 'ready', request })
    const { system, messages, tools, toolChoice, parameters, representation, source } = request
    return succeed({
      ...common,
      kind: 'assembled',
      input: { system, messages, tools, toolChoice, parameters, representation, source },
    })
  })
  const derive = scriptedMethod<
    In<RequestPreparation<P>['derive']>,
    Out<RequestPreparation<P>['derive']>
  >(() => fail({ kind: 'unsupported' }))
  const resume = scriptedMethod<
    In<RequestPreparation<P>['resume']>,
    Out<RequestPreparation<P>['resume']>
  >(() => fail({ kind: 'unsupported' }))
  return {
    port: { prepare: prepare.call, derive: derive.call, resume: resume.call },
    prepare: prepare.script,
    derive: derive.script,
    resume: resume.script,
  }
}

export type ScriptedModelSelection<P> = Readonly<{
  port: ModelSelection<P>
  select: ScriptOf<ModelSelection<P>['select']>
}>

export function createScriptedModelSelection<P>(): ScriptedModelSelection<P> {
  const select = scriptedMethod<In<ModelSelection<P>['select']>, Out<ModelSelection<P>['select']>>(
    unavailable('agentModelSelection'),
  )
  return { port: { select: select.call }, select: select.script }
}

export type ScriptedModelContext<P> = Readonly<{
  port: ModelContextReader<P>
  read: ScriptOf<ModelContextReader<P>['read']>
}>

export function createScriptedModelContext<P>(): ScriptedModelContext<P> {
  const read = scriptedMethod<
    In<ModelContextReader<P>['read']>,
    Out<ModelContextReader<P>['read']>
  >(input =>
    succeed({
      recipient: input.recipient,
      content: 'full',
      source: testEvidence(`context/${input.position.work}`),
      coverage: testEvidence(`coverage/${input.position.work}`),
    }),
  )
  return { port: { read: read.call }, read: read.script }
}

type Resolution = Extract<Out<AgentAdoptions<unknown>['resolve']>, { ok: unknown }>['ok']

export type TableAdoptions<P> = Readonly<{
  port: AgentAdoptions<P>
  define(adoption: Adoption, resolution: Resolution): void
  resolve: ScriptOf<AgentAdoptions<P>['resolve']>
  handover: ScriptOf<AgentAdoptions<P>['handover']>
}>

function adoptionKey(adoption: Adoption): string {
  return JSON.stringify([adoption.owner, adoption.name, adoption.revision, adoption.digest])
}

export function createTableAdoptions<P>(): TableAdoptions<P> {
  const table = new Map<string, Resolution>()
  const resolve = scriptedMethod<
    In<AgentAdoptions<P>['resolve']>,
    Out<AgentAdoptions<P>['resolve']>
  >(input => {
    const found = table.get(adoptionKey(input.adoption))
    return found === undefined ? fail(notScripted('agentAdoptions')) : succeed(found)
  })
  const handover = scriptedMethod<
    In<AgentAdoptions<P>['handover']>,
    Out<AgentAdoptions<P>['handover']>
  >(unavailable('agentAdoptions'))
  return {
    port: { resolve: resolve.call, handover: handover.call },
    define(adoption, resolution) {
      table.set(adoptionKey(adoption), resolution)
    },
    resolve: resolve.script,
    handover: handover.script,
  }
}

export type TableConditions<P> = Readonly<{
  port: CurrentConditions<P>
  define(execution: AgentExecutionId, conditions: RuntimeConditions): void
  read: ScriptOf<CurrentConditions<P>['read']>
}>

export function createTableConditions<P>(): TableConditions<P> {
  const table = new Map<AgentExecutionId, RuntimeConditions>()
  const read = scriptedMethod<In<CurrentConditions<P>['read']>, Out<CurrentConditions<P>['read']>>(
    input => {
      const found = table.get(input.advance.execution)
      return found === undefined ? fail(notScripted('agentConditions')) : succeed(found)
    },
  )
  return {
    port: { read: read.call },
    define(execution, conditions) {
      table.set(execution, conditions)
    },
    read: read.script,
  }
}

export type ScriptedExtensions<P> = Readonly<{
  port: ExtensionImplementations<P>
  resolve: ScriptOf<ExtensionImplementations<P>['resolve']>
}>

export function createScriptedExtensions<P>(): ScriptedExtensions<P> {
  const resolve = scriptedMethod<
    In<ExtensionImplementations<P>['resolve']>,
    Out<ExtensionImplementations<P>['resolve']>
  >(unavailable('agentExtensions'))
  return { port: { resolve: resolve.call }, resolve: resolve.script }
}

export type ScriptedDecisionCards<P> = Readonly<{
  port: DecisionCards<P>
  present: ScriptOf<DecisionCards<P>['present']>
  lookup: ScriptOf<DecisionCards<P>['lookup']>
  read: ScriptOf<DecisionCards<P>['read']>
  invalidate: ScriptOf<DecisionCards<P>['invalidate']>
}>

export function createScriptedDecisionCards<P>(): ScriptedDecisionCards<P> {
  const present = scriptedMethod<In<DecisionCards<P>['present']>, Out<DecisionCards<P>['present']>>(
    unavailable('agentDecisionCards'),
  )
  const lookup = scriptedMethod<In<DecisionCards<P>['lookup']>, Out<DecisionCards<P>['lookup']>>(
    unavailable('agentDecisionCards'),
  )
  const read = scriptedMethod<In<DecisionCards<P>['read']>, Out<DecisionCards<P>['read']>>(
    unavailable('agentDecisionCards'),
  )
  const invalidate = scriptedMethod<
    In<DecisionCards<P>['invalidate']>,
    Out<DecisionCards<P>['invalidate']>
  >(unavailable('agentDecisionCards'))
  return {
    port: {
      present: present.call,
      lookup: lookup.call,
      read: read.call,
      invalidate: invalidate.call,
    },
    present: present.script,
    lookup: lookup.script,
    read: read.script,
    invalidate: invalidate.script,
  }
}

export type ScriptedMaterials<P> = Readonly<{
  port: AgentMaterials<P, ContentBlock>
  preserve: ScriptOf<AgentMaterials<P, ContentBlock>['preserve']>
  read: ScriptOf<AgentMaterials<P, ContentBlock>['read']>
  describe: ScriptOf<AgentMaterials<P, ContentBlock>['describe']>
}>

export function createScriptedMaterials<P>(): ScriptedMaterials<P> {
  const preserve = scriptedMethod<
    In<AgentMaterials<P, ContentBlock>['preserve']>,
    Out<AgentMaterials<P, ContentBlock>['preserve']>
  >(unavailable('agentMaterials'))
  const read = scriptedMethod<
    In<AgentMaterials<P, ContentBlock>['read']>,
    Out<AgentMaterials<P, ContentBlock>['read']>
  >(unavailable('agentMaterials'))
  const describe = scriptedMethod<
    In<AgentMaterials<P, ContentBlock>['describe']>,
    Out<AgentMaterials<P, ContentBlock>['describe']>
  >(unavailable('agentMaterials'))
  return {
    port: { preserve: preserve.call, read: read.call, describe: describe.call },
    preserve: preserve.script,
    read: read.script,
    describe: describe.script,
  }
}

export type ScriptedReads<P> = Readonly<{
  port: RegisteredReads<P>
  read: ScriptOf<RegisteredReads<P>['read']>
  lookup: ScriptOf<RegisteredReads<P>['lookup']>
}>

export function createScriptedReads<P>(): ScriptedReads<P> {
  const read = scriptedMethod<In<RegisteredReads<P>['read']>, Out<RegisteredReads<P>['read']>>(
    unavailable('agentReads'),
  )
  const lookup = scriptedMethod<
    In<RegisteredReads<P>['lookup']>,
    Out<RegisteredReads<P>['lookup']>
  >(unavailable('agentReads'))
  return {
    port: { read: read.call, lookup: lookup.call },
    read: read.script,
    lookup: lookup.script,
  }
}
