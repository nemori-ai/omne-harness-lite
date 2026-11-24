import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { Body } from './answers.ts'
import { listArchivedSessions, listSessions, type ListingPorts } from './archive.ts'
import { searchHistory, type SearchPorts } from './search-history.ts'

type Call = Readonly<{ principal: LoginIdentity }>

/** The reads over a whole tenant as handlers of the contribution. */
export function tenantReadOperations(ports: ListingPorts & SearchPorts) {
  return {
    'search-history': (call: Call, body: Body<'search-history'>) =>
      searchHistory(ports, call.principal, body),
    'list-sessions': (call: Call, body: Body<'list-sessions'>) =>
      listSessions(ports, call.principal, body),
    'list-archived-sessions': (call: Call, body: Body<'list-archived-sessions'>) =>
      listArchivedSessions(ports, call.principal, body),
  }
}
