import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'

export function value<T>(answer: Outcome<T, unknown>): T {
  if ('failure' in answer)
    throw new Error(JSON.stringify(answer.failure), { cause: answer.failure })
  return answer.ok
}
export function failureDetails(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    failure: 'failure' in error ? error.failure : undefined,
    cause: error.cause === undefined ? undefined : failureDetails(error.cause),
    errors: error instanceof AggregateError ? error.errors.map(failureDetails) : undefined,
  }
}
export function tree(input: unknown): JsonValue {
  const parsed = readJsonText(JSON.stringify(input), {
    maxBytes: 1_048_576,
    maxDepth: 32,
    maxItems: 8192,
    maxMembers: 512,
    maxStringLength: 1_048_576,
    maxNumberLength: 32,
  })
  if (parsed.kind !== 'ok') throw new Error(`Invalid fixture JSON: ${parsed.kind}`)
  return parsed.value
}
export function evidence(record: string, input: unknown = record): DurableEvidence {
  return {
    owner: 'windows-composition-test-authority',
    record,
    revision: '1',
    digest: canonicalDigest(input),
  }
}
export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}
export async function until<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeout = 30_000,
): Promise<T> {
  const deadline = performance.now() + timeout
  for (;;) {
    const current = await read()
    if (ready(current)) return current
    assert.ok(
      performance.now() < deadline,
      `Timed out waiting for the original operation: ${JSON.stringify(current)}`,
    )
    await delay(20)
  }
}
