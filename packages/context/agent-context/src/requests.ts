import type {
  CompactionInputStore,
  Failure,
  Preparation,
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
  encodeFixedRequestRecord,
  type Access,
  type Adoption,
  type AssemblyCall,
  type AssemblyOperations,
  type AssemblyResult,
  type ContextRegistration,
  type ContextSourceRegistry,
  type ContextTarget,
  type ConversionResultSource,
  type HistoryEvidence,
  type TransitionEvidence,
  type PassageRef,
  type RequestCandidate,
  type SourceSettlement,
} from '@omne-harness/request-context-contract'
import type { ContextHolderParts } from '@omne-harness/request-context-cordis-contract'
import { createContextMeasurer, type ContextMeasure } from './measure.ts'
import type { ModelRequestPreparation } from './translate.ts'
import type { ContextMaterials, Place } from './materials.ts'
import { canonical, digest, tenantText } from './records.ts'
import { createStaging, type StagedGroups } from './staging.ts'
import { createCompactionAssessment, freezeCompaction } from './compaction.ts'
import { readMemento, saveMemento, type RequestMemento } from './request-memento.ts'
import {
  absentDefinitions,
  definitionContributions,
  failureOfAssembly,
  failureOfModel,
  failureOfRead,
  selectedModel,
  unavailable,
  type DefinitionSource,
  type ToolsSource,
} from './translate.ts'

export type AgentRequestsOptions<P> = Readonly<{
  materials: ContextMaterials
  parts: ContextHolderParts<P>
  requestContext: Pick<ContextSourceRegistry<P>, 'register' | 'assembly'>
  preparation: M.ModelPreparationResources<P>
  conversions: ConversionResultSource<P>
  model: ModelRequestPreparation<P>
  tools: ToolsSource<P>
  compactionInputs: CompactionInputStore<P>
  definitions?: DefinitionSource<P>
  measure?: ContextMeasure
}>

export type AgentRequests<P> = RequestPreparation<P> &
  Readonly<{
    close(): Promise<SourceSettlement>
  }>

