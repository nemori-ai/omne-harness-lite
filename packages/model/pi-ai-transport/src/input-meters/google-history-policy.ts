import {
  isNonNegativeJsonInteger,
  readOpaqueJson,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { InputMeter } from '../input-meter.ts'
import type { OriginalBasisApplies } from '../meter-transform.ts'
import { object } from '../json.ts'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from '../projection.ts'
import type {
  OutputGroupSource,
  OutputHistoryPolicy,
  OutputUnitClassification,
} from './output-history.ts'

// Google revision 4 (google-reasoning-history-output-group-candidate.md): finite facts only.
// Traversal, source ownership, completeness and O arithmetic stay in the shared core.

/** Visible Gemma 4 surrogate of the published V3 meter; also the explained V3 source row. */
export const GOOGLE_VISIBLE_ALGORITHM = 'gemma4-visible-text-tools-effort-offset6-2'
/** Set explicitly on V4; never derived from the V4 algorithm name (K5). */
export const GOOGLE_TOKENIZER_REVISION = `tokenizer-basis/${GOOGLE_VISIBLE_ALGORITHM}`
export const GOOGLE_HISTORY_ALGORITHM = 'gemma4-visible-offset6-complete-output-group-estimated/1'
export const GOOGLE_HISTORY_EVIDENCE =
  'Google revision 4 (D-107 successor, mechanism first): one complete same-model original upstream O of an E-only google-gemini-v1 reasoning.encrypted group is counted once as a workload-related estimated input proxy, reasoning included, with zero estimated net group framing; not exact occupancy, no error bound, error direction unknown. Identity pair servingProvider "Google AI Studio" / upstreamModel = route id from the 2026-09-30 real raw SSE originals gen-1790765022-soWzJ2kSKKIdOhKsWM7Z (gemini-3.8-flash) and gen-1790765039-T89IaeRcxSpJm8DIEXzO (gemini-3.7-flash). T-only, signed text, summary and redacted groups stay unavailable. Upstream acceptance of verbatim replay (GG-4) and the E id / generated tool-call id mismatch (GG-14) are unobserved.'

const PROVIDER = 'google-ai-studio'
const IMPLEMENTATION = 'pi-ai:google'
const FORMAT = 'google-gemini-v1'
const TRANSFORM = 'openrouter-wire/2'
// Shared default name for families without φ; V3 and V4 both keep it (K5).
const REPLAY = 'unsupported-marginal/1'
const SERVING_PROVIDER = 'Google AI Studio'

/**
 * The V4 definition and implementation revisions. They are published together with
 * GOOGLE_HISTORY_ALGORITHM only after the main line pins them (K7); until then a caller
 * supplies them explicitly and nothing in the official catalog uses this mechanism.
 */
export interface GoogleHistoryRelease {
  readonly definitionRevision: string
  readonly implementationRevision: string
}

interface BasisRow {
  readonly definition: string
  readonly implementation: string
  readonly algorithm: string
  readonly replay: string
  readonly projection: string
}
/** The published V3 row: saved facts to explain, never a current execution factory. */
const V3: BasisRow = {
  definition: '3',
  implementation: 'mp4-17',
  algorithm: GOOGLE_VISIBLE_ALGORITHM,
  replay: REPLAY,
  projection: INPUT_PROJECTION_REVISION,
}
// Earlier Google coordinates are not in the table; a release may not reuse any of them.
const retiredDefinitions: readonly string[] = ['1', '2', V3.definition]
const retiredImplementations: readonly string[] = ['mp4-2', 'mp4-3', V3.implementation]

/**
 * Literal OpenRouter serving identity per leaf, taken from the 2026-09-30 real raw SSE
 * originals (research/model-request-adaptation/vendor-continuation/google/
 * 2026-09-30-complete-reply-originals.md): every frame carried `provider: "Google AI Studio"`
 * and `model` equal to the exact route id. Matching is byte-exact.
 */
interface GoogleRow {
  readonly modelId: string
  readonly identity: { readonly servingProvider: string; readonly upstreamModel: string }
}
const rows: readonly GoogleRow[] = [
  {
    modelId: 'google/gemini-3.8-flash',
    identity: { servingProvider: SERVING_PROVIDER, upstreamModel: 'google/gemini-3.8-flash' },
  },
  {
    modelId: 'google/gemini-3.7-flash',
    identity: { servingProvider: SERVING_PROVIDER, upstreamModel: 'google/gemini-3.7-flash' },
  },
]

export function googleHistoryRow(modelId: string): GoogleRow | undefined {
  return rows.find(row => row.modelId === modelId)
}

/** A release is a new, distinct V4 row: both revisions nonempty and never a retired value. */
export function googleHistoryReleaseValid(value: unknown): value is GoogleHistoryRelease {
  if (!object(value) || Object.keys(value).length !== 2) return false
  const definition = value.definitionRevision
  const implementation = value.implementationRevision
  return (
    typeof definition === 'string' &&
    definition.length > 0 &&
    typeof implementation === 'string' &&
    implementation.length > 0 &&
    !retiredDefinitions.includes(definition) &&
    !retiredImplementations.includes(implementation)
  )
}

function exactMembers(value: JsonObject, members: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === members.length && members.every(member => Object.hasOwn(value, member))
}
function carried(value: JsonValue | undefined): value is string {
  // OpenRouter may substitute this literal placeholder for streamed material (R-M).
  return typeof value === 'string' && value.length > 0 && value !== '[REDACTED]'
}

/**
 * E: exactly type/data/format/id/index, `reasoning.encrypted`, a carried ciphertext, a nonempty
 * string id and a nonnegative integer index. T: exactly type/text/format/index,
 * `reasoning.text` with carried text. Anything else (signed text, signature-only, summary,
 * missing or invalid id, extra members, another format) is `other`.
 */
export function googleDetailShape(detail: JsonValue): 'encrypted' | 'text' | 'other' {
  if (!object(detail) || detail.format !== FORMAT || !isNonNegativeJsonInteger(detail.index))
    return 'other'
  if (
    detail.type === 'reasoning.encrypted' &&
    exactMembers(detail, ['type', 'data', 'format', 'id', 'index']) &&
    carried(detail.data) &&
    typeof detail.id === 'string' &&
    detail.id.length > 0
  )
    return 'encrypted'
  if (
    detail.type === 'reasoning.text' &&
    exactMembers(detail, ['type', 'text', 'format', 'index']) &&
    carried(detail.text)
  )
    return 'text'
  return 'other'
}

function encryptedOnly(details: JsonValue | undefined): boolean {
  return (
    Array.isArray(details) &&
    details.length > 0 &&
    details.every(detail => googleDetailShape(detail) === 'encrypted')
  )
}

/**
 * A unit without details is visible (the Gemma 4 path). An assistant unit without a
 * `reasoning` member whose details are all E is a whole group. Everything else, including a
 * T-only unit (K2 candidate a until GS-V10, GG-13), is uninterpretable. The meter never checks
 * the E id against the unit's tool calls: the replayed call id is projection-generated (GG-14).
 */
export function classifyGoogleUnit(unit: JsonValue): OutputUnitClassification {
  if (!object(unit)) return 'uninterpretable'
  if (!Object.hasOwn(unit, 'reasoning_details')) return 'visible'
  return unit.role === 'assistant' &&
    !Object.hasOwn(unit, 'reasoning') &&
    encryptedOnly(unit.reasoning_details)
    ? 'wholeGroup'
    : 'uninterpretable'
}

interface ReportedIdentity {
  readonly servingProvider?: string | undefined
  readonly upstreamModel?: string | undefined
}
/** K4 (xAI guard 4): both absent is admitted and never backfilled; otherwise the exact pair. */
function identityApplies(row: GoogleRow, reported: ReportedIdentity): boolean {
  if (reported.servingProvider === undefined && reported.upstreamModel === undefined) return true
  return (
    reported.servingProvider === row.identity.servingProvider &&
    reported.upstreamModel === row.identity.upstreamModel
  )
}
function sameIdentity(a: ReportedIdentity, b: ReportedIdentity): boolean {
  return a.servingProvider === b.servingProvider && a.upstreamModel === b.upstreamModel
}
const effortApplies = (value: JsonValue | undefined) =>
  value === undefined || value === 'low' || value === 'medium' || value === 'high'

/** The Google output-history policy for one V4 release; V3 is the only other table row. */
export function googleOutputHistoryPolicy(release: GoogleHistoryRelease): OutputHistoryPolicy {
  if (!googleHistoryReleaseValid(release)) throw new TypeError('invalid Google history release')
  const V4: BasisRow = {
    definition: release.definitionRevision,
    implementation: release.implementationRevision,
    algorithm: GOOGLE_HISTORY_ALGORITHM,
    replay: REPLAY,
    projection: INPUT_PROJECTION_REVISION,
  }
  const table = [V3, V4]
  const originalRow = (definition: string, implementation: string) =>
    table.find(row => row.definition === definition && row.implementation === implementation)

  function currentMeterApplies(meter: InputMeter, row: GoogleRow): boolean {
    return (
      meter.modelId === row.modelId &&
      meter.provider === PROVIDER &&
      meter.definitionRevision === V4.definition &&
      meter.implementation.name === IMPLEMENTATION &&
      meter.implementation.revision === V4.implementation &&
      meter.algorithmRevision === V4.algorithm &&
      meter.tokenizerRevision === GOOGLE_TOKENIZER_REVISION &&
      meter.replayRevision === V4.replay &&
      meter.transformRevision === TRANSFORM
    )
  }

  function originalBasisApplies(meter: InputMeter): OriginalBasisApplies {
    return (basis: CountingBasis, base) => {
      const row = googleHistoryRow(meter.modelId)
      if (!row || !currentMeterApplies(meter, row)) return false
      const original = originalRow(
        basis.binding.definition.revision,
        basis.binding.implementation.revision,
      )
      return (
        original !== undefined &&
        base.base === TRANSFORM &&
        basis.model === row.modelId &&
        basis.provider === PROVIDER &&
        basis.binding.definition.modelId === row.modelId &&
        basis.binding.implementation.name === IMPLEMENTATION &&
        basis.meterRevision === original.algorithm &&
        basis.tokenizerRevision === GOOGLE_TOKENIZER_REVISION &&
        basis.replayRevision === original.replay &&
        basis.projectionRevision === original.projection
      )
    }
  }

  function sourceApplies(
    source: OutputGroupSource,
    meter: InputMeter,
    envelope: JsonObject,
  ): boolean {
    const row = googleHistoryRow(meter.modelId)
    if (!row || !currentMeterApplies(meter, row)) return false
    const reasoning = envelope.reasoning
    if (
      envelope.model !== row.modelId ||
      !object(envelope.provider) ||
      canonicalProjection(envelope.provider) !==
        canonicalProjection({
          order: [PROVIDER],
          allow_fallbacks: false,
          require_parameters: true,
        }) ||
      (reasoning !== undefined &&
        (!object(reasoning) ||
          Object.keys(reasoning).length !== 1 ||
          !effortApplies(reasoning.effort)))
    )
      return false
    const request = source.observation.inputCalibration.requestInput
    const basis = request.kind === 'known' ? request.countingBasis : undefined
    if (basis && basis.provider !== PROVIDER) return false
    const binding = source.origin?.adaptation ?? basis?.binding
    if (
      !binding ||
      binding.definition.modelId !== row.modelId ||
      binding.implementation.name !== IMPLEMENTATION ||
      !originalRow(binding.definition.revision, binding.implementation.revision)
    )
      return false
    const origin = source.origin
    if (
      origin &&
      (origin.provider !== PROVIDER ||
        !effortApplies(origin.parameters.reasoningEffort) ||
        (origin.parameters.extra !== undefined &&
          Object.keys(origin.parameters.extra).length > 0) ||
        !identityApplies(row, origin))
    )
      return false
    const observed = source.observation.inputCalibration.observedInput
    if (
      observed.kind !== 'unavailable' &&
      (observed.provenance.adapterRevision !== 'openrouter-usage-reader/2' ||
        !identityApplies(row, observed.provenance) ||
        (origin !== undefined && !sameIdentity(origin, observed.provenance)))
    )
      return false
    // Every opaque thinking block of the group is this route's E-only details; at least one.
    const opaque = source.observation.outputBlocks.flatMap(block =>
      block.kind === 'thinking' && block.opaque !== undefined ? [readOpaqueJson(block.opaque)] : [],
    )
    return (
      opaque.length > 0 &&
      opaque.every(
        value =>
          object(value) &&
          exactMembers(value, ['routeName', 'reasoning_details']) &&
          value.routeName === row.modelId &&
          encryptedOnly(value.reasoning_details),
      )
    )
  }

  return Object.freeze({
    classifyUnit: classifyGoogleUnit,
    sourceApplies,
    originalBasisApplies,
    // No Google research on prefix binding (GG-3); prefix changes are outside the scope (G-R2).
    requiresSignedPrefix: () => false,
    projectionRevisionApplies: (revision: string) => revision === INPUT_PROJECTION_REVISION,
  })
}
