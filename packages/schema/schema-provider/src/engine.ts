import { z, type ZodType } from 'zod'
import type { IssueCode, SchemaIssue, StandardTyped } from './index.ts'

export type CheckHit =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly [SchemaIssue, ...SchemaIssue[]] }

/** Zod is called only after admission has allowed the shape. */
export function compileZod(schema: StandardTyped<unknown>): (value: unknown) => CheckHit {
  if (!(schema instanceof z.ZodType)) throw new TypeError('schema is not a Zod schema')
  const compiled: ZodType = z.compile(schema, { strict: true })
  return value => {
    const parsed = compiled.safeParse(value)
    if (parsed.success) return { ok: true }
    return { ok: false, issues: mapIssues(parsed.error.issues) }
  }
}

function mapIssues(
  issues: readonly { readonly code: string; readonly path: readonly PropertyKey[] }[],
): readonly [SchemaIssue, ...SchemaIssue[]] {
  const mapped = issues.map(issue => ({
    path: issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    ),
    code: issueCode(issue.code),
  }))
  const first = mapped[0]
  if (first === undefined) return [{ path: [], code: 'constraint' }]
  return [first, ...mapped.slice(1)]
}

function issueCode(code: string): IssueCode {
  if (code === 'invalid_type') return 'type'
  if (code === 'unrecognized_keys') return 'unrecognized-key'
  return 'constraint'
}
