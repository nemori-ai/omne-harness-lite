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
  issues: readonly {
    readonly code: string
    readonly path: readonly PropertyKey[]
    readonly keys?: readonly PropertyKey[]
    readonly origin?: string
    readonly minimum?: number | bigint
  }[],
): readonly [SchemaIssue, ...SchemaIssue[]] {
  const mapped: SchemaIssue[] = []
  for (const issue of issues) {
    const path = issuePath(issue.path)
    if (issue.code === 'unrecognized_keys' && issue.keys !== undefined && issue.keys.length > 0) {
      for (const key of issue.keys) {
        if (typeof key === 'string' || typeof key === 'number') {
          mapped.push({ path: [...path, key], code: 'unrecognized-key' })
        }
      }
      continue
    }
    mapped.push({ path, code: issueCode(issue) })
  }
  const first = mapped[0]
  if (first === undefined) return [{ path: [], code: 'constraint' }]
  return [first, ...mapped.slice(1)]
}

function issuePath(path: readonly PropertyKey[]): (string | number)[] {
  return path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  )
}

function issueCode(issue: {
  readonly code: string
  readonly origin?: string
  readonly minimum?: number | bigint
}): IssueCode {
  if (issue.code === 'invalid_type') return 'type'
  if (issue.code === 'unrecognized_keys') return 'unrecognized-key'
  if (issue.code === 'too_small' && issue.minimum === 1 && EMPTY_ORIGINS.has(issue.origin ?? '')) {
    return 'empty'
  }
  return 'constraint'
}

const EMPTY_ORIGINS: ReadonlySet<string> = new Set(['string', 'array', 'set', 'map'])

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
    return { ok: false, issues: mapAjv(validate.errors, value) }
  }
}

function mapAjv(
  errors: ErrorObject[] | null | undefined,
  instance: unknown,
): readonly [SchemaIssue, ...SchemaIssue[]] {
  const mapped = (errors ?? []).map(error => ({
    path: ajvPath(error, instance),
    code: ajvCode(error),
  }))
  const first = mapped[0]
  if (first === undefined) return [{ path: [], code: 'constraint' }]
  return [first, ...mapped.slice(1)]
}

function ajvPath(error: ErrorObject, instance: unknown): (string | number)[] {
  const path: (string | number)[] = []
  let current: unknown = instance
  for (const segment of error.instancePath.split('/').slice(1)) {
    const key = unescapePointer(segment)
    if (Array.isArray(current) && /^[0-9]+$/.test(key)) {
      const index = Number(key)
      path.push(index)
      current = current[index]
    } else {
      path.push(key)
      current = isObject(current) ? current[key] : undefined
    }
  }
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

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
