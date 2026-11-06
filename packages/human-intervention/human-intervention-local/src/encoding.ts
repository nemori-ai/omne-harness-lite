import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { OperationRef } from '@omne-harness/human-intervention'

export function canonical(value: unknown): string {
  const encoded = canonicalize(value)
  if (encoded === undefined) throw new TypeError('Expected JSON data')
  return encoded
}
export function json(value: unknown): JsonValue {
  return z.json().parse(JSON.parse(canonical(value)))
}
export function operationKey(operation: OperationRef): string {
  return createHash('sha256')
    .update(canonical(['hitl', operation]))
    .digest('hex')
}
export function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}
