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

/**
 * A page read back with `read_result` is itself a tool result. The Tools capability keeps each of
 * its replies within `replyMaxBytes` and each block within `resultPageBytes`, measured as JSON.
 * The runtime offloads a result whose model text is over the inline threshold, or that has a
 * block over its own result page. So neither Tools budget may exceed the runtime's bound: a
 * larger one lets the reply that carries a page offload again, and no page of the body reaches
 * the model. Checked at the configuration boundary, only when both rows are the release exports.
 */
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
