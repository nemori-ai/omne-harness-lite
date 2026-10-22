import { tenantEquals } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import type { Message } from '@omne-harness/message'
import { readJsonText } from '@omne-harness/json-text'
import type {
  AssemblyInput,
  AssemblyResult,
  AssemblyFailure,
  RequestLayers,
  Coverage,
  PrefixBreakReason,
  HistoryEvidence,
} from './values.js'
import type {
  HistorySource,
  ConversionResultSource,
  CompactionPolicyPort,
  RepresentationPolicyPort,
  RequestSerializer,
  HistoryRow,
} from './ports.js'
import { project } from './projection.js'
import { assembleSystemPrompt } from './prompt.js'
import { declareTools } from './declare-tools.js'
import { placeContext } from './placement.js'
import { chooseRepresentations } from './representation.js'
import { judgeBudget } from './budget.js'
import { canonical, digest, nonEmpty } from './internal.js'
export { LAYER_ORDER, PREFIX_BREAK_REASONS } from './values.js'
export type AssemblyPorts<P> = Readonly<{
  history: HistorySource<P>
  meter: M.ModelInputMeter
  conversions: ConversionResultSource<P>
  serializer: RequestSerializer
}>
export type AssemblyPolicies = Readonly<{
  compaction: CompactionPolicyPort
  representation: RepresentationPolicyPort
}>
export type AssemblyOperations<P> = Readonly<{
  assemble(input: AssemblyInput<P>): Promise<AssemblyResult>
  planCompaction(input: AssemblyInput<P>): Promise<import('./values.js').PlanResult>
  deriveStep(input: import('./plan.js').DeriveInput): Promise<import('./values.js').StepResult>
  resume(
    input: AssemblyInput<P> & Readonly<{ transition: import('./values.js').TransitionEvidence }>,
  ): Promise<AssemblyResult>
}>
export function validateInput<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  if (input.identity.access === undefined || input.identity.access === null)
    return { kind: 'invalid', field: 'identity.access', reason: 'missing-access' }
  if (input.inputs.saved === null)
    return { kind: 'invalid', field: 'inputs.saved', reason: 'inputs-not-saved' }
  if (
    input.history.scope.ref !== input.assembleContext.scope.ref ||
    input.history.scope.ref !== input.contextRead.scope.ref
  )
    return { kind: 'invalid', field: 'scope', reason: 'scope-mismatch' }
  if (
    input.contextRead.recipient !==
    `${input.selection.recipient.route}/${input.selection.recipient.model}`
  )
    return { kind: 'invalid', field: 'contextRead.recipient', reason: 'profile-binding-conflict' }
  if (input.selection.profile.availability !== 'active')
    return { kind: 'invalid', field: 'selection.profile', reason: 'profile-binding-conflict' }
  const read = input.contextRead.read
  if (
    input.contextRead.snapshot !== null &&
    input.contextRead.snapshot.scope.ref !== input.history.scope.ref
  )
    return { kind: 'invalid', field: 'contextRead.snapshot.scope', reason: 'scope-mismatch' }
  if (read.kind === 'success' && read.value.scope.ref !== input.history.scope.ref)
    return { kind: 'invalid', field: 'contextRead.read.scope', reason: 'scope-mismatch' }
  if (
    read.kind === 'success' &&
    'viewRevision' in read.value &&
    input.contextRead.snapshot !== null &&
    read.value.viewRevision !== input.contextRead.snapshot.revision
  )
    return {
      kind: 'invalid',
      field: 'contextRead.snapshot.revision',
      reason: 'missing-snapshot-material',
    }
  if (read.kind === 'refused')
    return read.reason === 'unauthorized'
      ? { kind: 'denied', action: 'assemble', diagnostic: read.reason }
      : { kind: 'unavailable', owner: 'runtime-context', diagnostic: read.reason }
  if (read.kind === 'missing')
    return {
      kind: 'unavailable',
      owner: 'runtime-context',
      diagnostic: 'Required runtime context unavailable',
    }
  if (read.kind === 'cursor-invalidated')
    return { kind: 'invalid', field: 'contextRead', reason: 'cursor-invalidated' }
  return null
}
export async function readHistory<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
): Promise<
  | Readonly<{ kind: 'history'; rows: readonly HistoryRow[]; evidence: HistoryEvidence }>
  | AssemblyFailure
  | Readonly<{ kind: 'unknown'; source: 'read'; diagnostic: string }>
