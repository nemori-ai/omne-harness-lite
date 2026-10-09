import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { equal, isObject, snapshot } from './json.ts'
import { validate } from './schema.ts'
import type { InputCalibration } from './types.ts'

/** Relations available without a response, after the complete fragment shape is checked. */
function localRelations(value: JsonObject): boolean {
  const request = value.requestInput
  const output = value.outputGroup
  if (!isObject(request) || !isObject(output)) return false
  if (request.kind !== 'known') return true
  return (
    isObject(request.countingBasis) &&
    request.projectionRevision === request.countingBasis.projectionRevision &&
    (output.kind !== 'known' || output.projectionRevision === request.projectionRevision)
  )
}

function freeze(value: JsonValue): void {
  if (value === null || typeof value !== 'object') return
  for (const child of Object.values(value)) freeze(child)
  Object.freeze(value)
}

/** Own a lossless frozen fragment. This does not authenticate its upstream provenance. */
export function copyInputCalibration(
  value: unknown,
): { readonly ok: InputCalibration } | { readonly rejected: 'malformed' } {
  const copied = snapshot(value)
  if (!isObject(copied) || !validate('InputCalibration', copied).valid || !localRelations(copied))
    return Object.freeze({ rejected: 'malformed' as const })
  freeze(copied)
  // The fixed Schema and local predicates above establish precisely this shared value shape.
  return Object.freeze({ ok: copied as unknown as InputCalibration })
}

function requestBindingMatches(request: JsonObject, route: JsonObject): boolean {
  if (request.kind === 'known') {
    const basis = request.countingBasis
    if (
      !isObject(basis) ||
      basis.binding === undefined ||
      route.adaptation === undefined ||
      !equal(basis.binding, route.adaptation)
    )
      return false
  }
  return true
}

function observedAmountsValid(observed: JsonObject, usage: JsonObject): boolean {
  const amounts = [usage.input_tokens, usage.cache_read_tokens, usage.cache_write_tokens]
  const known = amounts.filter(isJsonNumber)
  if (observed.kind === 'from_usage') {
    if (known.length !== 3 || usage.source !== 'upstream') return false
  } else {
    if (known.length === 3 || !isJsonNumber(observed.tokens)) return false
    const sum = known.reduce(
      (total, amount) => total.add(ExactDecimal.from(amount)),
      ExactDecimal.from(0),
    )
    if (sum.compare(ExactDecimal.from(observed.tokens)) > 0) return false
  }
  return true
}

function provenanceMatches(provenance: JsonObject, route: JsonObject): boolean {
  for (const name of ['upstreamRequestId', 'upstreamModel', 'servingProvider']) {
    if (
      provenance[name] !== undefined &&
      route[name] !== undefined &&
      provenance[name] !== route[name]
    )
      return false
  }
  return true
}

function observedInputMatches(observed: JsonObject, route: JsonObject, usage: JsonObject): boolean {
  if (observed.kind === 'unavailable') return true
  if (!observedAmountsValid(observed, usage)) return false
  const provenance = observed.provenance
  if (!isObject(provenance)) return false
  return provenanceMatches(provenance, route)
}

function outputGroupMatches(output: JsonObject, value: JsonObject): boolean {
  if (output.kind === 'known') {
    const blocks =
      output.source === 'reply'
        ? isObject(value.reply)
          ? value.reply.blocks
          : undefined
        : output.source === 'delivered'
          ? value.delivered
          : value.reply === undefined && value.delivered === undefined
            ? []
            : undefined
    if (
      !Array.isArray(blocks) ||
      !Array.isArray(output.blockDigests) ||
      blocks.length !== output.blockDigests.length
    )
      return false
  }
  return true
}

/** MR11 S-44: called only after member shape and the existing named rejection checks. */
export function calibrationRelationsValid(value: JsonObject): boolean {
  const calibration = value.inputCalibration
  const route = value.route
  const usage = value.usage
  if (!isObject(calibration) || !isObject(route) || !isObject(usage)) return false
  if (!localRelations(calibration)) return false
  const request = calibration.requestInput
  const observed = calibration.observedInput
  const output = calibration.outputGroup
  if (!isObject(request) || !isObject(observed) || !isObject(output)) return false
  return (
    requestBindingMatches(request, route) &&
    observedInputMatches(observed, route, usage) &&
    outputGroupMatches(output, value)
  )
}
