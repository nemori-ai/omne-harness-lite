import type { Context } from '@deepseek-ai/cordis'
import type { FixedModelRequest, TransportFailure } from '@omne-harness/model-contract'
import type { TreeRow } from '../types.ts'
import { ConfigError, parseBoundary } from '../config-schema.ts'
import { toolBindingsConfig } from '../rows/tool-bindings/index.ts'
import { toolRuntimeConfigSchema } from '../rows/tool-runtime/config.ts'

type Disclosure = (request: Pick<FixedModelRequest, 'messages'>) => TransportFailure | null
const policies = new WeakMap<Context, Disclosure>()

function policyFor(limit: number | null): Disclosure {
  return request => {
    for (const message of request.messages) {
      if (message.role !== 'tool') continue
      if (limit === null) return { kind: 'denied', action: 'tool-result-disclosure-policy-missing' }
      let bytes = 0
      for (const block of message.blocks) {
        if (block.kind !== 'text' || !block.visibility.toModel) continue
        bytes += Buffer.byteLength(block.text, 'utf8')
        if (bytes > limit) return { kind: 'denied', action: 'tool-result-disclosure-limit' }
      }
    }
    return null
  }
}

const missingPolicy = policyFor(null)

export function compileToolResultDisclosure(rows: readonly TreeRow[]): Disclosure {
  const source = rows.find(row => row.id === 'tool-records' && row.plugin === 'toolRecordsRow')
  if (source === undefined) return missingPolicy
  const config = parseBoundary(toolRuntimeConfigSchema, source.config)
  return policyFor(config.configuration.offloading.maxInlineUtf8Bytes)
}

export function installToolResultDisclosure(root: Context, policy: Disclosure): void {
  if (policies.has(root.root)) throw new Error('tool result disclosure policy is already installed')
  policies.set(root.root, policy)
}

export function toolResultDisclosureOf(ctx: Context): Disclosure {
  return policies.get(ctx.root) ?? missingPolicy
}

export function checkToolsReplyBudget(rows: readonly TreeRow[]): void {
  const records = rows.find(row => row.id === 'tool-records' && row.plugin === 'toolRecordsRow')
  const bindings = rows.find(row => row.id === 'tool-bindings' && row.plugin === 'toolBindingsRow')
  if (records === undefined || bindings === undefined) return
  const tools = parseBoundary(toolBindingsConfig, bindings.config).tools
  if (tools === undefined) return
  const { configuration } = parseBoundary(toolRuntimeConfigSchema, records.config)
  const refuse = (field: string, value: number, bound: string, limit: number): never => {
    throw new ConfigError(
      'invalid-config',
      `tool-bindings.tools.${field} (${String(value)}) must not exceed ` +
        `tool-records.configuration.${bound} (${String(limit)}): ` +
        'a larger reply would be offloaded again and its page would not reach the model',
    )
  }
  const inline = configuration.offloading.maxInlineUtf8Bytes
  if (tools.replyMaxBytes > inline)
    refuse('replyMaxBytes', tools.replyMaxBytes, 'offloading.maxInlineUtf8Bytes', inline)
  if (tools.resultPageBytes > configuration.resultPageBytes)
    refuse(
      'resultPageBytes',
      tools.resultPageBytes,
      'resultPageBytes',
      configuration.resultPageBytes,
    )
}
