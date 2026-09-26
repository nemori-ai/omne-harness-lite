import { type JsonValue, type CapabilityId } from '@omne-harness-lite/content-blocks'
import { TENANT_ROLES } from '@omne-harness-lite/identity-values'
import type {
  AssetContent,
  AttributeDeclaration,
  BodyContracts,
  DeclarationResult,
} from './types.ts'
import { bindBodyContracts, createAssetModelJudge } from './judge.ts'

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
export function attributeDeclarationsOf(
  content: AssetContent,
  bodyContracts: BodyContracts,
  actionSnapshot?: JsonValue,
): DeclarationResult {
  const bodies = bindBodyContracts(bodyContracts)
  if (content.category === 'agent_definition' || content.category === 'plugin')
    return Object.freeze({ underivable: content.category })
  if (content.category === 'connector') return Object.freeze({ underivable: 'connector' } as const)
  if (content.category !== 'mcp' && actionSnapshot !== undefined)
    throw new TypeError('only MCP declarations accept an action snapshot')
  const result =
    content.category === 'tool'
      ? bodies.tool.deriveDeclarations(content.definition)
      : content.category === 'loop_extension'
        ? bodies.loop_extension.deriveDeclarations(content.extension)
        : content.category === 'mcp'
          ? bodies.mcp.deriveDeclarations(content.body, actionSnapshot)
          : content.category === 'skill'
            ? bodies.skill.deriveDeclarations(content.body)
            : bodies.slash_command.deriveDeclarations(content.body)
  if ('underivable' in result) return Object.freeze({ underivable: result.underivable })
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
  return Object.freeze({
    declarations: Object.freeze([
      ...result.declarations,
      DISABLED_DECLARATION,
      USABLE_BY_DECLARATION,
    ]),
  })
}
export function referencesOf(
  content: AssetContent,
  bodyContracts: BodyContracts,
): { readonly references: readonly CapabilityId[] } | { readonly underivable: 'agent_definition' } {
  const bodies = bindBodyContracts(bodyContracts)
  if (content.category === 'agent_definition')
    return Object.freeze({ underivable: 'agent_definition' } as const)
  if (content.category === 'plugin')
    return Object.freeze({ references: Object.freeze([...content.members]) })
  const references =
    content.category === 'tool'
      ? bodies.tool.references(content.definition)
      : content.category === 'loop_extension'
        ? bodies.loop_extension.references(content.extension)
        : bodies[content.category].references(content.body)
  return Object.freeze({ references: Object.freeze([...references]) })
}
