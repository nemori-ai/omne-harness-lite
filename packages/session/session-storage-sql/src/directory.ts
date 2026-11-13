// The session list of one tenant on the port side (SPEC「提交的时刻与会话列表」): one access check with
// the tenant as the target, then one read of `session.list`. The cursor seals the key of the last
// row the page scanned; the handler continues after it.
import { succeed } from '@omne-harness/operation-result'
import type { SessionDirectory, SessionId, SessionListItem } from '@omne-harness/session-contract'
import { domainOf, failure, qualify, readHandler, type Context } from './context.ts'
import { open, seal } from './cursor.ts'

type Key = Readonly<{ at: string | null; session: string }>

export function directoryOf<P>(context: Context<P>): SessionDirectory<P> {
  return {
    list: async input => {
      const decided = await qualify(context, {
        access: { principal: input.principal, tenant: input.tenant },
        operation: 'directory.list',
        target: { kind: 'tenant', tenant: input.tenant },
      })
      if ('failure' in decided) return decided
      const domain = await domainOf(context, input.tenant)
      if ('failure' in domain) return domain
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1000)
        return failure({ kind: 'invalid', field: 'limit', reason: 'not an integer from 1 to 1000' })
      const binding = { kind: 'session-list', tenant: domain.ok.text, session: null }
      let after: Key | null = null
      if (input.after !== null) {
        const state = await open<Key>(context.cursor, binding, input.after)
        if ('failure' in state) return state
        after = state.ok
      }
      const out = await readHandler(context, domain.ok.domain, 'session.list', {
        tenant: domain.ok.text,
        after,
        limit: input.limit,
        includeArchived: input.includeArchived,
      })
      if ('failure' in out) return out
      const next = out.ok['next'] as Key | null
      const token = next === null ? null : await seal(context.cursor, binding, next)
      if (token !== null && 'failure' in token) return token
      return succeed({
        items: (out.ok['items'] as unknown as SessionListItem[]).map(item => ({
          ...item,
          session: item.session as SessionId,
        })),
        next: token === null ? null : token.ok,
        completeness: out.ok['completeness'] as 'complete' | 'partial',
      })
    },
  }
}
