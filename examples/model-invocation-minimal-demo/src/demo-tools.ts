import { META_TOOL_DEFINITIONS } from './meta-tool-config.ts'
import { resultReaderSelection } from './demo-result-reader.ts'
import { randomBytes } from 'node:crypto'
import {
  capabilityCanonicalString,
  type AssetDefinition,
  type AssetHolding,
} from '@omne-harness-lite/asset-model'
import { isJsonNumber, writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import type { ToolImplementation } from '@omne-harness-lite/tool-execution-runtime'

const publishedAt = '2026-10-05T00:00:00Z'
const permission = { execute: { default: 'auto' as const } }
const echo: ToolDefinition = {
  name: 'demo:echo',
  description: 'Return the supplied JSON value as text.',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: {
    type: 'object',
    properties: { value: { description: 'The JSON value to echo.' } },
    required: ['value'],
    additionalProperties: false,
  },
  permissions: permission,
}
const nonce: ToolDefinition = {
  name: 'demo:nonce',
  description:
    'Generate a random one-time password. The password is known only after this tool actually runs.',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: { type: 'object', properties: {}, additionalProperties: false },
  permissions: permission,
}

/** Independent pure functions. The nonce is never preloaded in a model request. */
export const DEMO_TOOL_IMPLEMENTATIONS: readonly ToolImplementation[] = [echo, nonce].map(
  definition => ({
    capability: capabilityCanonicalString({ category: 'tool', name: definition.name }),
    asset: `demo-${definition.name.split(':')[1]}-asset`,
    version: '1',
    definition,
    executor:
      definition === echo
        ? async parameters => {
            if (
              !parameters ||
              typeof parameters !== 'object' ||
              Array.isArray(parameters) ||
              isJsonNumber(parameters)
            )
              throw new TypeError('Echo requires an actual JSON object with value')
            const value = (parameters as JsonObject).value
            if (value === undefined) throw new TypeError('Echo value is missing')
            return writeJsonLossless(value)
          }
        : async () => randomBytes(16).toString('hex'),
  }),
)
export const DEMO_TOOL_ASSETS: readonly AssetDefinition[] = [
  ...DEMO_TOOL_IMPLEMENTATIONS,
  ...META_TOOL_DEFINITIONS,
  resultReaderSelection,
].map(implementation => ({
  id: implementation.asset,
  capability: { category: 'tool', name: implementation.definition.name },
  origin: 'official',
  versions: [
    {
      number: 1,
      content: {
        category: 'tool',
        definition:
          implementation.definition as unknown as import('@omne-harness-lite/content-blocks').JsonValue,
      },
      publishedAt,
    },
  ],
}))
export const DEMO_TOOL_HOLDINGS: readonly AssetHolding[] = DEMO_TOOL_ASSETS.map(asset => ({
  holder: { layer: 'factory' },
  capability: asset.capability,
  asset: asset.id,
  basis: { kind: 'official' },
  versionSelection: { kind: 'current' },
  immutable: false,
  assignments: [],
  since: publishedAt,
}))
