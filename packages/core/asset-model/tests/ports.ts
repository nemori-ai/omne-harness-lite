import { readFileSync } from 'node:fs'
import {
  readJsonStrict,
  LosslessNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type {
  BodyCategory,
  BodyContract,
  BodyContracts,
  BodyJudgeContext,
  BodyJudgment,
} from '../src/index.ts'

function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function resource(topic: string): JsonObject {
  const version = topic === 'tool-definition' || topic === 'loop-extension' ? 3 : 2
  const parsed = readJsonStrict(
    readFileSync(
      new URL(
        `../../../../.meta_harness/design/spec/data/${topic}/v${version}/${topic}.schema.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  )
  if ('failed' in parsed || !object(parsed.ok)) throw new Error('test Schema must be JSON object')
  return parsed.ok
}
/** W2 protocol doubles, intentionally not implementations of the six full body contracts. */
function port<C extends BodyCategory>(
  category: C,
  topic: string,
): Omit<BodyContract<C>, 'deriveDeclarations'> {
  function judge(body: unknown, context?: BodyJudgeContext): BodyJudgment {
    if (!object(body)) return { rejected: 'malformed' }
    const name = context?.capabilityName
    if (category === 'skill') {
      if (!Object.hasOwn(body, 'manifest')) return { rejected: 'manifest_missing' }
      if (!Object.hasOwn(body, 'resources')) return { rejected: 'malformed' }
      if (name !== undefined && object(body.manifest) && body.manifest.name !== name)
        return { rejected: 'name_mismatch' }
    }
    if (category === 'mcp') {
      if (object(body.transport) && !['stdio', 'http'].includes(String(body.transport.kind)))
        return { rejected: 'transport_unknown' }
      if (object(body.transport) && body.transport.command === '')
        return { rejected: 'command_empty' }
      if (name !== undefined && (name.includes('__') || name.includes('.') || name.includes('/')))
        return { rejected: 'name_not_projectable' }
    }
    if (category === 'slash_command') {
      if (
        object(body.binding) &&
        !['prompt', 'skill', 'command'].includes(String(body.binding.kind))
      )
        return { rejected: 'binding_unknown' }
      if (name !== undefined && object(body.binding)) {
        const reserved = name.toLowerCase().startsWith('omne-official:')
        if (
          (body.binding.kind === 'command') !== reserved ||
          (body.binding.kind === 'command' &&
            context?.origin !== undefined &&
            context.origin !== 'official')
        )
          return { rejected: 'name_reserved' }
      }
    }
    if (category === 'connector') {
      if (
        context?.definition === 'DeliveryTarget' &&
        Object.hasOwn(body, 'kind') &&
        body.kind !== 'session'
      )
        return { rejected: 'target_unknown' }
      if (object(body.source) && body.source.channel === '') return { rejected: 'channel_empty' }
    }
    if (
      (category === 'tool' || category === 'loop_extension') &&
      name !== undefined &&
      typeof body.name === 'string' &&
      body.name !== name
    )
      return { rejected: 'malformed' }
    return { ok: true }
  }
  return {
    category,
    schema: resource(topic),
    judge,
    references: () => [],
  }
}
export const bodies: BodyContracts = {
  tool: { ...port('tool', 'tool-definition'), deriveDeclarations: () => ({ declarations: [] }) },
  loop_extension: {
    ...port('loop_extension', 'loop-extension'),
    deriveDeclarations: () => ({ declarations: [] }),
  },
  skill: { ...port('skill', 'skill-package'), deriveDeclarations: () => ({ declarations: [] }) },
  mcp: {
    ...port('mcp', 'mcp-endpoint'),
    deriveDeclarations: (_body, snapshot) => {
      if (snapshot === undefined) return { declarations: [], actionSnapshotKind: undefined }
      if (!object(snapshot) || (snapshot.kind !== 'fetched' && snapshot.kind !== 'not_fetched'))
        throw new TypeError('expected explicit snapshot discriminant')
      return { declarations: [], actionSnapshotKind: snapshot.kind }
    },
  },
  slash_command: {
    ...port('slash_command', 'slash-command'),
    deriveDeclarations: () => ({ declarations: [] }),
  },
  connector: {
    ...port('connector', 'connector'),
    deriveDeclarations: () => ({ underivable: 'connector' }),
  },
}
export function json(text: string): JsonValue {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('invalid test JSON')
  return parsed.ok
}
