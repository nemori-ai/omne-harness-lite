import { Ajv, type ErrorObject } from 'ajv'
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

/** Ajv runs only after admission has allowed an acyclic document. */
export function compileJsonSchema(
  document: Readonly<Record<string, unknown>>,
): (value: unknown) => CheckHit {
  const validate = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  }).compile(structuredClone(document))
  return value => {
    if (validate(value) === true) return { ok: true }
    return { ok: false, issues: mapAjv(validate.errors) }
  }
}

function mapAjv(
  errors: ErrorObject[] | null | undefined,
): readonly [SchemaIssue, ...SchemaIssue[]] {
  const mapped = (errors ?? []).map(error => ({
    path: ajvPath(error),
    code: ajvCode(error),
  }))
  const first = mapped[0]
  if (first === undefined) return [{ path: [], code: 'constraint' }]
  return [first, ...mapped.slice(1)]
}

function ajvPath(error: ErrorObject): (string | number)[] {
  const path = error.instancePath
    .split('/')
    .slice(1)
    .filter(segment => segment.length > 0)
    .map(segment => {
      const decoded = decodePointer(segment)
      return /^\d+$/.test(decoded) ? Number(decoded) : decoded
    })
  const extra = error.params['additionalProperty']
  if (error.keyword === 'additionalProperties' && typeof extra === 'string') path.push(extra)
  return path
}

function ajvCode(error: ErrorObject): IssueCode {
  if (error.keyword === 'type') return 'type'
  if (error.keyword === 'additionalProperties') return 'unrecognized-key'
  if (error.params['limit'] === 1 && EMPTY_KEYWORDS.has(error.keyword)) return 'empty'
  return 'constraint'
}

const EMPTY_KEYWORDS: ReadonlySet<string> = new Set(['minLength', 'minItems', 'minProperties'])

function decodePointer(segment: string): string {
  return decodeURIComponent(segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}
