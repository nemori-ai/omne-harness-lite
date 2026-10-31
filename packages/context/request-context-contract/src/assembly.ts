import type { AssemblyInput, AssemblyResult, PreparedInputKey } from './values.js'
import type { HistoryRow } from './ports.js'
import type { OperationContext } from './operation-context.js'
import { validateInput } from './input-validation.js'
import { prepareStable } from './preparation.js'
import { placeLayers, assembledInput } from './assembly-layers.js'
import { representLayers } from './assembly-representation.js'
import { measureLayers } from './assembly-budget.js'
import { assemblyCoverage } from './assembly-coverage.js'
import { assemblyOutcome } from './assembly-outcome.js'
import { continuationFacts } from './model-input.js'
/** Derives one request from stably read groups; the source reads already happened (RQ-13). */
export async function assembleInputs<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  rows: readonly HistoryRow[],
  context: OperationContext<P>,
): Promise<AssemblyResult> {
  const invalid = validateInput(input)
  if (invalid !== null) return invalid
  const stable = prepareStable(input, key, rows)
  if (stable.kind !== 'prepared') return stable
  const dynamic = placeLayers(input, stable)
  if (dynamic.kind !== 'layers') return dynamic
  const represented = await representLayers(input, context, dynamic.messages)
  if (represented.kind !== 'chosen') return represented
  const assembled = assembledInput(input, context.policies, dynamic.layers, represented.messages)
  const facts = continuationFacts(input.history, input.selection, assembled)
  const measured = await measureLayers(
    input,
    context,
    stable,
    dynamic.layers,
    represented,
    assembled,
    facts,
  )
  if (measured.kind !== 'measured') return measured
  const coverage = assemblyCoverage(input, stable, dynamic, represented, measured.whole)
  return assemblyOutcome(
    input,
    {
      preparation: { key: stable.key, rows: stable.rows, view: stable.view },
      candidate: input.identity.candidate,
      layers: dynamic.layers,
      coverage,
      assembled,
      representations: represented.choices,
      modality: represented.modality,
      continuation: facts,
    },
    measured.verdict,
  )
}
