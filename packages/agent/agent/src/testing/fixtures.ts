// Scripted doubles of the Agent ports that the generic implementation consumes, apart from the
// Journal, the clock and the Tool runtime. Each double gives the port and one `Script` per method.
// A double does not implement the semantics of its port: it answers what the test scripted, or its
// default. Four doubles default to a success, because almost every path of a test passes through
// them and the test would otherwise script the same answer each time: access answers `allowed`,
// admission `allow`, handoff `accepted`, and `prepare` a `ready` preparation; model context reads
// `full` for the same reason. Each such default is visible in the `calls` log of its script. The
// other doubles answer `unavailable` until scripted (selection, adoptions and conditions outside
// their tables, extensions, cards, materials and reads; `derive` and `resume` answer
// `unsupported`), so an unscripted path there cannot look like a success.
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
  Evidence,
  ExtensionImplementations,
  Failure,
  HandoffResult,
  MessageHandoff,
  ModelContextReader,
  ModelSelection,
  RegisteredReads,
  RequestPreparation,
  RuntimeConditions,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { scriptedMethod, type In, type Out, type ScriptOf } from './script.ts'

/** The owner name of every evidence and adoption that a double mints. */
export const TEST_OWNER = 'agent-testing'

/** An evidence value that a double mints for a test. It proves nothing outside the test. */
export function testEvidence(record: string): Evidence {
  return { owner: TEST_OWNER, record, revision: '1', digest: `test:${record}` }
}

/**
 * An adoption value that a double mints for a test. It names no real artifact. Its digest is the
 * SHA-256 of the name in lowercase hex, the form that the Model contract's request judgment
 * requires, so an adoption from here can stand in a fixed Model request.
 */
export function testAdoption(name: string): Adoption {
  return {
    owner: TEST_OWNER,
    name,
    revision: '1',
    digest: createHash('sha256').update(name).digest('hex'),
  }
}

/** The failure of a port whose answer the test did not script. */
export function notScripted(owner: string): Failure {
  return { kind: 'unavailable', owner, diagnostic: `${owner} has no scripted answer` }
}

function unavailable(owner: string): () => Outcome<never, Failure> {
  return () => fail(notScripted(owner))
}

// ---------------------------------------------------------------------------------------------
// Access, admission and message handoff

export type ScriptedAccessCheck<P> = Readonly<{
  port: AgentAccessCheck<P>
  /** Default: `allowed`, with a test evidence. */
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
  /** Default: `allow`, with a test evidence. */
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
  /** Default: `accepted`, with a test admission evidence. */
  accept: ScriptOf<MessageHandoff<P>['accept']>
}>

export function createScriptedMessageHandoff<P>(): ScriptedMessageHandoff<P> {
  const accept = scriptedMethod<In<MessageHandoff<P>['accept']>, Outcome<HandoffResult, Failure>>(
    input => succeed({ kind: 'accepted', admission: testEvidence(`handoff/${input.operation}`) }),
  )
  return { port: { accept: accept.call }, accept: accept.script }
}

// ---------------------------------------------------------------------------------------------
// Request preparation, model selection and model context

export type ScriptedRequestPreparation<P> = Readonly<{
  port: RequestPreparation<P>
  /** Default: assembled on the first prepare, ready when previous is present (#558 S-11). */
  prepare: ScriptOf<RequestPreparation<P>['prepare']>
  /** Default: `unsupported`. */
  derive: ScriptOf<RequestPreparation<P>['derive']>
  /** Default: `unsupported`. */
  resume: ScriptOf<RequestPreparation<P>['resume']>
}>

type PrepareInput<P> = In<RequestPreparation<P>['prepare']>
type ReadyPreparation = Extract<
  Extract<Out<RequestPreparation<unknown>['prepare']>, { ok: unknown }>['ok'],
  { kind: 'ready' }
>

/**
 * The `ready` preparation of the default `prepare`: one test supplier for the selected profile, the
 * selected parameters, no system blocks, messages or tools, and a fixed result capacity. It carries
 * the action, purpose, position, recipient and coverage of the input, so a test can tell which call
 * it answers. It is a well-formed value, not a request that a real model would accept.
 */
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
          recipient: input.selection.recipient.route,
          model: 'test-model',
          credential: { kind: 'factory' },
        },
      ],
      fallback: false,
      retryPolicy: testAdoption('retry-policy'),
      parameters: input.selection.parameters,
      system: [],
      messages: [],
      tools: [],
      toolChoice: 'auto',
      representation: testAdoption('representation'),
      parameterAdoptions: [],
      source: testAdoption('request-source'),
    },
    capacity: { bytes: '1048576', blocks: '1024', attachmentBytes: '0' },
    budget: testEvidence(`budget/${input.action}`),
    recipient: input.selection.recipient,
    coverage: input.context.coverage,
  }
}

export function createScriptedRequestPreparation<P>(): ScriptedRequestPreparation<P> {
  const prepare = scriptedMethod<PrepareInput<P>, Out<RequestPreparation<P>['prepare']>>(input => {
    const { request, capacity, ...common } = readyPreparation(input)
    if (input.previous !== null) return succeed({ ...common, kind: 'ready', request, capacity })
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
  /** Default: `unavailable`. A selected model carries a resolved profile that only the test knows. */
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
  /** Default: a `full` read for the recipient of the input, with test evidences. */
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

// ---------------------------------------------------------------------------------------------
// Adoptions and current conditions: tables looked up by exact key

type Resolution = Extract<Out<AgentAdoptions<unknown>['resolve']>, { ok: unknown }>['ok']

export type TableAdoptions<P> = Readonly<{
  port: AgentAdoptions<P>
  /** Puts one exact adoption in the table. A later call for the same adoption replaces it. */
  define(adoption: Adoption, resolution: Resolution): void
  /** Default: the table entry whose four fields equal the input adoption; otherwise `unavailable`. */
  resolve: ScriptOf<AgentAdoptions<P>['resolve']>
  /** Default: `unavailable`. */
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
  /** Puts the current conditions of one execution in the table. */
  define(execution: AgentExecutionId, conditions: RuntimeConditions): void
  /** Default: the table entry of the execution that `advance` names; otherwise `unavailable`. */
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

// ---------------------------------------------------------------------------------------------
// Ports that only some paths need: every method answers `unavailable` until a test scripts it

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
  return {
    port: { preserve: preserve.call, read: read.call },
    preserve: preserve.script,
    read: read.script,
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
