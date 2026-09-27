import {
  BodyProviderUnavailableError,
  capabilityCanonicalString,
  attributeDeclarationsOf,
  referencesOf,
  USABLE_BY_DECLARATION,
  type AssetHolding,
  type AssetVersion,
  type AttributeDeclaration,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import { parseMembershipStanding, parseTenantId } from '@omne-harness-lite/identity-values'
import { judgeMcpValue } from '@omne-harness-lite/mcp-endpoint'
import { assetJudge, defaultBodyContracts } from './defaults.ts'
import { copyJson, immutable, object } from './json.ts'
import { computeEvaluation, versionOf, type EvaluationFacts } from './compute.ts'
import type { InputDiagnostic, NonConnectorEvaluationInput, EvaluationResult } from './types.ts'

const own = (input: unknown, member: string): unknown => (object(input) ? input[member] : undefined)
const layers = ['factory', 'organization', 'tenant', 'workspace'] as const
// Only actual record/content positions constrain the current provider domain. JSON bodies and identifiers are opaque here.
function checkAvailability(input: unknown): void {
  const definitions = own(input, 'definitions')
  if (!Array.isArray(definitions)) return
  for (const definition of definitions) {
    if (
      own(own(definition, 'capability'), 'category') === 'connector' ||
      own(own(definition, 'draft'), 'category') === 'connector'
    )
      throw new BodyProviderUnavailableError()
    const versions = own(definition, 'versions')
    if (
      Array.isArray(versions) &&
      versions.some(version => own(own(version, 'content'), 'category') === 'connector')
    )
      throw new BodyProviderUnavailableError()
  }
}
function shape(input: NonConnectorEvaluationInput): InputDiagnostic | undefined {
  let raw: unknown
  try {
    raw = copyJson(input)
  } catch (error) {
    if (error instanceof TypeError) return { condition: 'C1', message: 'not JSON data' }
    throw error
  }
  checkAvailability(raw)
  if (
    !object(raw) ||
    !Array.isArray(raw.holdings) ||
    !Array.isArray(raw.definitions) ||
    !object(raw.root) ||
    !Array.isArray(raw.root.references)
  )
    return { condition: 'C1', message: 'required EvaluationInput members' }
  if (
    'invalidInput' in parseTenantId(raw.tenant) ||
    'invalidInput' in parseMembershipStanding(raw.standing)
  )
    return { condition: 'C1', message: 'identity shape' }
  const reject = (
    name: Parameters<typeof assetJudge.judgeAssetValue>[0],
    value: unknown,
  ): InputDiagnostic | undefined => {
    const result = assetJudge.judgeAssetValue(name, value)
    return 'rejected' in result
      ? { condition: 'C1', message: name, rejected: result.rejected }
      : undefined
  }
  if (Object.hasOwn(raw, 'workspace')) {
    const bad = reject('WorkspaceKey', raw.workspace)
    if (bad !== undefined) return bad
  }
  const rootBad = reject('CapabilityId', raw.root.definition)
  if (rootBad !== undefined) return rootBad
  for (const reference of raw.root.references) {
    if (
      !object(reference) ||
      (Object.hasOwn(reference, 'resident') && typeof reference.resident !== 'boolean')
    )
      return { condition: 'C1', message: 'AssetReference' }
    const bad = reject('CapabilityId', reference.capability)
    if (bad !== undefined) return bad
  }
  for (const [name, entries] of [
    ['AssetHolding', raw.holdings],
    ['AssetDefinition', raw.definitions],
  ] as const) {
    for (const entry of entries) {
      const bad = reject(name, entry)
      if (bad !== undefined) return bad
    }
  }
  if (Object.hasOwn(raw, 'session')) {
    if (!Array.isArray(raw.session)) return { condition: 'C1', message: 'session list' }
    for (const entry of raw.session) {
      if (!object(entry)) return { condition: 'C1', message: 'SessionAssignment' }
      for (const [name, member] of [
        ['CapabilityId', 'capability'],
        ['AttributeAssignment', 'assignment'],
      ] as const) {
        const bad = reject(name, entry[member])
        if (bad !== undefined) return bad
      }
    }
  }
  if (Object.hasOwn(raw, 'mcpActionSets')) {
    if (!Array.isArray(raw.mcpActionSets)) return { condition: 'C1', message: 'mcpActionSets list' }
    for (const entry of raw.mcpActionSets) {
      if (
        !object(entry) ||
        typeof entry.scope !== 'string' ||
        ![...layers, 'session'].includes(entry.scope)
      )
        return { condition: 'C1', message: 'McpActionSet' }
      const bad = reject('CapabilityId', entry.endpoint)
      if (bad !== undefined) return bad
      const result = judgeMcpValue('ActionSnapshot', entry.actions)
      if ('rejected' in result)
        return { condition: 'C1', message: 'ActionSnapshot', rejected: result.rejected }
    }
  }
  return undefined
}

/** Project only resolvable held versions. Invalid C5/C9 inputs are left to the shared computation, never thrown during projection. */
function projectFacts(input: NonConnectorEvaluationInput): EvaluationFacts {
  const definitions = new Map(input.definitions.map(entry => [entry.id, entry]))
  const declarations = new Map<AssetHolding, readonly AttributeDeclaration[]>()
  const references = new Map<AssetVersion, readonly CapabilityId[]>()
  for (const holding of input.holdings) {
    const definition = definitions.get(holding.asset)
    if (definition === undefined) continue
    const version = versionOf(holding, definition)
    if (version === undefined) continue
    const action = input.mcpActionSets?.find(
      entry =>
        capabilityCanonicalString(entry.endpoint) ===
          capabilityCanonicalString(holding.capability) && entry.scope === holding.holder.layer,
    )
    const derived =
      version.content.category === 'mcp'
        ? attributeDeclarationsOf(
            version.content,
            defaultBodyContracts,
            action?.actions.kind === 'fetched' ? copyJson(action.actions) : undefined,
          )
        : attributeDeclarationsOf(version.content, defaultBodyContracts)
    declarations.set(
      holding,
      'underivable' in derived ? [USABLE_BY_DECLARATION] : derived.declarations,
    )
    if (!references.has(version)) {
      const derivedReferences = referencesOf(version.content, defaultBodyContracts)
      if (!('underivable' in derivedReferences))
        references.set(version, derivedReferences.references)
    }
  }
  return { declarations, references }
}

export function evaluate(input: NonConnectorEvaluationInput): EvaluationResult {
  const bad = shape(input)
  if (bad !== undefined) return immutable({ invalidInput: { diagnostics: [bad] } })
  return computeEvaluation(input, projectFacts(input))
}
