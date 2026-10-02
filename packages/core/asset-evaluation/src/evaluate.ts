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
import { isJsonNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { assetJudge, defaultBodyContracts } from './defaults.ts'
import { invalidInput } from './diagnostics.ts'
import { copyJson, immutable, object, own } from './json.ts'
import { computeEvaluation } from './compute.ts'
import { versionOf, type EvaluationFacts } from './holdings.ts'
import { selectAssets } from './selection.ts'
import type {
  InputDiagnostic,
  NonConnectorEvaluationInput,
  EvaluationResult,
  EvaluationRootSelectionInput,
  EvaluationRootSelectionResult,
} from './types.ts'

type RawInput = NonConnectorEvaluationInput | EvaluationRootSelectionInput
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
/** C1 through the asset-model judge: the rejection becomes the diagnostic's `rejected`. */
function rejected(
  name: Parameters<typeof assetJudge.judgeAssetValue>[0],
  value: unknown,
): InputDiagnostic | undefined {
  const result = assetJudge.judgeAssetValue(name, value)
  return 'rejected' in result
    ? { condition: 'C1', message: name, rejected: result.rejected }
    : undefined
}
function requiredMembersDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  if (
    !Array.isArray(raw.holdings) ||
    !Array.isArray(raw.definitions) ||
    (!Object.hasOwn(raw, 'rootDefinition') &&
      (!object(raw.root) || !Array.isArray(raw.root.references)))
  )
    return { condition: 'C1', message: 'required EvaluationInput members' }
  return undefined
}
function identityDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  if (
    'invalidInput' in parseTenantId(raw.tenant) ||
    'invalidInput' in parseMembershipStanding(raw.standing)
  )
    return { condition: 'C1', message: 'identity shape' }
  return undefined
}
function workspaceDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  return Object.hasOwn(raw, 'workspace') ? rejected('WorkspaceKey', raw.workspace) : undefined
}
/** C1 for each `root.references` entry: only `capability` and an optional boolean `resident`. */
function referencesDiagnostic(root: JsonObject): InputDiagnostic | undefined {
  for (const reference of Array.isArray(root.references) ? root.references : []) {
    if (
      !object(reference) ||
      Object.keys(reference).some(key => key !== 'capability' && key !== 'resident') ||
      (Object.hasOwn(reference, 'resident') && typeof reference.resident !== 'boolean')
    )
      return { condition: 'C1', message: 'AssetReference' }
    const bad = rejected('CapabilityId', reference.capability)
    if (bad !== undefined) return bad
  }
  return undefined
}
/** C15: the root carries exactly its four members, a well-formed source and declarations AD1 accepts. */
function rootDeclarationsDiagnostic(root: JsonObject): InputDiagnostic | undefined {
  const source = root.source
  if (
    Object.keys(root).some(
      key => !['definition', 'references', 'attributes', 'source'].includes(key),
    ) ||
    !object(source) ||
    Object.keys(source).length !== 2 ||
    rejected('AssetRecordId', source.asset) !== undefined ||
    !isJsonNumber(source.version) ||
    !ExactDecimal.from(source.version).isInteger ||
    ExactDecimal.from(source.version).compare(ExactDecimal.from(0)) <= 0 ||
    !Array.isArray(root.attributes) ||
    !('ok' in judgeAgentDefinitionBody(copyJson({ references: [], attributes: root.attributes })))
  )
    return { condition: 'C15', message: 'root declarations or source shape' }
  return undefined
}
/** The root capability (either input form), then the composition root's references and declarations. */
function rootDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  const root = object(raw.root) ? raw.root : undefined
  const bad = rejected(
    'CapabilityId',
    Object.hasOwn(raw, 'rootDefinition') ? raw.rootDefinition : root?.definition,
  )
  if (bad !== undefined) return bad
  if (root === undefined) return undefined
  return referencesDiagnostic(root) ?? rootDeclarationsDiagnostic(root)
}
/** C1 for every holding and definition record. */
function recordsDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  for (const [name, entries] of [
    ['AssetHolding', raw.holdings],
    ['AssetDefinition', raw.definitions],
  ] as const) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const bad = rejected(name, entry)
      if (bad !== undefined) return bad
    }
  }
  return undefined
}
function sessionDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  if (!Object.hasOwn(raw, 'session')) return undefined
  if (!Array.isArray(raw.session)) return { condition: 'C1', message: 'session list' }
  for (const entry of raw.session) {
    if (!object(entry)) return { condition: 'C1', message: 'SessionAssignment' }
    for (const [name, member] of [
      ['CapabilityId', 'capability'],
      ['AttributeAssignment', 'assignment'],
    ] as const) {
      const bad = rejected(name, entry[member])
      if (bad !== undefined) return bad
    }
  }
  return undefined
}
function actionSetsDiagnostic(raw: JsonObject): InputDiagnostic | undefined {
  if (!Object.hasOwn(raw, 'mcpActionSets')) return undefined
  if (!Array.isArray(raw.mcpActionSets)) return { condition: 'C1', message: 'mcpActionSets list' }
  for (const entry of raw.mcpActionSets) {
    if (
      !object(entry) ||
      typeof entry.scope !== 'string' ||
      ![...layers, 'session'].includes(entry.scope)
    )
      return { condition: 'C1', message: 'McpActionSet' }
    const bad = rejected('CapabilityId', entry.endpoint)
    if (bad !== undefined) return bad
    const result = judgeMcpValue('ActionSnapshot', entry.actions)
    if ('rejected' in result)
      return { condition: 'C1', message: 'ActionSnapshot', rejected: result.rejected }
  }
  return undefined
}
/** C1 and C15 on the JSON snapshot of the input, in the contract's member order. */
function shape(input: RawInput): InputDiagnostic | undefined {
  let raw: unknown
  try {
    raw = copyJson(input)
  } catch (error) {
    if (error instanceof TypeError) return { condition: 'C1', message: 'not JSON data' }
    throw error
  }
  checkAvailability(raw)
  if (!object(raw)) return { condition: 'C1', message: 'required EvaluationInput members' }
  return (
    requiredMembersDiagnostic(raw) ??
    identityDiagnostic(raw) ??
    workspaceDiagnostic(raw) ??
    rootDiagnostic(raw) ??
    recordsDiagnostic(raw) ??
    sessionDiagnostic(raw) ??
    actionSetsDiagnostic(raw)
  )
}

