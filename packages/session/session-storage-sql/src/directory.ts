import type { JsonValue } from '@omne-harness/sql-contract'
import { succeed } from '@omne-harness/operation-result'
import type {
  ArchivedBy,
  SessionDirectory,
  SessionId,
  SessionListItem,
  SessionListPage,
} from '@omne-harness/session-contract'
import { domainOf, failure, qualify, readHandler, type Context } from './context.ts'
import { open, seal } from './cursor.ts'

type Listing = Parameters<SessionDirectory<unknown>['list']>[0]
type Filters = Readonly<{
  from: string | null
  to: string | null
  by: ArchivedBy | null
  titleContains: string | null
}>

const TITLE_TEXT_MAX = 200
const BY: readonly ArchivedBy[] = ['person', 'auto', 'parent']

function filterFailure(filters: Filters) {
  if (filters.by !== null && !BY.includes(filters.by))
    return failure({ kind: 'invalid', field: 'by', reason: 'not person, auto or parent' })
  if (filters.titleContains !== null && [...filters.titleContains].length > TITLE_TEXT_MAX)
    return failure({ kind: 'invalid', field: 'titleContains', reason: 'longer than 200' })
  if (filters.from !== null && filters.to !== null && filters.from >= filters.to)
    return failure({ kind: 'invalid', field: 'to', reason: 'not after from' })
  return null
}

const limitFailure = (limit: number) =>
  Number.isInteger(limit) && limit >= 1 && limit <= 1000
    ? null
    : failure({ kind: 'invalid', field: 'limit', reason: 'not an integer from 1 to 1000' })

// One page of one list of the directory: the cursor is bound to the list it came from. The access
// check comes first, so a caller who may not list learns nothing from the shape of its input.
async function page<P>(
  context: Context<P>,
  input: Listing & { principal: P },
  list: 'session-list' | 'archived-list',
  extra: Readonly<{
    fields: Readonly<Record<string, JsonValue>>
    refused: ReturnType<typeof filterFailure>
  }>,
) {
  const decided = await qualify(context, {
    access: { principal: input.principal, tenant: input.tenant },
    operation: 'directory.list',
    target: { kind: 'tenant', tenant: input.tenant },
  })
  if ('failure' in decided) return decided
  const domain = await domainOf(context, input.tenant)
  if ('failure' in domain) return domain
  const refused = limitFailure(input.limit) ?? extra.refused
  if (refused !== null) return refused
  const binding = { kind: list, tenant: domain.ok.text, session: null }
  const opened =
    input.after === null
      ? succeed(null)
      : await open<JsonValue>(context.cursor, binding, input.after)
  if ('failure' in opened) return opened
  const after = opened.ok
  const handler = list === 'session-list' ? 'session.list' : 'session.list-archived'
  const out = await readHandler(context, domain.ok.domain, handler, {
    tenant: domain.ok.text,
    after,
    limit: input.limit,
    ...extra.fields,
  })
  if ('failure' in out) return out
  const next = out.ok['next']
  const token = next === null ? null : await seal(context.cursor, binding, next)
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
    list: input => page(context, input, 'session-list', { fields: {}, refused: null }),
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
