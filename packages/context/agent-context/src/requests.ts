// agentRequests (AG-12): prepares, derives and resumes a model request through Request Context.
// It translates each port call into one assembly call and the group values of that call, registers
// the source set of a target on the first call for that target, and translates the outcome back.
// It does not select a model, decide on compaction, keep plan progress for Agent or commit a
// transition (request-context-contract docs/context.md, "适配方案").
import type {
  CompactionAdvance,
  CompactionProgress,
  Failure,
  Preparation,
  PreparedContextTransition,
  RequestPreparation,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { parseRecordEntryRef, type RecordEntryRef } from '@omne-harness/message'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeBatchRef,
  decodeCandidateRef,
  decodePassageRef,
  decodePositionRef,
  type Access,
  type Adoption,
  type AssemblyCall,
  type AssemblyOperations,
  type AssemblyResult,
  type ContextRegistration,
  type ContextSourceRegistry,
  type ContextTarget,
  type ConversionResultSource,
  type PassageRef,
  type PlanProgress,
  type PlanResult,
  type RequestCandidate,
  type SourceSettlement,
  type StepRequest,
  type StepResult,
} from '@omne-harness/request-context-contract'
import type { ContextHolderParts } from '@omne-harness/request-context-cordis-contract'
import type { ModelRequestPreparation } from './translate.ts'
import type { ContextMaterials, Place, PlanMaterial, ReadMaterial } from './materials.ts'
import { canonical, digest, tenantText } from './records.ts'
import { createStaging, type StagedGroups } from './staging.ts'
import {
  failureOfAssembly,
  failureOfModel,
  failureOfRead,
  jsonOf,
  selectedModel,
  unavailable,
  type StepResultSource,
  type ToolsSource,
} from './translate.ts'

export type AgentRequestsOptions<P> = Readonly<{
  materials: ContextMaterials<P>
  /** The leased holder parts (K-RQ): they enter every source set this adapter registers. */
  parts: ContextHolderParts<P>
  /** The registration face and the operation groups of Request Context. */
  requestContext: Pick<ContextSourceRegistry<P>, 'register' | 'assembly'>
  /** The Model preparation resources (X-3) that every registered source set lends. */
  preparation: M.ModelPreparationResources<P>
  conversions: ConversionResultSource<P>
  /** The Model request preparation that fixes a candidate or a summary step. */
  model: ModelRequestPreparation<P>
  /** The result capacity that a ready preparation carries. */
  resultCapacity: M.ResultCapacity
  tools: ToolsSource<P>
  stepResults: StepResultSource<P>
}>

export type AgentRequests<P> = RequestPreparation<P> &
  Readonly<{
    /**
     * Withdraws every registration and refuses new calls. Ends after every withdrawn generation has
     * settled; this is the settlement the holder pulls when the lease ends.
     */
    close(): Promise<SourceSettlement>
  }>

type Answer<T> = Readonly<{ ok: T }> | Readonly<{ failure: Failure }>
type Candidate = Extract<AssemblyResult, { candidate: RequestCandidate }>['candidate']
type Original = Extract<Preparation, { kind: 'needs-compaction' }>
type Ready = Extract<Preparation, { kind: 'ready' }>
type Common = Pick<Preparation, 'id' | 'purpose' | 'position' | 'source' | 'state' | 'schema'>

let generations = 0

const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })
const denied = (action: string): Failure => ({ kind: 'denied', action })
const settledAll = (settlements: readonly SourceSettlement[]): SourceSettlement => {
  const outstanding = settlements.flatMap(item =>
    item.kind === 'unavailable' ? item.outstanding : [],
  )
  return outstanding.length === 0 ? { kind: 'settled' } : { kind: 'unavailable', outstanding }
}