type Answer<T> = Readonly<{ ok: T }> | Readonly<{ failure: Failure }>
type Candidate = Extract<AssemblyResult, { candidate: RequestCandidate }>['candidate']
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
  const { materials, parts, requestContext, model } = options
  const definitions: DefinitionSource<P> = options.definitions ?? absentDefinitions
  const measurer = createContextMeasurer(options.measure)
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

  async function staged<T>(
    tenant: string,
    access: Access<P>,
    target: ContextTarget,
    call: AssemblyCall<P>,
    groups: StagedGroups<P>,
    run: (operations: AssemblyOperations<P>) => Promise<Answer<T>>,
  ): Promise<Answer<T>> {
    const release = staging.stage(tenant, call, groups)
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
    target: ContextTarget
  }>

  async function candidateOf(
    outcome: Outcome,
    candidate: Candidate,
    fixable: boolean,
  ): Promise<Answer<Preparation>> {
    const { access, input, purpose, place, target } = outcome
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
      ok: {
        ...shared,
        kind: 'ready',
        request: request.ok,
        state: encodeFixedRequestRecord({
          schema: 'request-context/fixed-request/1',
          target,
          candidate: candidate.candidate,
          coverage: candidate.coverage,
          continuation: candidate.continuation,
        }),
      },
    }
  }

  async function preparationOf(
    outcome: Outcome,
    result: AssemblyResult,
    compaction: (
      need: Extract<AssemblyResult, { kind: 'needs-compaction' }>,
    ) => Promise<Answer<Preparation>>,
  ): Promise<Answer<Preparation>> {
    switch (result.kind) {
      case 'candidate-before-extension':
        return candidateOf(outcome, result.candidate, false)
      case 'candidate-fixable':
        return candidateOf(outcome, result.candidate, true)
      case 'needs-compaction':
        return compaction(result)
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

  async function promptGroupOf(
    access: Access<P>,
    scope: ContextTarget['scope'],
    definition: Adoption | undefined,
  ): Promise<StagedGroups<P>['prompt']> {
    if (definition === undefined)
      return {
        kind: 'value',
        value: {
          promptContributions: null,
          assembleContext: { scope, definition: null, workspace: null, keys: {} },
        },
      }
    const read = await definitions({ access, definition })
    if (read.kind !== 'value') return read
    return {
      kind: 'value',
      value: {
        promptContributions:
          read.value === null ? null : definitionContributions(definition, scope, read.value),
        assembleContext: { scope, definition: canonical(definition), workspace: null, keys: {} },
      },
    }
  }

  async function groupsOf(
    input: Pick<
      Parameters<RequestPreparation<P>['prepare']>[0],
      | 'principal'
      | 'tenant'
      | 'inputs'
      | 'beforeModelCall'
      | 'previous'
      | 'definition'
      | 'selection'
      | 'conditions'
      | 'alterations'
    >,
    history: HistoryEvidence,
    transition: TransitionEvidence | null,
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
      previous = {
        candidate: candidate.ok,
        enteredCompaction: input.previous.kind === 'needs-compaction',
      }
    }
    return {
      ok: {
        history: {
          kind: 'value',
          value: {
            evidence: history,
            inputs: { batch: batch.ok, entries, saved: input.inputs.watermark },
            transition,
          },
        },
        prompt: await promptGroupOf(access, target.scope, input.definition),
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

  const prepare: RequestPreparation<P>['prepare'] = async input => {
    if (closed) return fail(unavailable('agent-context-closed'))
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const tenant = tenantText(input.tenant)
    if (tenant === null) return fail(denied('prepare'))
    const resolved = await parts.resolveHistory({ access, evidence: input.history })
    if (resolved.kind !== 'value')
      return fail(failureOfRead(resolved, 'history-holder', 'resolve-history'))
    const target = resolved.value.target
    if (tenantText(target.tenant) !== tenant) return fail(denied('prepare'))
    const candidate = decodeCandidateRef(input.action)
    const position = decodePositionRef(`position_${digest(input.position)}`)
    if ('failure' in candidate) return fail(invalid('action', candidate.failure.reason))
    if ('failure' in position) return fail(invalid('position', position.failure.reason))
    const groups = await groupsOf(input, resolved.value, null)
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
      target,
    }
    const memento: RequestMemento = {
      schema: 'agent-context/original-request/1',
      scope: target.scope.ref,
      inputs: input.inputs,
      conditions: input.conditions,
      definition: input.definition ?? null,
    }
    const answer = await staged(tenant, access, target, call, groups.ok, async operations =>
      preparationOf(outcome, await operations.assemble(call), async need => {
        const frozen = await freezeCompaction(
          input,
          resolved.value,
          need,
          parts.history,
          options.compactionInputs,
        )
        if ('failure' in frozen) return { failure: frozen.failure }
        return {
          ok: {
            ...common(input, input.purpose, outcome.place, frozen.ok),
            kind: 'needs-compaction',
            input: frozen.ok,
            state: saveMemento(memento),
            original: {
              input: materials.mint('original', outcome.place, memento),
              alterations: input.alterations,
              beforeModelCall: input.beforeModelCall,
            },
          },
        }
      }),
    )
    return 'ok' in answer ? succeed(answer.ok) : fail(answer.failure)
  }

  const assess = createCompactionAssessment({
    inputs: options.compactionInputs,
    preparation: options.preparation,
  })
  const assessCompaction: RequestPreparation<P>['assessCompaction'] = input =>
    closed ? Promise.resolve(fail(unavailable('agent-context-closed'))) : assess(input)

  const resume: RequestPreparation<P>['resume'] = async input => {
    if (closed) return fail(unavailable('agent-context-closed'))
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const tenant = tenantText(input.tenant)
    if (tenant === null) return fail(denied('resume'))
    const memento = readMemento(input.original.state)
    const originalKey = materials.key(input.original.original.input)
    if (
      memento === null ||
      originalKey === null ||
      canonical(input.original.schema) !== canonical(owner) ||
      input.original.original.input.digest !== digest(memento)
    )
      return fail(invalid('original', 'original-request-invalid'))
    if (originalKey.tenant !== tenant || originalKey.execution !== input.advance.execution)
      return fail(denied('resume'))
    const resolved = await parts.resolveHistory({ access, evidence: input.history })
    if (resolved.kind !== 'value')
      return fail(failureOfRead(resolved, 'history-holder', 'resolve-history'))
    if (tenantText(resolved.value.target.tenant) !== tenant) return fail(denied('resume'))
    if (resolved.value.target.scope.ref !== memento.scope || originalKey.scope !== memento.scope)
      return fail({ kind: 'changed' })
    const candidate = decodeCandidateRef(input.original.id)
    const position = decodePositionRef(`position_${digest(input.original.position)}`)
    if ('failure' in candidate || 'failure' in position)
      return fail(invalid('original', 'call-identity'))
    const target = resolved.value.target
    const groups = await groupsOf(
      {
        ...access,
        inputs: memento.inputs,
        conditions: memento.conditions,
        selection: input.selection,
        previous: input.original,
        alterations: input.original.original.alterations,
        beforeModelCall: input.original.original.beforeModelCall,
        ...(memento.definition === null ? {} : { definition: memento.definition }),
      },
      resolved.value,
      { candidate: candidate.ok, committed: input.transition, epoch: resolved.value.epoch },
    )
    if ('failure' in groups) return fail(groups.failure)
    const outcome: Outcome = {
      access,
      input: {
        action: input.original.id,
        position: input.original.position,
        selection: input.selection,
      },
      purpose: input.original.purpose,
      place: placeOf(tenant, target, input.advance),
      target,
    }
    const call = {
      access,
      candidate: candidate.ok,
      position: position.ok,
      purpose: input.original.purpose,
    }
    const answer = await staged(tenant, access, target, call, groups.ok, async operations =>
      preparationOf(outcome, await operations.resume(call), async () => ({
        ok: {
          ...common(outcome.input, outcome.purpose, outcome.place, { resumed: 'needs-compaction' }),
          kind: 'cannot-fit',
          reason: 'after-compaction',
          diagnostic: 'request-still-over-limit',
        },
      })),
    )
    if ('failure' in answer) return fail(answer.failure)
    if (answer.ok.kind === 'needs-compaction')
      return fail(invalid('resume', 'recursive-compaction'))
    return succeed(answer.ok)
  }

  const failed = (answer: object): boolean => 'failure' in answer
  return {
    prepare: input =>
      measurer.segment('prepare', input.advance.execution, () => prepare(input), failed),
    assessCompaction: input =>
      measurer.segment(
        'assess-compaction',
        input.advance.execution,
        () => assessCompaction(input),
        failed,
      ),
    resume: input =>
      measurer.segment('resume', input.advance.execution, () => resume(input), failed),
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
