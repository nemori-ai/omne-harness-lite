import type { AttributeDeclaration, CapabilityId } from '@omne-harness-lite/asset-model'
import type { LoopExtensionDefinition } from './types.ts'

/** S-40: explicit author defaults only; no evaluation, lookup or reserved declarations. */
export function loopExtensionAttributeDeclarations(
  definition: LoopExtensionDefinition,
): readonly AttributeDeclaration[] {
  const positions =
    definition.position === 'after_model_call'
      ? ['after_model_call']
      : definition.position === 'after_action'
        ? ['after_action']
        : [
            'attempt_started',
            'before_persist_message',
            'after_persist_message',
            'before_compaction',
            'after_compaction',
            'before_model_call',
            'before_action',
            'before_terminal',
            'after_terminal',
          ]
  const declarations: AttributeDeclaration[] = [
    {
      item: 'position',
      kind: 'setting',
      category: 'binding',
      domain: Object.freeze({
        kind: 'open',
        schema: Object.freeze({ enum: Object.freeze(positions) }),
      }),
      default: definition.position,
    },
  ]
  if (definition.position === 'after_model_call')
    declarations.push({
      item: 'dimension',
      kind: 'setting',
      category: 'binding',
      domain: Object.freeze({
        kind: 'open',
        schema: Object.freeze({
          type: 'object',
          properties: Object.freeze({
            ending: Object.freeze({ enum: Object.freeze(['complete_reply', 'failure']) }),
          }),
          required: Object.freeze(['ending']),
          additionalProperties: false,
        }),
      }),
      default: Object.freeze({ ending: definition.dimension.ending }),
    })
  if (definition.position === 'after_action')
    declarations.push({
      item: 'dimension',
      kind: 'setting',
      category: 'binding',
      domain: Object.freeze({
        kind: 'open',
        schema: Object.freeze({
          type: 'object',
          properties: Object.freeze({
            scope: Object.freeze({ enum: Object.freeze(['each', 'batch']) }),
          }),
          required: Object.freeze(['scope']),
          additionalProperties: false,
        }),
      }),
      default: Object.freeze({ scope: definition.dimension.scope }),
    })
  const values =
    definition.power === 'observe'
      ? ['observe']
      : definition.power === 'rewrite'
        ? ['observe', 'rewrite']
        : ['observe', 'rewrite', 'veto']
  declarations.push({
    item: 'power',
    kind: 'permission',
    domain: Object.freeze({ kind: 'enum', values: Object.freeze(values) }),
    default: definition.power,
  })
  return Object.freeze(declarations.map(item => Object.freeze(item)))
}
export function loopExtensionReferences(
  _definition: LoopExtensionDefinition,
): readonly CapabilityId[] {
  return Object.freeze([])
}
