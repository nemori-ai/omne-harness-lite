import { z } from 'zod'
import {
  CriterionSchema,
  ExitSchema,
  MetricSchema,
  ReferenceSchema,
  RuleSchema,
  SECTIONS,
  type GoalBody,
  type SectionLetter,
  type SectionName,
} from './body.ts'
import {
  bodyIssues,
  DEFAULT_BUDGET,
  type BodyCheck,
  type BodyContext,
  type BodyIssue,
} from './validate.ts'

const ENTRY_SCHEMAS = {
  A: CriterionSchema,
  M: MetricSchema,
  N: RuleSchema,
  X: ExitSchema,
  R: ReferenceSchema,
} as const
const LETTER_OF = Object.fromEntries(
  Object.entries(SECTIONS).map(([letter, name]) => [name, letter]),
) as Readonly<Record<SectionName, SectionLetter>>

const id = z.string().regex(/^[AMNXR][1-9][0-9]*$/u)
const section = z.enum(['criteria', 'metrics', 'rules', 'exits', 'references'])
export const ChangeSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('purpose'), text: z.string() }),
  z.strictObject({ op: z.literal('method'), lines: z.array(z.string()) }),
  z.strictObject({ op: z.literal('add'), section, entry: z.unknown() }),
  z.strictObject({ op: z.literal('replace'), id, entry: z.unknown() }),
  z.strictObject({ op: z.literal('remove'), id }),
])
/** One change of a revision: an entry by its number, a new entry for a section, the purpose or the method. */
export type Change = z.infer<typeof ChangeSchema>
const ChangesSchema = z.array(ChangeSchema).min(1)

type Entry = Readonly<{ id: string }>
type Working = { -readonly [K in keyof GoalBody]: GoalBody[K] }

const issueOf = (entry: string | null, issue: z.core.$ZodIssue): BodyIssue => ({
  entry,
  field: String(issue.path[0] ?? (issue.code === 'unrecognized_keys' ? issue.keys[0] : 'entry')),
  problem: issue.message,
})

/** Applies one change to the working body; what is wrong with the change itself comes back as issues. */
function apply(body: Working, change: Change, position: number, touched: Set<string>): BodyIssue[] {
  if (change.op === 'purpose') body.purpose = change.text.trim()
  else if (change.op === 'method') body.method = change.lines
  else if (change.op === 'add') {
    const letter = LETTER_OF[change.section]
    const parsed = ENTRY_SCHEMAS[letter].safeParse(change.entry)
    if (!parsed.success)
      return parsed.error.issues.map(issue => issueOf(`#${String(position)}`, issue))
    const number = body.issued[letter] + 1
    body.issued = { ...body.issued, [letter]: number }
    const list = body[change.section] as readonly Entry[]
    body[change.section] = [...list, { ...parsed.data, id: `${letter}${String(number)}` }] as never
  } else {
    const letter = change.id[0] as SectionLetter
    const name = SECTIONS[letter]
    const list = body[name] as readonly Entry[]
    const known = list.some(entry => entry.id === change.id)
    if (!known || touched.has(change.id))
      return [{ entry: change.id, field: 'id', problem: known ? 'named twice' : 'no such entry' }]
    touched.add(change.id)
    if (change.op === 'remove') body[name] = list.filter(entry => entry.id !== change.id) as never
    else {
      const parsed = ENTRY_SCHEMAS[letter].safeParse(change.entry)
      if (!parsed.success) return parsed.error.issues.map(issue => issueOf(change.id, issue))
      const next = { ...parsed.data, id: change.id }
      body[name] = list.map(entry => (entry.id === change.id ? next : entry)) as never
    }
  }
  return []
}

/** A revision: a set of changes by number. Entries nobody named stay as they were; a number is never reused. */
export function reviseBody(body: GoalBody, changes: unknown, context: BodyContext): BodyCheck {
  const parsed = ChangesSchema.safeParse(changes)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue): BodyIssue => {
      const [index, ...rest] = issue.path
      return typeof index === 'number'
        ? { entry: `#${String(index + 1)}`, field: String(rest[0] ?? 'op'), problem: issue.message }
        : { entry: null, field: 'changes', problem: issue.message }
    })
    return { kind: 'invalid', issues }
  }
  const working: Working = { ...body }
  const touched = new Set<string>()
  const wrong = parsed.data.flatMap((change, index) => apply(working, change, index + 1, touched))
  if (wrong.length > 0) return { kind: 'invalid', issues: wrong }
  if (!working.exits.some(exit => exit.kind === 'budget')) {
    const number = working.issued.X + 1
    working.issued = { ...working.issued, X: number }
    working.exits = [...working.exits, { ...DEFAULT_BUDGET, id: `X${String(number)}` }] as never
  }
  const issues = bodyIssues(working, context)
  return issues.length === 0 ? { kind: 'valid', body: working } : { kind: 'invalid', issues }
}
