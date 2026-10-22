import type { AssemblyInput, AssemblyResult } from './values.js'
import type { AssemblyPorts, AssemblyPolicies } from './ports.js'
import { validateAssembly } from './input-validation.js'
import { prepareStable } from './preparation.js'
import { placeLayers, assembledInput } from './assembly-layers.js'
import { representLayers } from './assembly-representation.js'
import { measureLayers } from './assembly-budget.js'
import { assemblyCoverage } from './assembly-coverage.js'
import { assemblyOutcome } from './assembly-outcome.js'
export async function assemble<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<AssemblyResult> {
  const invalid = validateAssembly(input, ports)
  if (invalid !== null) return invalid
  const stable = await prepareStable(input, ports)
  if (stable.kind !== 'prepared') return stable
  const dynamic = placeLayers(input, stable)
  if (dynamic.kind !== 'layers') return dynamic
  const represented = await representLayers(input, ports, policies, dynamic.messages)
  if (represented.kind !== 'chosen') return represented
  const assembled = assembledInput(input, policies, dynamic.layers, represented.messages)
  const measured = measureLayers(
    input,
    ports,
    policies,
    stable,
    dynamic.layers,
    represented,
    assembled,
  )
  if (measured.kind !== 'measured') return measured
  const coverage = assemblyCoverage(input, stable, dynamic, represented, measured.whole)
  return assemblyOutcome(
    input,
    {
      preparation: {
        access: input.identity.access,
        key: stable.key,
        rows: stable.history.rows,
        view: stable.view,
      },
      candidate: input.identity.candidate,
      layers: dynamic.layers,
      coverage,
      assembled,
      representations: represented.choices,
      modality: represented.modality,
    },
    measured.verdict,
  )
}
