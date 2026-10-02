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
import { judgeAgentDefinitionBody } from '@omne-harness-lite/agent-definition'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { assetJudge, defaultBodyContracts } from './defaults.ts'
import { invalidInput } from './diagnostics.ts'
import { copyJson, immutable, object, own } from './json.ts'
import { computeEvaluation, selectAssets, versionOf, type EvaluationFacts } from './compute.ts'
import type {
  InputDiagnostic,
  NonConnectorEvaluationInput,
  EvaluationResult,
  EvaluationRootSelectionInput,
  EvaluationRootSelectionResult,
} from './types.ts'

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
function shape(
  input: NonConnectorEvaluationInput | EvaluationRootSelectionInput,
): InputDiagnostic | undefined {
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
    (!Object.hasOwn(raw, 'rootDefinition') &&
      (!object(raw.root) || !Array.isArray(raw.root.references)))
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
  const root = object(raw.root) ? raw.root : undefined
  const rootBad = reject(
    'CapabilityId',
    Object.hasOwn(raw, 'rootDefinition') ? raw.rootDefinition : root?.definition,
  )
  if (rootBad !== undefined) return rootBad
  for (const reference of root !== undefined && Array.isArray(root.references)
    ? root.references
    : []) {
    if (
      !object(reference) ||
      Object.keys(reference).some(key => key !== 'capability' && key !== 'resident') ||
      (Object.hasOwn(reference, 'resident') && typeof reference.resident !== 'boolean')
    )
      return { condition: 'C1', message: 'AssetReference' }
    const bad = reject('CapabilityId', reference.capability)
    if (bad !== undefined) return bad
  }
  if (root !== undefined) {
    const source = root.source
    if (
      Object.keys(root).some(
        key => !['definition', 'references', 'attributes', 'source'].includes(key),
      ) ||
      !object(source) ||
      Object.keys(source).length !== 2 ||
      reject('AssetRecordId', source.asset) !== undefined ||
      !isJsonNumber(source.version) ||
      !ExactDecimal.from(source.version).isInteger ||
      ExactDecimal.from(source.version).compare(ExactDecimal.from(0)) <= 0 ||
      !Array.isArray(root.attributes) ||
      !('ok' in judgeAgentDefinitionBody(copyJson({ references: [], attributes: root.attributes })))
    )
      return { condition: 'C15', message: 'root declarations or source shape' }
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
function projectFacts(
  input: NonConnectorEvaluationInput | EvaluationRootSelectionInput,
): EvaluationFacts {
  const definitions = new Map(input.definitions.map(entry => [entry.id, entry]))
  const declarations = new Map<AssetHolding, readonly AttributeDeclaration[]>()
  const references = new Map<AssetVersion, readonly CapabilityId[]>()
  for (const holding of input.holdings) {
    const definition = definitions.get(holding.asset)
    if (definition === undefined) continue
    const version = versionOf(holding, definition)
    if (version === undefined) continue
    const action = ('mcpActionSets' in input ? input.mcpActionSets : undefined)?.find(
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
      'root' in input &&
        capabilityCanonicalString(holding.capability) ===
          capabilityCanonicalString(input.root.definition)
        ? [USABLE_BY_DECLARATION, ...input.root.attributes]
        : 'underivable' in derived
          ? [USABLE_BY_DECLARATION]
          : derived.declarations,
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
  if (bad !== undefined) return invalidInput(bad)
  return computeEvaluation(input, projectFacts(input))
}

export function selectEvaluationRootSource(
  input: EvaluationRootSelectionInput,
): EvaluationRootSelectionResult {
  try {
    const bad = shape(input)
    if (bad !== undefined) return invalidInput(bad)
    const selection = selectAssets(input, projectFacts(input))
    if ('invalidInput' in selection) return selection
    const root = selection.selected.get(capabilityCanonicalString(input.rootDefinition))
    return root === undefined
      ? immutable({ missing: true })
      : immutable({ ok: { asset: root.definition.id, version: root.version.number } })
  } catch (error) {
    if (error instanceof BodyProviderUnavailableError) return immutable({ unavailable: true })
    throw error
  }
}
