import { types } from 'node:util'
import type { StandardSchemaV1 } from '@standard-schema/spec'

const NOT_SYNCHRONOUS: readonly StandardSchemaV1.Issue[] = Object.freeze([
  Object.freeze({ message: 'schema-not-synchronous' }),
])

/**
 * Runs a declared schema synchronously. An asynchronous schema cannot guard a synchronous commit,
 * so it reads as one issue instead of a throw that would escape the operation.
 */
export function validate(
  schema: StandardSchemaV1,
  value: unknown,
): readonly StandardSchemaV1.Issue[] {
  let result: ReturnType<StandardSchemaV1['~standard']['validate']>
  try {
    result = schema['~standard'].validate(value)
  } catch {
    return [{ message: 'schema-threw' }]
  }
  if (types.isPromise(result)) {
    void Promise.resolve(result).catch(() => {})
    return NOT_SYNCHRONOUS
  }
  return result.issues ?? []
}
