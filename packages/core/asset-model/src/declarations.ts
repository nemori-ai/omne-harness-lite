import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type CapabilityId,
} from '@omne-harness-lite/content-blocks'
import { TENANT_ROLES } from '@omne-harness-lite/identity-values'
import type {
  AssetContent,
  AssetCategory,
  AttributeDeclaration,
  BodyContracts,
  DeclarationResult,
} from './types.ts'
import { bindBodyContracts, createAssetModelJudge, isObject } from './judge.ts'

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
function pinReference(reference: CapabilityId): CapabilityId {
  return Object.freeze({ category: reference.category, name: reference.name })
}
export function attributeDeclarationsOf<C extends AssetCategory>(
  content: AssetContent & { readonly category: C },
  bodyContracts: BodyContracts,
  actionSnapshot?: JsonValue,
): DeclarationResult<C>
export function attributeDeclarationsOf(
  content: AssetContent,
  bodyContracts: BodyContracts,
  actionSnapshot?: JsonValue,
): DeclarationResult {
  const bodies = bindBodyContracts(bodyContracts)
  if (content.category !== 'mcp' && actionSnapshot !== undefined)
    throw new TypeError('only MCP declarations accept an action snapshot')
  if (content.category === 'agent_definition' || content.category === 'plugin')
    return Object.freeze({ underivable: content.category })
  let expectedSnapshotKind: 'fetched' | 'not_fetched' | undefined
  if (content.category === 'mcp' && actionSnapshot !== undefined) {
    if (
      !isObject(actionSnapshot) ||
      !Object.hasOwn(actionSnapshot, 'kind') ||
      (actionSnapshot.kind !== 'fetched' && actionSnapshot.kind !== 'not_fetched')
    )
      throw new TypeError('MCP action snapshot requires its actual kind')
    expectedSnapshotKind = actionSnapshot.kind
  }
  const result =
    content.category === 'tool'
      ? bodies.tool.deriveDeclarations(content.definition)
      : content.category === 'loop_extension'
        ? bodies.loop_extension.deriveDeclarations(content.extension)
        : content.category === 'mcp'
          ? bodies.mcp.deriveDeclarations(content.body, actionSnapshot)
          : content.category === 'skill'
            ? bodies.skill.deriveDeclarations(content.body)
            : content.category === 'connector'
              ? bodies.connector.deriveDeclarations(content.body)
              : bodies.slash_command.deriveDeclarations(content.body)
  let actionSnapshotKind: 'fetched' | 'not_fetched' | undefined
  if (content.category === 'mcp') {
    if ('underivable' in result)
      throw new TypeError('MCP body rule cannot discard its known fixed declarations')
    if (!Object.hasOwn(result, 'actionSnapshotKind'))
      throw new TypeError('MCP body rule omitted its action snapshot knowledge marker')
    const marker = result.actionSnapshotKind
    if (marker !== undefined && marker !== 'fetched' && marker !== 'not_fetched')
      throw new TypeError('MCP body rule produced an invalid action snapshot marker')
    if (marker !== expectedSnapshotKind)
      throw new TypeError('MCP body rule action snapshot marker disagrees with its input')
    actionSnapshotKind = marker
  } else if (Object.hasOwn(result, 'actionSnapshotKind')) {
    throw new TypeError('only MCP body rules can carry an action snapshot marker')
  }
  if ('underivable' in result) {
    if (result.underivable !== content.category)
      throw new TypeError('body rule produced an underivable result for another category')
    return Object.freeze({ underivable: result.underivable })
  }
  if (content.category === 'connector')
    throw new TypeError('connector v1 declarations are underivable')
  const seen = new Set<string>()
  const judge = createAssetModelJudge(bodies)
  for (const declaration of result.declarations) {
    if (
      declaration.item === 'disabled' ||
      declaration.item === 'usableBy' ||
      seen.has(declaration.item)
    )
      throw new TypeError('body rule produced reserved or duplicate declaration')
    if (declaration.kind === 'setting' && declaration.category === 'governance')
      throw new TypeError('this body category cannot declare governance settings')
    if ('rejected' in judge.judgeAssetValue('AttributeDeclaration', declaration))
      throw new TypeError('body rule produced an invalid declaration')
    seen.add(declaration.item)
  }
  const declarations = Object.freeze([
    ...result.declarations.map(pinDeclaration),
    DISABLED_DECLARATION,
    USABLE_BY_DECLARATION,
  ])
  return content.category === 'mcp'
    ? Object.freeze({ declarations, actionSnapshotKind })
    : Object.freeze({ declarations })
}
export function referencesOf(
  content: AssetContent,
  bodyContracts: BodyContracts,
): { readonly references: readonly CapabilityId[] } | { readonly underivable: 'agent_definition' } {
  const bodies = bindBodyContracts(bodyContracts)
  if (content.category === 'agent_definition')
    return Object.freeze({ underivable: 'agent_definition' } as const)
  if (content.category === 'plugin')
    return Object.freeze({ references: Object.freeze(content.members.map(pinReference)) })
  const references =
    content.category === 'tool'
      ? bodies.tool.references(content.definition)
      : content.category === 'loop_extension'
        ? bodies.loop_extension.references(content.extension)
        : bodies[content.category].references(content.body)
  return Object.freeze({ references: Object.freeze(references.map(pinReference)) })
}
