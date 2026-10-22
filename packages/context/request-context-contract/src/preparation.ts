import { tenantEquals } from '@omne-harness/legal-identity'
import { canonical } from './internal.js'
import { readHistory } from './history-read.js'
import { project, type ProjectedHistory } from './projection.js'
import { assembleSystemPrompt, type SystemPromptResult } from './prompt.js'
import { declareTools, type ToolDeclarationSet } from './declare-tools.js'
import type {
  AssemblyInput,
  PreparedInputKey,
  AssemblyFailure,
  AssemblyUnknown,
  RequestCandidate,
} from './values.js'
export function preparationKey<P>(input: AssemblyInput<P>): PreparedInputKey {
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

export type StablePreparation = Readonly<{
  kind: 'prepared'
  key: PreparedInputKey
  history: Extract<Awaited<ReturnType<typeof readHistory>>, { kind: 'history' }>
  view: ProjectedHistory
  prompt: Extract<SystemPromptResult, { kind: 'rendered' }>
  declarations: ToolDeclarationSet
}>
export async function prepareStable<P>(
  input: AssemblyInput<P>,
  ports: import('./ports.js').AssemblyPorts<P>,
): Promise<StablePreparation | AssemblyFailure | AssemblyUnknown> {
  const key = preparationKey(input)
  const carried = input.previous?.carried
  const reusable = recognizePreparation(input, key, carried)
  if (contradictoryPreparation(input, carried, reusable))
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
  return { kind: 'prepared', key, history, view, prompt, declarations }
}

function recognizePreparation<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  carried: RequestCandidate | undefined,
): RequestCandidate | null {
  return carried !== undefined &&
    carried.candidate === input.identity.candidate &&
    Object.is(carried.preparation.access.principal, input.identity.access.principal) &&
    tenantEquals(carried.preparation.access.tenant, input.identity.access.tenant) &&
    canonical(carried.preparation.key) === canonical(key)
    ? carried
    : null
}

function contradictoryPreparation<P>(
  input: AssemblyInput<P>,
  carried: RequestCandidate | undefined,
  reusable: RequestCandidate | null,
): boolean {
  return (
    carried !== undefined &&
    carried.candidate === input.identity.candidate &&
    input.adopted !== null &&
    canonical(input.adopted) === canonical(carried.coverage) &&
    reusable === null
  )
}