/** The declarations the body contract derives for a held version; mcp bodies read the pinned action set at that scope. */
function derivedDeclarations(
  input: RawInput,
  holding: AssetHolding,
  version: AssetVersion,
): ReturnType<typeof attributeDeclarationsOf> {
  const action = ('mcpActionSets' in input ? input.mcpActionSets : undefined)?.find(
    entry =>
      capabilityCanonicalString(entry.endpoint) === capabilityCanonicalString(holding.capability) &&
      entry.scope === holding.holder.layer,
  )
  return version.content.category === 'mcp'
    ? attributeDeclarationsOf(
        version.content,
        defaultBodyContracts,
        action?.actions.kind === 'fetched' ? copyJson(action.actions) : undefined,
      )
    : attributeDeclarationsOf(version.content, defaultBodyContracts)
}
/** The declarations a held version projects: the root's explicit attributes, else what its body derives, else only usableBy. */
function heldDeclarations(
  input: RawInput,
  holding: AssetHolding,
  version: AssetVersion,
): readonly AttributeDeclaration[] {
  const derived = derivedDeclarations(input, holding, version)
  if (
    'root' in input &&
    capabilityCanonicalString(holding.capability) ===
      capabilityCanonicalString(input.root.definition)
  )
    return [USABLE_BY_DECLARATION, ...input.root.attributes]
  return 'underivable' in derived ? [USABLE_BY_DECLARATION] : derived.declarations
}
/** Project only resolvable held versions. Invalid C5/C9 inputs are left to the shared computation, never thrown during projection. */
function projectFacts(input: RawInput): EvaluationFacts {
  const definitions = new Map(input.definitions.map(entry => [entry.id, entry]))
  const declarations = new Map<AssetHolding, readonly AttributeDeclaration[]>()
  const references = new Map<AssetVersion, readonly CapabilityId[]>()
  for (const holding of input.holdings) {
    const definition = definitions.get(holding.asset)
    if (definition === undefined) continue
    const version = versionOf(holding, definition)
    if (version === undefined) continue
    declarations.set(holding, heldDeclarations(input, holding, version))
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
