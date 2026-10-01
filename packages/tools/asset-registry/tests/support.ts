import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import type { AssetDefinition, CapabilityId } from '@omne-harness-lite/asset-model'
export const root = { category: 'agent_definition', name: 'example:root' } as const
export const b = { category: 'loop_extension', name: 'example:b' } as const
export const a = { category: 'loop_extension', name: 'example:a' } as const
export const tool = { category: 'tool', name: 'example:read' } as const
export const command = { category: 'slash_command', name: 'omne-official:deploy' } as const
export const now = '2026-09-27T00:00:00Z'
export function definition(capability: CapabilityId, content: unknown): AssetDefinition {
  return {
    id: `ast_${capability.category}_${capability.name.split(':')[1]}`,
    capability,
    origin: 'official',
    versions: [{ number: 1, content, publishedAt: now }],
  } as AssetDefinition
}
export function fixture() {
  const references = [
    { capability: b },
    { capability: a },
    { capability: tool, resident: true },
    { capability: command },
  ]
  const definitions = [
    definition(root, {
      category: 'agent_definition',
      body: toOpaqueJson({ references, attributes: [] }),
    }),
    ...[a, b].map(id =>
      definition(id, {
        category: 'loop_extension',
        extension: {
          name: id.name,
          position: 'before_model_call',
          power: 'observe',
          implementation: { kind: 'builtin', builtinName: id.name },
        },
      }),
    ),
    definition(tool, {
      category: 'tool',
      definition: {
        name: tool.name,
        paradigm: 'single',
        description: 'read',
        origin: { kind: 'authored' },
        input: { type: 'object', properties: {}, additionalProperties: false },
        permissions: { execute: { default: 'auto' } },
      },
    }),
    definition(command, {
      category: 'slash_command',
      body: { description: 'deploy', binding: { kind: 'command', service: 'deploy_service' } },
    }),
  ]
  const input: NonConnectorEvaluationInput = {
    tenant: unwrap(parseTenantId({ organization: 'org_example', account: 'acc_example' })),
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references,
      attributes: [],
      source: { asset: definitions[0]!.id, version: 1 },
    },
    holdings: definitions.map(def => ({
      holder: { layer: 'factory' },
      capability: def.capability,
      asset: def.id,
      basis: { kind: 'official' },
      versionSelection: { kind: 'current' },
      immutable: false,
      assignments: [],
      since: now,
    })),
    definitions: definitions as NonConnectorEvaluationInput['definitions'],
  }
  const evaluated = evaluate(input)
  if (!('ok' in evaluated))
    throw new Error(`unit fixture input rejected: ${JSON.stringify(evaluated)}`)
  return { input, definitions, evaluation: evaluated.ok, order: [b, tool, a, command] }
}