export function createAgentRequests<P>(options: AgentRequestsOptions<P>): AgentRequests<P> {
  const { materials, parts, requestContext, model, resultCapacity } = options
  const owner: Adoption = materials.owner
  const staging = createStaging<P>()
  const registrations = new Map<string, Promise<Answer<ContextRegistration>>>()
  let closed = false

  async function register(
    access: Access<P>,
    target: ContextTarget,
  ): Promise<Answer<ContextRegistration>> {
    const generation = `agent-context-${++generations}`
    let result
    try {
      result = await requestContext.register({
        access,
        target,
        owner,
        sources: {
          groups: staging.sources(generation),
          adopted: parts.adopted,
          history: parts.history,
          conversions: options.conversions,
          eligibility: parts.eligibility,
          preparation: options.preparation,
        },
      })
    } catch {
      return { failure: unavailable('source-registration-failed') }
    }
    switch (result.kind) {
      case 'registered':
        return { ok: result.handle }
      case 'denied':
        return { failure: unavailable('source-registration-denied') }
      case 'conflict':
        return { failure: unavailable('source-set-conflict') }
      case 'unknown':
        return { failure: unavailable('source-registration-unknown') }
      case 'invalid':
        return { failure: invalid(result.field, result.reason) }
      case 'unavailable':
        return { failure: unavailable(result.diagnostic, 'request-context') }
    }
  }

  /** Registers the source set of a target once; a refused registration is asked again next time. */
  async function registered(access: Access<P>, target: ContextTarget): Promise<Failure | null> {
    const name = `${tenantText(target.tenant)}|${target.scope.ref}`
    let pending = registrations.get(name)
    if (pending === undefined) {
      pending = register(access, target)
      registrations.set(name, pending)
    }
    const result = await pending
    if ('ok' in result) return closed ? unavailable('agent-context-closed') : null
    if (registrations.get(name) === pending) registrations.delete(name)
    return result.failure
  }

  /** Runs one Request Context call with the staged values of the call and removes them after. */
  async function staged<T>(
    access: Access<P>,
    target: ContextTarget,
    call: AssemblyCall<P>,
    groups: StagedGroups<P>,
    run: (operations: AssemblyOperations<P>) => Promise<Answer<T>>,
  ): Promise<Answer<T>> {
    const release = staging.stage(access.tenant, call.candidate, groups)
    if (release === null) return { failure: unavailable('call-input-busy') }
    try {
      const refused = await registered(access, target)
      if (refused !== null) return { failure: refused }
      return await run(requestContext.assembly(target))
    } catch {
      return { failure: unavailable('request-context-failed', 'request-context') }
    } finally {
      release()
    }
  }

  /** Resolves `context.source` to the read it names, checking owner and tenant first. */
  function readOf(
    evidence: Preparation['source'],
    tenant: string,
    action: string,
  ): Answer<ReadMaterial> {
    const key = materials.key(evidence)
    if (key === null) return { failure: invalid('context.source', 'foreign-evidence') }
    if (key.tenant !== tenant) return { failure: denied(action) }
    const material = materials.read(evidence)
    return material === undefined
      ? { failure: unavailable('context-material-lost') }
      : { ok: material }
  }

  /** Resolves the plan evidence of a needs-compaction preparation to the plan it entered. */
  function planOf(original: Original, tenant: string, action: string): Answer<PlanMaterial<P>> {
    const key = materials.key(original.progress.plan)
    if (key === null) return { failure: invalid('original.progress.plan', 'foreign-evidence') }
    if (key.tenant !== tenant) return { failure: denied(action) }
    const material = materials.plan(original.progress.plan)
    return material === undefined
      ? { failure: unavailable('compaction-plan-lost') }
      : { ok: material }
  }

  function common(
    input: Readonly<{ action: Preparation['id']; position: Preparation['position'] }>,
    purpose: Preparation['purpose'],
    place: Place,
    content: unknown,
  ): Common {
    return {
      id: input.action,
      purpose,
      position: input.position,
      source: materials.mint('preparation', place, content),
      state: { kind: 'null' },
      schema: owner,
    }
  }

  /** Fixes one assembled input through Model: a candidate, or a summary step. */
  async function fix(
    access: Access<P>,
    profile: M.ModelProfile,
    required: M.ModalityRequirement,
    assembled: M.AssembledModelInput,
  ): Promise<Answer<M.FixedModelRequest>> {
    let prepared
    try {
      prepared = await model.prepare({ ...access, profile, required, assembled })
    } catch {
      return {
        failure: unavailable('model-request-preparation-failed', 'model-request-preparation'),
      }
    }
    return 'ok' in prepared ? { ok: prepared.ok } : { failure: failureOfModel(prepared.failure) }
  }

  type Outcome = Readonly<{
    access: Access<P>
    input: Readonly<{
      action: Preparation['id']
      position: Preparation['position']
      selection: Parameters<RequestPreparation<P>['prepare']>[0]['selection']
    }>
    purpose: Preparation['purpose']
    place: Place
  }>

  /** The assembled or ready preparation of one candidate. */
  async function candidateOf(
    outcome: Outcome,
    candidate: Candidate,
    fixable: boolean,
  ): Promise<Answer<Preparation>> {
    const { access, input, purpose, place } = outcome
    const coverage = materials.mint('coverage', place, candidate.coverage)
    const shared = {
      ...common(input, purpose, place, { candidate: candidate.candidate, fixable }),
      budget: materials.mint('budget', place, candidate.verdict.report),
      recipient: input.selection.recipient,
      coverage,
    }
    if (!fixable) return { ok: { ...shared, kind: 'assembled', input: candidate.assembled } }
    const required = candidate.modality ?? { modalities: ['text'], source: coverage }
    const request = await fix(
      access,
      input.selection.resolution.profile,
      required,
      candidate.assembled,
    )
    if ('failure' in request) return request
    return {
      ok: { ...shared, kind: 'ready', request: request.ok, capacity: resultCapacity },
    }
  }

  /** The preparation of an assembly outcome; `plan` runs when compaction is needed. */
  async function preparationOf(
    outcome: Outcome,
    result: AssemblyResult,
    compaction: () => Promise<Answer<Preparation>>,
  ): Promise<Answer<Preparation>> {
    switch (result.kind) {
      case 'candidate-before-extension':
        return candidateOf(outcome, result.candidate, false)
      case 'candidate-fixable':
        return candidateOf(outcome, result.candidate, true)
      case 'needs-compaction':
        return compaction()
      case 'cannot-fit':
        return {
          ok: {
            ...common(outcome.input, outcome.purpose, outcome.place, result.coverage),
            kind: 'cannot-fit',
            reason: result.reason === 'fixed-part-over-limit' ? 'fixed' : 'after-compaction',
            diagnostic: result.diagnostic,
          },
        }
      default:
        return { failure: failureOfAssembly(result) }
    }
  }

  /** Translates the port input of `prepare` into the call and the group values of that call. */
  async function groupsOf(
    input: Parameters<RequestPreparation<P>['prepare']>[0],
    tenant: string,
    read: ReadMaterial,
    history: ReadMaterial['history'],
  ): Promise<Answer<StagedGroups<P>>> {
    const target = history.target
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const batch = decodeBatchRef(input.inputs.id)
    if ('failure' in batch) return { failure: invalid('inputs.id', batch.failure.reason) }
    const entries: RecordEntryRef[] = []
    for (const id of input.inputs.ordered) {
      const entry = parseRecordEntryRef(id)
      if (entry === null) return { failure: invalid('inputs.ordered', 'empty') }
      entries.push(entry)
    }
    let passages: PassageRef[] | null = null
    if (input.beforeModelCall !== null) {
      passages = []
      for (const id of input.beforeModelCall) {
        const passage = decodePassageRef(id)
        if ('failure' in passage) return { failure: invalid('beforeModelCall', 'passage') }
        passages.push(passage.ok)
      }
    }
    let previous = null
    if (input.previous !== null) {
      const candidate = decodeCandidateRef(input.previous.id)
      if ('failure' in candidate) return { failure: invalid('previous.id', 'candidate') }
      let entered = null
      if (input.previous.kind === 'needs-compaction') {
        const plan = planOf(input.previous, tenant, 'prepare')
        if ('failure' in plan) return plan
        entered = plan.ok.plan.planId
      }
      previous = { candidate: candidate.ok, enteredCompaction: entered }
    }
    return {
      ok: {
        history: {
          kind: 'value',
          value: {
            evidence: history,
            inputs: { batch: batch.ok, entries, saved: input.inputs.watermark },
          },
        },
        context: { kind: 'value', value: { contextRead: read.group, transition: null } },
        prompt: {
          kind: 'value',
          value: {
            promptContributions: null,
            assembleContext: { scope: target.scope, definition: null, workspace: null, keys: {} },
          },
        },
        model: { kind: 'value', value: selectedModel(input.selection) },
        tools: await options.tools({ access, conditions: input.conditions }),
        control: {
          kind: 'value',
          value: {
            conditions: { evidence: input.conditions.source, revision: digest(input.conditions) },
            previous,
            alterations: input.alterations.map(evidence => ({
              evidence,
              touches: 'existing-layers' as const,
            })),
            beforeModelCall: passages,
          },
        },
      },
    }
  }

  /** The plan entered in the same call as a needs-compaction outcome. */
  async function enter(
    outcome: Outcome,
    operations: AssemblyOperations<P>,
    call: AssemblyCall<P>,
    target: ContextTarget,
    groups: StagedGroups<P>,
    original: Original['original'],
  ): Promise<Answer<Preparation>> {
    const planned: PlanResult = await operations.planCompaction(call)
    const shared = common(outcome.input, outcome.purpose, outcome.place, { planned: planned.kind })
    switch (planned.kind) {
      case 'planned': {
        const plan = materials.mint('plan', outcome.place, planned.plan)
        materials.putPlan(plan, {
          place: outcome.place,
          target,
          call: { candidate: call.candidate, position: call.position, purpose: call.purpose },
          plan: planned.plan,
          progress: planned.progress,
          step: planned.first,
          groups,
        })
        return {
          ok: {
            ...shared,
            kind: 'needs-compaction',
            original,
            progress: { plan, bound: planned.plan.bound, completed: planned.progress.completed },
          },
        }
      }
      case 'cannot-fit':
        return {
          ok: {
            ...shared,
            kind: 'cannot-fit',
            reason: 'after-compaction',
            diagnostic: planned.diagnostic,
          },
        }
      default:
        return { failure: failureOfAssembly(planned) }
    }
  }

  const prepare: RequestPreparation<P>['prepare'] = async input => {
    if (closed) return fail(unavailable('agent-context-closed'))
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const tenant = tenantText(input.tenant)
    if (tenant === null) return fail(denied('prepare'))
    const read = readOf(input.context.source, tenant, 'prepare')
    if ('failure' in read) return fail(read.failure)
    const resolved = await parts.resolveHistory({ access, evidence: input.history })
    if (resolved.kind !== 'value')
      return fail(failureOfRead(resolved, 'history-holder', 'resolve-history'))
    const target = resolved.value.target
    if (tenantText(target.tenant) !== tenant) return fail(denied('prepare'))
    const candidate = decodeCandidateRef(input.action)
    const position = decodePositionRef(`position_${digest(input.position)}`)
    if ('failure' in candidate) return fail(invalid('action', candidate.failure.reason))
    if ('failure' in position) return fail(invalid('position', position.failure.reason))
    const groups = await groupsOf(input, tenant, read.ok, resolved.value)
    if ('failure' in groups) return fail(groups.failure)
    const call: AssemblyCall<P> = {
      access,
      candidate: candidate.ok,
      position: position.ok,
      purpose: input.purpose,
    }
    const outcome: Outcome = {
      access,
      input,
      purpose: input.purpose,
      place: placeOf(tenant, target, input.advance),
    }
    const original: Original['original'] = {
      input: materials.mint('original', outcome.place, {
        candidate: call.candidate,
        position: call.position,
        groups: groups.ok,
      }),
      alterations: input.alterations,
      beforeModelCall: input.beforeModelCall,
    }
    const answer = await staged(access, target, call, groups.ok, async operations =>
      preparationOf(outcome, await operations.assemble(call), () =>
        enter(outcome, operations, call, target, groups.ok, original),
      ),
    )
    return 'ok' in answer ? succeed(answer.ok) : fail(answer.failure)
  }

  /** The progress after one step: same plan, one more completed step, and below the bound to go on. */
  function stepped(entry: PlanMaterial<P>, progress: PlanProgress, next: boolean): Failure | null {
    if (progress.planId !== entry.plan.planId) return invalid('progress.plan', 'plan-mismatch')
    if (BigInt(progress.completed) !== BigInt(entry.progress.completed) + 1n)
      return invalid('progress.completed', 'progress-mismatch')
    if (next && BigInt(progress.completed) >= BigInt(entry.plan.bound))
      return invalid('progress.completed', 'progress-mismatch')
    return null
  }

  /** A summary step fixed through Model, as the ready preparation of the compaction purpose. */
  async function stepOf(
    input: Parameters<RequestPreparation<P>['derive']>[0],
    entry: PlanMaterial<P>,
    step: StepRequest,
  ): Promise<Answer<Ready>> {
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const evidence = materials.mint('step', entry.place, step)
    const request = await fix(
      access,
      input.selection.resolution.profile,
      { modalities: ['text'], source: evidence },
      step.assembled,
    )
    if ('failure' in request) return request
    return {
      ok: {
        ...common(
          { action: input.action, position: input.original.position },
          'compaction',
          entry.place,
          step,
        ),
        kind: 'ready',
        request: request.ok,
        capacity: resultCapacity,
        budget: materials.mint('budget', entry.place, step.assembled),
        recipient: input.selection.recipient,
        coverage: evidence,
      },
    }
  }

  async function advanceOf(
    input: Parameters<RequestPreparation<P>['derive']>[0],
    entry: PlanMaterial<P>,
    result: StepResult,
  ): Promise<Answer<CompactionAdvance>> {
    const progressOf = (progress: PlanProgress): CompactionProgress => ({
      plan: input.progress.plan,
      bound: input.progress.bound,
      completed: progress.completed,
    })
    switch (result.kind) {
      case 'next': {
        const wrong = stepped(entry, result.progress, true)
        if (wrong !== null) return { failure: wrong }
        materials.putPlan(input.original.progress.plan, {
          ...entry,
          progress: result.progress,
          step: result.step,
        })
        const step = await stepOf(input, entry, result.step)
        if ('failure' in step) return step
        return {
          ok: { kind: 'continue', progress: progressOf(result.progress), stepRequest: step.ok },
        }
      }
      case 'transition': {
        const wrong = stepped(entry, result.progress, false)
        if (wrong !== null) return { failure: wrong }
        const { value } = result
        const value_: PreparedContextTransition = {
          preparation: input.original.id,
          message: value.message,
          source: materials.mint('transition', entry.place, value),
          derivation: materials.mint('transition', entry.place, value.derivation),
          commitment: materials.mint('transition', entry.place, value.commitment),
          candidate: materials.mint('transition', entry.place, value.candidate),
          plan: input.progress.plan,
          basis: { schema: owner, value: jsonOf(entry.plan.basis) },
          epoch: entry.plan.basis.history.epoch,
        }
        return {
          ok: { kind: 'transition', progress: progressOf(result.progress), value: value_ },
        }
      }
      case 'cannot-fit': {
        const wrong = stepped(entry, result.progress, false)
        if (wrong !== null) return { failure: wrong }
        return {
          ok: {
            kind: 'cannot-fit',
            progress: progressOf(result.progress),
            reason: 'after-compaction',
            diagnostic: result.diagnostic,
          },
        }
      }
      default:
        return { failure: failureOfAssembly(result) }
    }
  }

  const derive: RequestPreparation<P>['derive'] = async input => {
    if (closed) return fail(unavailable('agent-context-closed'))
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const tenant = tenantText(input.tenant)
    if (tenant === null) return fail(denied('derive'))
    const entry = planOf(input.original, tenant, 'derive')
    if ('failure' in entry) return fail(entry.failure)
    const planned = input.original.progress
    if (
      canonical(input.progress.plan) !== canonical(planned.plan) ||
      input.progress.bound !== planned.bound
    )
      return fail(invalid('progress', 'plan-mismatch'))
    if (input.progress.completed !== entry.ok.progress.completed)
      return fail(invalid('progress.completed', 'progress-mismatch'))
    if (input.result === null) {
      const step = await stepOf(input, entry.ok, entry.ok.step)
      if ('failure' in step) return fail(step.failure)
      return succeed({ kind: 'continue', progress: input.progress, stepRequest: step.ok })
    }
    const produced = await options.stepResults({ access, produced: input.result.produced })
    if (produced.kind !== 'value')
      return fail(failureOfRead(produced, 'model-results', 'read-step-result'))
    const { call, target, step } = entry.ok
    const consumed = input.result.consumed
    const answer = await staged(
      access,
      target,
      { ...call, access },
      { ...entry.ok.groups, model: { kind: 'value', value: selectedModel(input.selection) } },
      async operations =>
        advanceOf(
          input,
          entry.ok,
          await operations.deriveStep({
            call: { ...call, access },
            plan: entry.ok.plan,
            progress: entry.ok.progress,
            step: { kind: 'summary', index: step.index, produced: produced.value, consumed },
            material: step.material,
          }),
        ),
    )
    return 'ok' in answer ? succeed(answer.ok) : fail(answer.failure)
  }

  const resume: RequestPreparation<P>['resume'] = async input => {
    if (closed) return fail(unavailable('agent-context-closed'))
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const tenant = tenantText(input.tenant)
    if (tenant === null) return fail(denied('resume'))
    const entry = planOf(input.original, tenant, 'resume')
    if ('failure' in entry) return fail(entry.failure)
    const read = readOf(input.context.source, tenant, 'resume')
    if ('failure' in read) return fail(read.failure)
    // The commit source: the read after the commit was taken with this transition, on the target
    // of the plan. Anything else is another commit than the one the original preparation entered.
    if (
      read.ok.transition === null ||
      canonical(read.ok.transition) !== canonical(input.transition) ||
      read.ok.target.scope.ref !== entry.ok.target.scope.ref
    )
      return fail({ kind: 'changed' })
    const { plan, call, target, groups: before } = entry.ok
    const groups: StagedGroups<P> = {
      ...before,
      history:
        before.history.kind === 'value'
          ? { kind: 'value', value: { ...before.history.value, evidence: read.ok.history } }
          : before.history,
      context: {
        kind: 'value',
        value: {
          contextRead: read.ok.group,
          transition: {
            planId: plan.planId,
            candidate: plan.candidate,
            committed: input.transition,
            epoch: read.ok.history.epoch,
          },
        },
      },
      model: { kind: 'value', value: selectedModel(input.selection) },
      tools: await options.tools({ access, conditions: null }),
    }
    const outcome: Outcome = {
      access,
      input: {
        action: input.original.id,
        position: input.original.position,
        selection: input.selection,
      },
      purpose: input.original.purpose,
      place: entry.ok.place,
    }
    const resumed = { ...call, access }
    const answer = await staged(access, target, resumed, groups, async operations =>
      preparationOf(outcome, await operations.resume(resumed), async () => ({
        ok: {
          ...common(outcome.input, outcome.purpose, outcome.place, { resumed: 'needs-compaction' }),
          kind: 'needs-compaction',
          original: input.original.original,
          progress: input.original.progress,
        },
      })),
    )
    return 'ok' in answer ? succeed(answer.ok) : fail(answer.failure)
  }

  return {
    prepare,
    derive,
    resume,
    async close() {
      closed = true
      const pending = [...registrations.values()]
      registrations.clear()
      const handles = (await Promise.all(pending)).flatMap(result =>
        'ok' in result ? [result.ok] : [],
      )
      return settledAll(await Promise.all(handles.map(handle => handle.withdraw().settled)))
    },
  }
}

function placeOf(
  tenant: string,
  target: ContextTarget,
  advance: Readonly<{ execution: string; executionAttachment: string }>,
): Place {
  return {
    tenant,
    scope: target.scope.ref,
    execution: advance.execution,
    attachment: advance.executionAttachment,
  }
}
