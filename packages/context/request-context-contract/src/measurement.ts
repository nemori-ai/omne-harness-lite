import type * as M from '@omne-harness/model-contract'
import { readJsonText } from '@omne-harness/json-text'
import type { AssemblyInput, AssemblyFailure } from './values.js'
import type { AssemblyPorts } from './ports.js'
import { canonical, nonEmpty } from './internal.js'
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