> {
  let evidence = input.history
  let after: number | null = null
  let rows: HistoryRow[] = []
  const epochs = new Set<string>([evidence.epoch])
  while (true) {
    const result = await ports.history.read(evidence, input.identity.access, after, 65536)
    switch (result.kind) {
      case 'page': {
        if (
          result.page.rows.some(
            (r, i) =>
              r.seq < 0 ||
              r.seq > evidence.upper ||
              r.seq <= (i === 0 ? (after ?? -1) : (result.page.rows[i - 1]?.seq ?? -1)),
          )
        )
          return { kind: 'invalid', field: 'history.page', reason: 'unsupported-format' }
        rows.push(...result.page.rows)
        if (result.page.next === null) return { kind: 'history', rows, evidence }
        if (result.page.next <= (after ?? -1) || result.page.next !== rows.at(-1)?.seq)
          return { kind: 'invalid', field: 'history.cursor', reason: 'unsupported-format' }
        after = result.page.next
        break
      }
      case 'epoch-changed':
        if (epochs.has(result.current.epoch))
          return {
            kind: 'unavailable',
            owner: 'history-source',
            diagnostic: 'History epoch did not advance',
          }
        if (result.current.scope.ref !== evidence.scope.ref)
          return { kind: 'invalid', field: 'history.scope', reason: 'scope-mismatch' }
        evidence = result.current
        epochs.add(evidence.epoch)
        rows = []
        after = null
        break
      case 'denied':
        return {
          kind: 'denied',
          action: 'read-history',
          diagnostic: 'History source refused access',
        }
      case 'invalid':
        return {
          kind: 'invalid',
          field: 'history',
          reason:
            result.reason === 'missing-access'
              ? 'missing-access'
              : result.reason === 'missing-scope'
                ? 'missing-scope'
                : 'unsupported-format',
        }
      case 'unavailable':
        return { kind: 'unavailable', owner: 'history-source', diagnostic: result.diagnostic }
      case 'unknown':
        return { kind: 'unknown', source: 'read', diagnostic: 'History source outcome unknown' }
    }
  }
}
export function assembledInput<P>(
  input: AssemblyInput<P>,
  policies: AssemblyPolicies,
  layers: RequestLayers,
  messages: readonly Message[],
): M.AssembledModelInput {
  return {
    system: layers.systemPrompt,
    messages,
    tools: layers.toolDeclarations.direct,
    toolChoice: 'auto',
    parameters: input.selection.parameters.map(p => p.applied),
    ...(input.selection.replay === 'off' ? { replay: 'off' as const } : {}),
    representation: policies.representation.identity,
    source: {
      owner: 'request-context-contract',
      name: 'assembly',
      revision: '1',
      digest: digest(input.identity.candidate),
    },
  }
}
export function measure<P>(
  input: Pick<AssemblyInput<P>, 'selection'>,
  ports: AssemblyPorts<P>,
  assembled: M.AssembledModelInput,
  deferred: readonly import('@omne-harness/content-block').ContentReference[],
): M.RequestBudget | AssemblyFailure {
  const definition = input.selection.profile.definition
  const reports: M.RequestBudget[] = []
  const token = readJsonText(canonical(assembled), {
    maxBytes: 100000000,
    maxDepth: 256,
    maxItems: 10000000,
    maxMembers: 1000000,
    maxStringLength: 100000000,
    maxNumberLength: 1000,
  })
  if (token.kind !== 'ok')
    return { kind: 'invalid', field: 'assembled', reason: 'unsupported-format' }
  const bytes = ports.serializer.bytesOf(assembled)
  if (!/^(0|[1-9][0-9]*)$/u.test(bytes))
    return { kind: 'invalid', field: 'serializer.bytesOf', reason: 'unsupported-format' }
  for (const supplier of definition.suppliers) {
    const base = { adoption: assembled.representation, tokenInput: token.value, media: [] }
    const representation: M.MeterRepresentation = nonEmpty(deferred)
      ? { ...base, kind: 'pending-media', references: deferred }
      : { ...base, kind: 'materialized', requestBytes: bytes }
    const result = ports.meter.measure({
      profile: input.selection.profile.adoption,
      supplier,
      context: definition.context,
      limits: definition.limits,
      assembled,
      parameters: input.selection.parameters,
      representation,
    })
    if ('failure' in result)
      return { kind: 'unavailable', owner: 'meter', diagnostic: canonical(result.failure) }
    reports.push(result.ok)
  }
  const first = reports[0]
  if (first === undefined)
    return { kind: 'invalid', field: 'profile.suppliers', reason: 'missing-input' }
  return { ...first, checks: reports.flatMap(r => r.checks) }
}
function prefix(
  coverage: Omit<Coverage, 'prefixBreak'>,
  previous: Coverage | null,
  input: AssemblyInput<unknown>,
): PrefixBreakReason {
  if (input.transition !== null) return 'compaction'
  if (input.alterations.some(a => a.touches === 'existing-layers')) return 'extension-altered'
  if (
    previous === null ||
    canonical(previous.snapshot.anchor) !== canonical(coverage.snapshot.anchor)
  )
    return 'new-full-read'
  if (previous.model.recipient !== coverage.model.recipient) return 'model-changed'
  if (previous.prompt.digest !== coverage.prompt.digest) return 'system-prompt-changed'
  if (previous.tools.digest !== coverage.tools.digest) return 'tool-set-changed'
  return 'unchanged'
}
/** Revision comparison uses source-owned evidence and counters, never content hashes. */
export type PreparedInputKey = Readonly<{
  identity: Omit<AssemblyInput<unknown>['identity'], 'access'>
  history: HistoryEvidence
  inputs: AssemblyInput<unknown>['inputs']
  context: Readonly<{
    source: import('./refs.js').DurableEvidence
    coverage: import('./refs.js').DurableEvidence
    snapshot: Pick<
      import('./values.js').SnapshotMaterial,
      'scope' | 'eligibility' | 'revision'
    > | null
  }>
  prompt: Readonly<{ digest: string; generation: string | null }>
  assembly: import('./values.js').AssemblyContext
  model: Readonly<{
    evidence: import('./refs.js').DurableEvidence
    toolsEvidence: import('./refs.js').DurableEvidence
    adoption: import('./refs.js').Adoption
    revision: M.Revision
    recipient: import('./values.js').SelectedModel['recipient']
    parameters: readonly M.ParameterAdoption[]
    replay: 'on' | 'off'
  }>
  tools: readonly Readonly<{
    resident: boolean
    definition: import('./refs.js').Adoption
    binding: import('./refs.js').Adoption
  }>[]
  conditions: import('./values.js').ConditionsEvidence
  alterations: readonly import('./values.js').AlterationEvidence[]
  beforeModelCall: readonly import('./refs.js').PassageRef[] | null
}>
function preparationKey<P>(input: AssemblyInput<P>): PreparedInputKey {
  return {
    identity: {
      purpose: input.identity.purpose,
      position: input.identity.position,
      candidate: input.identity.candidate,
    },
    history: input.history,
    inputs: input.inputs,
    context: {
      source: input.contextRead.source,
      coverage: input.contextRead.coverage,
      snapshot:
        input.contextRead.snapshot === null
          ? null
          : {
              scope: input.contextRead.snapshot.scope,
              eligibility: input.contextRead.snapshot.eligibility,
              revision: input.contextRead.snapshot.revision,
            },
    },
    prompt: {
      digest: input.promptContributions?.digest ?? '',
      generation: input.promptContributions?.generation ?? null,
    },
    assembly: input.assembleContext,
    model: {
      evidence: input.selection.evidence,
      toolsEvidence: input.selection.toolsEvidence,
      adoption: input.selection.profile.adoption,
      revision: input.selection.profile.revision,
      recipient: input.selection.recipient,
      parameters: input.selection.parameters,
      replay: input.selection.replay,
    },
    tools: input.tools
      .filter(t => t.resident)
      .map(t => ({
        resident: t.resident,
        definition: t.availability.definition.adoption,
        binding: t.binding,
      })),
    conditions: input.conditions,
    alterations: input.alterations,
    beforeModelCall: input.beforeModelCall,
  }
}
export async function assemble<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<AssemblyResult> {
  if (ports.history === undefined)
    return { kind: 'unavailable', owner: 'history-source', diagnostic: 'History port is absent' }
  if (ports.meter === undefined || ports.serializer === undefined)
    return {
      kind: 'unavailable',
      owner: 'meter',
      diagnostic: 'Meter or actual serializer port is absent',
    }
  if (ports.conversions === undefined)
    return {
      kind: 'unavailable',
      owner: 'conversion-results',
      diagnostic: 'Conversion result port is absent',
    }
  const invalid = validateInput(input)
  if (invalid !== null) return invalid
  if (input.contextRead.read.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: input.contextRead.read.cause }
  const key = preparationKey(input)
  const carried = input.previous?.carried
  const reusable =
    carried !== undefined &&
    carried.candidate === input.identity.candidate &&
    Object.is(carried.preparation.access.principal, input.identity.access.principal) &&
    tenantEquals(carried.preparation.access.tenant, input.identity.access.tenant) &&
    canonical(carried.preparation.key) === canonical(key)
      ? carried
      : null
  if (
    carried !== undefined &&
    carried.candidate === input.identity.candidate &&
    input.adopted !== null &&
    canonical(input.adopted) === canonical(carried.coverage) &&
    reusable === null
  )
    return { kind: 'invalid', field: 'previous.carried', reason: 'contradictory-retry' }
  const history =
    reusable === null
      ? await readHistory(input, ports)
      : { kind: 'history' as const, rows: reusable.preparation.rows, evidence: input.history }
  if (history.kind !== 'history') return history
  const view = reusable?.preparation.view ?? project(history.rows, history.evidence.epoch)
  const prompt =
    reusable === null
      ? assembleSystemPrompt(
          input.promptContributions ?? { contributions: [], digest: '', generation: null },
          input.assembleContext,
        )
      : {
          kind: 'rendered' as const,
          blocks: reusable.layers.systemPrompt,
          sections: reusable.coverage.prompt.sections,
          digest: reusable.coverage.prompt.digest,
        }
  if (prompt.kind === 'invalid')
    return {
      kind: 'invalid',
      field: `prompt.${prompt.name}`,
      reason:
        prompt.reason === 'per-request-variable' ? 'per-request-variable' : 'unsupported-format',
    }
  const declarations = reusable?.layers.toolDeclarations ?? declareTools(input.tools)
  const placement = placeContext({
    candidate: input.identity.candidate,
    contextRead: input.contextRead,
    adopted: input.adopted,
    transition: input.transition,
    view,
    newInputs: input.inputs,
  })
  if ('kind' in placement) return placement
  const anchor = placement.snapshot.anchor
  // The history owner supplies the chained digest; never manufacture it from content.
  const anchorRow = history.rows.find(r => r.seq === anchor.seq)
  const actualAnchor = { ...anchor, prefixDigest: anchorRow?.prefixDigest ?? null }
  const snapshot = { ...placement.snapshot, anchor: actualAnchor }
  const layers: RequestLayers = {
    systemPrompt: prompt.blocks,
    toolDeclarations: declarations,
    historyHead: view.messages.filter(r => r.seq <= anchor.seq).map(r => r.message),
    snapshotReminder: snapshot,
    historyBody: view.messages.filter(r => r.seq > anchor.seq).map(r => r.message),
    tailFacts: placement.tail,
  }
  const messages = [
    ...layers.historyHead,
    ...(snapshot.message === null ? [] : [snapshot.message]),
    ...layers.historyBody,
    ...(layers.tailFacts.message === null ? [] : [layers.tailFacts.message]),
  ]
  const conversions = await ports.conversions.read(
    input.identity.access,
    messages.flatMap(m => m.blocks.map(b => b.id)),
  )
  if (conversions.kind === 'denied')
    return { kind: 'denied', action: 'read-conversions', diagnostic: 'Conversion access refused' }
  if (conversions.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: 'Conversion result unknown' }
  if (conversions.kind === 'unavailable')
    return { kind: 'unavailable', owner: 'conversion-results', diagnostic: conversions.diagnostic }
  const represented = chooseRepresentations({
    messages,
    conversions: conversions.entries,
    modalities: input.selection.profile.definition.input,
    policy: policies.representation,
  })
  if (represented.kind === 'unavailable')
    return {
      kind: 'unavailable',
      owner: 'representation',
      diagnostic: `No accepted representation for ${represented.block}`,
      original: represented.original,
    }
  const assembled = assembledInput(input, policies, layers, represented.messages)
  const whole = measure(input, ports, assembled, represented.deferred)
  if ('kind' in whole && whole.kind !== 'complete' && whole.kind !== 'deferred-media') return whole
  const fixedIds = new Set(input.inputs.entries)
  const fixedMessages = [
    ...(snapshot.message === null ? [] : [snapshot.message]),
    ...view.messages.filter(r => fixedIds.has(r.entry)).map(r => r.message),
    ...(layers.tailFacts.message === null ? [] : [layers.tailFacts.message]),
  ]
  const representedIds = new Set(fixedMessages.map(m => m.id))
  const fixed = measure(
    input,
    ports,
    { ...assembled, messages: represented.messages.filter(m => representedIds.has(m.id)) },
    represented.deferred,
  )
  if (fixed.kind !== 'complete' && fixed.kind !== 'deferred-media') return fixed
  const verdict = judgeBudget({
    whole,
    fixedPart: fixed,
    context: input.selection.profile.definition.context,
    limits: input.selection.profile.definition.limits,
    policy: policies.compaction.config,
  })
  const base: Omit<Coverage, 'prefixBreak'> = {
    history: {
      epoch: history.evidence.epoch,
      upper: history.evidence.upper,
      anchors: history.rows.length
        ? [
            {
              layer: 'history-head',
              seq: anchor.seq,
              prefixDigest: actualAnchor.prefixDigest ?? '',
            },
            {
              layer: 'history-body',
              seq: history.rows.at(-1)?.seq ?? -1,
              prefixDigest: history.rows.at(-1)?.prefixDigest ?? '',
            },
          ]
        : [],
    },
    compactions: { record: view.compaction?.entry ?? null, derivation: null },
    inputs: { batch: input.inputs.batch, saved: input.inputs.saved },
    snapshot: {
      scope: snapshot.scope,
      eligibility: snapshot.eligibility,
      revision: snapshot.revision,
      anchor: actualAnchor,
      content: placement.anchorSource === 'adopted' ? 'incremental' : 'full',
    },
    prompt: {
      sections: prompt.sections,
      digest: prompt.digest,
      generation: input.promptContributions?.generation ?? null,
    },
    model: {
      profile: input.selection.profile.adoption,
      revision: String(input.selection.profile.revision),
      recipient: `${input.selection.recipient.route}/${input.selection.recipient.model}`,
      parametersDigest: digest(input.selection.parameters),
      replay: input.selection.replay,
    },
    tools: {
      direct: declarations.direct.map(t => t.name),
      programmatic: declarations.programmatic.map(t => t.name),
      digest: declarations.digest,
    },
    conditions: input.conditions,
    alterations: input.alterations,
    representations: represented.choices,
    budget: {
      inputDigest: whole.inputDigest,
      kind: whole.kind,
      deferred: represented.deferred,
      unknownLimits: whole.checks
        .filter(c => c.constraint.upstream.kind === 'unknown')
        .map(c => c.metric),
    },
  }
  const coverage: Coverage = { ...base, prefixBreak: prefix(base, input.adopted, input) }
  if (verdict.kind === 'fixed-part-over-limit')
    return {
      kind: 'cannot-fit',
      reason: 'fixed-part-over-limit',
      coverage,
      verdict,
      diagnostic: 'Fixed request inputs exceed a known limit',
    }
  if (verdict.kind === 'needs-compaction')
    return (input.previous?.candidate === input.identity.candidate &&
      input.previous.enteredCompaction !== null) ||
      input.transition !== null
      ? {
          kind: 'cannot-fit',
          reason: 'after-compaction',
          coverage,
          verdict,
          diagnostic: 'Request still exceeds a limit after compaction',
        }
      : { kind: 'needs-compaction', coverage, verdict, layers }
  return {
    kind: input.beforeModelCall === null ? 'candidate-before-extension' : 'candidate-fixable',
    candidate: {
      preparation: { access: input.identity.access, key, rows: history.rows, view },
      candidate: input.identity.candidate,
      layers,
      coverage,
      verdict,
      representations: represented.choices,
      assembled,
      modality: represented.modality,
    },
  }
}
