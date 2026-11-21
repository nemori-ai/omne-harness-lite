import type { JsonValue } from '@omne-harness/sql-contract'
import { succeed } from '@omne-harness/operation-result'
import { RELATIONS_TO_REFERENCE } from '@omne-harness/session-contract'
import type {
  ArchivedBy,
  SessionDirectory,
  SessionId,
  SessionListItem,
  SessionListPage,
} from '@omne-harness/session-contract'
import { sha256 } from './codec.ts'
import { domainOf, failure, qualify, readHandler, type Context } from './context.ts'
import { open, seal } from './cursor.ts'

type Listing = Parameters<SessionDirectory<unknown>['listArchived']>[0] &
  Parameters<SessionDirectory<unknown>['list']>[0]
type Common = Pick<Listing, 'tenant' | 'after' | 'limit' | 'filter' | 'reference'>
type Filters = Readonly<{
  from: string | null
  to: string | null
  by: ArchivedBy | null
  titleContains: string | null
}>

const TITLE_TEXT_MAX = 200
const BY: readonly ArchivedBy[] = ['person', 'auto', 'parent']

const titleFailure = (title: string | null | undefined) =>
  typeof title === 'string' && [...title].length > TITLE_TEXT_MAX
    ? failure({ kind: 'invalid', field: 'titleContains', reason: 'longer than 200' })
    : null

function filterFailure(filters: Filters) {
  if (filters.by !== null && !BY.includes(filters.by))
    return failure({ kind: 'invalid', field: 'by', reason: 'not person, auto or parent' })
  if (filters.from !== null && filters.to !== null && filters.from >= filters.to)
    return failure({ kind: 'invalid', field: 'to', reason: 'not after from' })
  return titleFailure(filters.titleContains)
}

const limitFailure = (limit: number) =>
  Number.isInteger(limit) && limit >= 1 && limit <= 1000
    ? null
    : failure({ kind: 'invalid', field: 'limit', reason: 'not an integer from 1 to 1000' })

function standingFailure(input: Common) {
  const to = input.filter?.toReference
  if (to === undefined) return null
  if (!RELATIONS_TO_REFERENCE.includes(to))
    return failure({ kind: 'invalid', field: 'filter.toReference', reason: 'not a relation' })
  return input.reference === undefined
    ? failure({ kind: 'invalid', field: 'reference', reason: 'the filter names no reference' })
    : null
}

const defined = (fields: Readonly<Record<string, unknown>>): Record<string, JsonValue> =>
  JSON.parse(JSON.stringify(fields)) as Record<string, JsonValue>

type Cursor = Readonly<{ key: JsonValue; under: string }>
type Binding = Readonly<{ kind: string; tenant: string; session: null }>

// The access check comes first, so a caller who may not list learns nothing from its input.
async function admit<P>(
  context: Context<P>,
  input: Common & { principal: P },
  refused: ReturnType<typeof filterFailure>,
) {
  const decided = await qualify(context, {
    access: { principal: input.principal, tenant: input.tenant },
    operation: 'directory.list',
    target: { kind: 'tenant', tenant: input.tenant },
  })
  if ('failure' in decided) return decided
  const domain = await domainOf(context, input.tenant)
  if ('failure' in domain) return domain
  return limitFailure(input.limit) ?? standingFailure(input) ?? refused ?? domain
}

/** The key a cursor resumes after: a cursor is bound to its list and to the filter it ran under. */
async function resumeAt<P>(
  context: Context<P>,
  binding: Binding,
  after: string | null,
  under: string,
) {
  if (after === null) return succeed(null)
  const opened = await open<Cursor>(context.cursor, binding, after)
  if ('failure' in opened) return opened
  return opened.ok.under === under
    ? succeed(opened.ok.key)
    : failure({ kind: 'invalid', field: 'after', reason: 'the cursor is of another filter' })
}

async function page<P>(
  context: Context<P>,
  input: Common & { principal: P },
  list: 'session-list' | 'archived-list',
  extra: Readonly<{
    fields: Readonly<Record<string, unknown>>
    refused: ReturnType<typeof filterFailure>
  }>,
) {
  const domain = await admit(context, input, extra.refused)
  if ('failure' in domain) return domain
  const fields = defined({ ...extra.fields, filter: input.filter, reference: input.reference })
  const under = sha256(JSON.stringify(fields))
  const binding = { kind: list, tenant: domain.ok.text, session: null }
  const after = await resumeAt(context, binding, input.after, under)
  if ('failure' in after) return after
  const handler = list === 'session-list' ? 'session.list' : 'session.list-archived'
  const query = { tenant: domain.ok.text, after: after.ok, limit: input.limit, ...fields }
  const out = await readHandler(context, domain.ok.domain, handler, query)
  if ('failure' in out) return out
  if (out.ok['reference'] === 'absent') return failure({ kind: 'denied', action: 'directory.list' })
  const next = out.ok['next'] ?? null
  const token = next === null ? null : await seal(context.cursor, binding, { key: next, under })
  if (token !== null && 'failure' in token) return token
  const items = (out.ok['items'] as unknown as SessionListItem[]).map(item => ({
    ...item,
    session: item.session as SessionId,
  }))
  const completeness = out.ok['completeness'] as SessionListPage['completeness']
  return succeed({ items, next: token === null ? null : token.ok, completeness })
}

export function directoryOf<P>(context: Context<P>): SessionDirectory<P> {
  return {
    list: input => {
      const fields = { lifecycle: input.lifecycle, titleContains: input.titleContains }
      const refused = titleFailure(input.titleContains)
      return page(context, input, 'session-list', { fields, refused })
    },
    listArchived: input => {
      const fields = {
        from: input.from,
        to: input.to,
        by: input.by,
        titleContains: input.titleContains,
      }
      return page(context, input, 'archived-list', { fields, refused: filterFailure(fields) })
    },
  }
}
