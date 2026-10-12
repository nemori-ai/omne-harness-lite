import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { TENANT_ROLES } from '@omne-harness-lite/identity-values'
import type {
  AssetContent,
  AssetCategory,
  AttributeDeclaration,
  BodyCategory,
  BodyContractSupply,
  DeclarationResult,
} from './types.ts'
import { isObject } from './json.ts'
import type { AssetModelJudge } from './judge.ts'
import { connectorContract } from './availability.ts'

export const DISABLED_DECLARATION: AttributeDeclaration = Object.freeze({
  item: 'disabled',
  kind: 'setting',
  category: 'governance',
  domain: Object.freeze({ kind: 'open', schema: Object.freeze({ type: 'boolean' }) }),
  default: false,
})
export const USABLE_BY_DECLARATION: AttributeDeclaration = Object.freeze({
  item: 'usableBy',
  kind: 'permission',
  domain: Object.freeze({ kind: 'enum', values: Object.freeze([...TENANT_ROLES, 'self']) }),
  default: 'self',
})
function copyJson(value: JsonValue): JsonValue {
  const copied = readJsonStrict(writeJsonLossless(value))
  if ('failed' in copied) throw new Error('lossless writer produced invalid JSON')
  return copied.ok
}
function pinDeclaration(declaration: AttributeDeclaration): AttributeDeclaration {
  if (declaration.kind === 'permission')
    return Object.freeze({
      item: declaration.item,
      kind: 'permission',
      domain: Object.freeze({
        kind: 'enum',
        values: Object.freeze([...declaration.domain.values]),
      }),
      default: declaration.default,
    })
  const schema = copyJson(declaration.domain.schema)
  if (typeof schema !== 'boolean' && !isObject(schema))
    throw new TypeError('body rule produced an invalid setting Schema')
  const domain = Object.freeze({ kind: 'open' as const, schema })
  if (declaration.category === 'preference' || declaration.category === 'binding')
    return Object.freeze({
      item: declaration.item,
      kind: 'setting',
      category: declaration.category,
      domain,
      default: copyJson(declaration.default),
    })
  return Object.freeze({
    item: declaration.item,
    kind: 'setting',
    category: declaration.category,
    domain,
    ...(declaration.default === undefined ? {} : { default: copyJson(declaration.default) }),
  })
}
type SnapshotKind = 'fetched' | 'not_fetched'
/** Only MCP accepts an action snapshot, and a supplied one must say which kind it is. */
function suppliedSnapshotKind(
  category: AssetCategory,
  actionSnapshot: JsonValue | undefined,
): SnapshotKind | undefined {
  if (actionSnapshot === undefined) return undefined
  if (category !== 'mcp') throw new TypeError('only MCP declarations accept an action snapshot')
  if (
    !isObject(actionSnapshot) ||
    !Object.hasOwn(actionSnapshot, 'kind') ||
    (actionSnapshot.kind !== 'fetched' && actionSnapshot.kind !== 'not_fetched')
  )
    throw new TypeError('MCP action snapshot requires its actual kind')
  return actionSnapshot.kind
}
function deriveBodyDeclarations(
  bodies: BodyContractSupply,
  content: Extract<AssetContent, { readonly category: BodyCategory }>,
  actionSnapshot: JsonValue | undefined,
): DeclarationResult {
  return content.category === 'tool'
    ? bodies.tool.deriveDeclarations(content.definition)
    : content.category === 'loop_extension'
      ? bodies.loop_extension.deriveDeclarations(content.extension)
      : content.category === 'mcp'
        ? bodies.mcp.deriveDeclarations(content.body, actionSnapshot)
        : content.category === 'skill'
          ? bodies.skill.deriveDeclarations(content.body)
          : content.category === 'connector'
            ? connectorContract(bodies).deriveDeclarations(content.body)
            : bodies.slash_command.deriveDeclarations(content.body)
}
/** The MCP rule must echo the snapshot kind it was given; no other rule may carry the marker. */
function reportedSnapshotKind(
  category: AssetCategory,
  result: DeclarationResult,
  expected: SnapshotKind | undefined,
): SnapshotKind | undefined {
  if (category !== 'mcp') {
    if (Object.hasOwn(result, 'actionSnapshotKind'))
      throw new TypeError('only MCP body rules can carry an action snapshot marker')
    return undefined
  }
  if ('underivable' in result)
    throw new TypeError('MCP body rule cannot discard its known fixed declarations')
  if (!Object.hasOwn(result, 'actionSnapshotKind'))
    throw new TypeError('MCP body rule omitted its action snapshot knowledge marker')
  const marker = result.actionSnapshotKind
  if (marker !== undefined && marker !== 'fetched' && marker !== 'not_fetched')
    throw new TypeError('MCP body rule produced an invalid action snapshot marker')
  if (marker !== expected)
    throw new TypeError('MCP body rule action snapshot marker disagrees with its input')
  return marker
}
/** A body rule's declarations avoid the reserved items, repeat none, and are valid values. */
function checkBodyDeclarations(
  judgeAssetValue: AssetModelJudge['judgeAssetValue'],
  declarations: readonly AttributeDeclaration[],
): void {
  const seen = new Set<string>()
  for (const declaration of declarations) {
    if (
      declaration.item === 'disabled' ||
      declaration.item === 'usableBy' ||
      seen.has(declaration.item)
    )
      throw new TypeError('body rule produced reserved or duplicate declaration')
    if (declaration.kind === 'setting' && declaration.category === 'governance')
      throw new TypeError('this body category cannot declare governance settings')
    if ('rejected' in judgeAssetValue('AttributeDeclaration', declaration))
      throw new TypeError('body rule produced an invalid declaration')
    seen.add(declaration.item)
  }
}
export function deriveAttributeDeclarations<C extends AssetCategory>(
  content: AssetContent & { readonly category: C },
  bodies: BodyContractSupply,
  judgeAssetValue: AssetModelJudge['judgeAssetValue'],
  actionSnapshot?: JsonValue,
): DeclarationResult<C>
export function deriveAttributeDeclarations(
  content: AssetContent,
  bodies: BodyContractSupply,
  judgeAssetValue: AssetModelJudge['judgeAssetValue'],
  actionSnapshot?: JsonValue,
): DeclarationResult {
  const expectedSnapshotKind = suppliedSnapshotKind(content.category, actionSnapshot)
  if (content.category === 'agent_definition' || content.category === 'plugin')
    return Object.freeze({ underivable: content.category })
  const result = deriveBodyDeclarations(bodies, content, actionSnapshot)
  const actionSnapshotKind = reportedSnapshotKind(content.category, result, expectedSnapshotKind)
  if ('underivable' in result) {
    if (result.underivable !== content.category)
      throw new TypeError('body rule produced an underivable result for another category')
    return Object.freeze({ underivable: result.underivable })
  }
  if (content.category === 'connector')
    throw new TypeError('connector v1 declarations are underivable')
  checkBodyDeclarations(judgeAssetValue, result.declarations)
  const declarations = Object.freeze([
    ...result.declarations.map(pinDeclaration),
    DISABLED_DECLARATION,
    USABLE_BY_DECLARATION,
  ])
  return content.category === 'mcp'
    ? Object.freeze({ declarations, actionSnapshotKind })
    : Object.freeze({ declarations })
}
