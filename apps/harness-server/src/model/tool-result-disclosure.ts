import type { Context } from '@deepseek-ai/cordis'
import type { FixedModelRequest, TransportFailure } from '@omne-harness/model-contract'
import type { TreeRow } from '../types.ts'
import { parseBoundary } from '../config-schema.ts'
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
