import { z } from 'zod'
import type { RowId } from './types.ts'

export type ConfigErrorCode =
  | 'invalid-config'
  | 'async-schema'
  | 'unknown-plugin'
  | 'duplicate-row-id'
  | 'unknown-target'

/** Every rejection at the configuration boundary. Exit code 2 in the process entry. */
export class ConfigError extends Error {
  readonly code: ConfigErrorCode

  constructor(code: ConfigErrorCode, message: string) {
    super(message)
    this.name = 'ConfigError'
    this.code = code
  }
}

/**
 * Parse unknown input with a synchronous schema. A schema that needs async work is a
 * boundary error: silently skipping it would turn a rejection into a pass.
 */
export function parseBoundary<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  let result: z.ZodSafeParseResult<z.output<S>>
  try {
    result = schema.safeParse(input) as z.ZodSafeParseResult<z.output<S>>
  } catch (error) {
    if (error instanceof z.core.$ZodAsyncError) {
      throw new ConfigError('async-schema', 'configuration schema must be synchronous')
    }
    throw error
  }
  if (result.success) return result.data
  const issues = result.error.issues
  const code = issues.map(issueTag).find(tag => tag !== undefined) ?? 'invalid-config'
  const detail = issues
    .map(issue => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
  throw new ConfigError(code, detail)
}

function issueTag(issue: z.core.$ZodIssue): ConfigErrorCode | undefined {
  return issue.code === 'custom'
    ? (issue.params?.['tag'] as ConfigErrorCode | undefined)
    : undefined
}

const rowIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'row id must be lower-case letters, digits and hyphens')
  .transform(id => id as RowId)

const dataSchema = z.json()

function rowSchema(allowlist: readonly string[]) {
  return z.strictObject({
    id: rowIdSchema,
    plugin: z.string().refine(name => allowlist.includes(name), {
      error: issue => `plugin export "${String(issue.input)}" is not in the allowlist`,
      params: { tag: 'unknown-plugin' satisfies ConfigErrorCode },
    }),
    config: dataSchema,
  })
}

/** Distribution layer: ordered rows, unique ids, plugin names from the allowlist only. */
export function distributionSchema(allowlist: readonly string[]) {
  return z.strictObject({ rows: z.array(rowSchema(allowlist)) }).superRefine((value, ctx) => {
    const seen = new Set<string>()
    for (const [index, row] of value.rows.entries()) {
      if (seen.has(row.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', index, 'id'],
          message: `duplicate row id "${row.id}"`,
          params: { tag: 'duplicate-row-id' satisfies ConfigErrorCode },
        })
      }
      seen.add(row.id)
    }
  })
}

/** Operator layer: an ordered list of replace, disable and insert operations. */
export function operatorSchema(allowlist: readonly string[]) {
  return z.strictObject({
    ops: z.array(
      z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('replace'), id: rowIdSchema, config: dataSchema }),
        z.strictObject({ kind: z.literal('disable'), id: rowIdSchema }),
        z.strictObject({
          kind: z.literal('insert'),
          after: rowIdSchema,
          row: rowSchema(allowlist),
        }),
      ]),
    ),
  })
}
