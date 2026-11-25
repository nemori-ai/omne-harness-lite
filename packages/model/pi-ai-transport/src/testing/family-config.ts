import { fileURLToPath } from 'node:url'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { TokenizationFailure } from '@omne-harness/model-contract/provider'
import type { ChatCompletionsLimits } from '../chat-completions/vocabulary.ts'
import type { PiFamily } from '../family-table.ts'
import type { GatewayFamilyConfig } from '../family-kit/family.ts'
import { appendAdoptionFingerprints } from './adoptions.ts'

/** Tokenizer executor limits for tests: one worker, room for every family's fixtures. */
export const TEST_EXECUTOR_LIMITS = Object.freeze({
  workers: 1,
  maxLeases: 256,
  maxQueuedJobs: 32,
  maxQueuedBytes: 32 * 1024 * 1024,
  maxInputBytes: 8 * 1024 * 1024,
  maxLeaseQueuedJobs: 4,
  maxCacheBytes: 2 * 1024 * 1024,
  maxCacheEntries: 8192,
  maxLeaseCacheBytes: 256 * 1024,
  maxLeaseCacheEntries: 2048,
  maxPieceBytes: 4096,
  jobTimeoutMs: 10000,
  maxWorkerOldSpaceMb: 128,
  maxReplacementsPerMinute: 2,
  cancellationGraceMs: 25,
})

export const TEST_DECODER_LIMITS: ChatCompletionsLimits = Object.freeze({
  toolArguments: Object.freeze({
    maxBytes: 65536,
    maxDepth: 32,
    maxItems: 1024,
    maxMembers: 256,
    maxStringLength: 65536,
    maxNumberLength: 64,
  }),
  maxReasoningText: 65536,
})

/** A configuration that only declares records: the family it builds never acquires a binding. */
export function fingerprintConfig<T extends Readonly<{ definition: TokenizerDefinition }>>(
  tokenizer: T,
): Omit<GatewayFamilyConfig, 'tokenizer' | 'executor'> &
  Readonly<{
    tokenizer: T
    executor: Readonly<{ acquire(): Readonly<{ failure: TokenizationFailure }> }>
  }> {
  return {
    tokenizer,
    executor: { acquire: () => ({ failure: { kind: 'unavailable', diagnostic: 'not-used' } }) },
    limits: {
      toolArguments: {
        maxBytes: 1,
        maxDepth: 1,
        maxItems: 1,
        maxMembers: 1,
        maxStringLength: 1,
        maxNumberLength: 1,
      },
      maxReasoningText: 1,
    },
    margin: {
      percent: '0',
      source: { owner: 'fingerprints', name: 'none', revision: '1', digest: '0' },
    },
  }
}

/** Appends the fingerprint of every record the file lacks, and reports how many it added. */
export async function writeFingerprints(family: PiFamily, file: URL): Promise<void> {
  const added = await appendAdoptionFingerprints(family, fileURLToPath(file))
  process.stdout.write(`added ${added.length} fingerprint lines\n`)
}

export function sortedJsonText(value: JsonValue): string {
  if (value.kind === 'array') return `[${value.items.map(sortedJsonText).join(',')}]`
  if (value.kind === 'object') {
    const entries = [...value.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    return `{${entries.map(entry => `${JSON.stringify(entry.key)}:${sortedJsonText(entry.value)}`).join(',')}}`
  }
  return writeJsonText(value)
}
