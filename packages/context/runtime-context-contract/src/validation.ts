import type { StandardSchemaV1 } from '@standard-schema/spec'
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function schema(value: unknown): value is StandardSchemaV1 {
  if (!record(value) || !record(value['~standard'])) return false
  const standard = value['~standard']
  return (
    standard.version === 1 &&
    typeof standard.vendor === 'string' &&
    typeof standard.validate === 'function'
  )
}
export function validate(
  schema: StandardSchemaV1,
  value: unknown,
): readonly StandardSchemaV1.Issue[] {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
    void result.catch(() => {})
    throw new SynchronousSchemaRequired()
  }
  return result.issues ?? []
}

/** An asynchronous validator cannot define a synchronous pure-operation contract. */
export class SynchronousSchemaRequired extends Error {
  constructor() {
    super('schema-not-synchronous')
    this.name = 'SynchronousSchemaRequired'
  }
}
