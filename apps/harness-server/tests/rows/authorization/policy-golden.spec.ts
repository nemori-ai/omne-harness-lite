// A literal golden table of the two policy tables, cell by cell (policy draft §5 and §6). Each
// cell writes the kind of verdict and its branch condition. The tables in `src/` are compared to
// it one cell at a time, so a cell that changes, two cells that swap and a row that is added or
// removed each fail here. Row completeness against the enumerations is `policy.spec-d.ts`; this
// file pins what each cell decides. The golden is typed over the same enumerations, so it cannot
// miss a row either.
//
// Cell notation:
//   deny                            denied (a written basis, no dependency called)
//   member                          the tenant admission check, any request of the operation
//   member [routed a|b]             the same, only when the RoutedInput kind is one of the listed
//   matrix <purpose>                the system action authorization on the purpose
//   matrix <purpose> [fact a]       the same, only when the fact kind is the listed one
//   pending <D item>                denied until the D item is decided
// Column order of every row is login, work, system. The policy draft prints the Agent columns as
// W, L, S; the golden uses the order of `PrincipalColumn` for both tables.
import { describe, expect, it } from 'vitest'
import type { AgentAccessOperation } from '@omne-harness/agent-contract'
import type { SessionAccessOperation } from '@omne-harness/session-contract'
import {
  AGENT_POLICY,
  SESSION_POLICY,
  type PolicyCell,
  type PolicyRow,
  type PrincipalColumn,
} from '../../../src/rows/authorization/index.ts'

type Golden = readonly [login: string, work: string, system: string]

const COLUMNS: readonly PrincipalColumn[] = ['login', 'work', 'system']

const D = 'deny'
const M = 'member'
const NOT_MEMBER_ROW: Golden = [D, D, D]
const WORK_ONLY: Golden = [D, M, D]
const BOTH: Golden = [M, M, D]

const SESSION_GOLDEN = {
  accept: ['member [routed ordinary|card-decision]', 'member [routed business]', D],
  startRun: WORK_ONLY,
  claim: WORK_ONLY,
  reload: WORK_ONLY,
  recordMessage: WORK_ONLY,
  preserveResult: WORK_ONLY,
  completeConsumption: WORK_ONLY,
  completeExternalConsumption: WORK_ONLY,
  bindExternalCall: WORK_ONLY,
  commitDerived: WORK_ONLY,
  release: WORK_ONLY,
  control: BOTH,
  finishRun: WORK_ONLY,
  create: [M, D, D],
  completeInitialization: NOT_MEMBER_ROW,
  change: [M, D, D],
  setRelation: ['pending D-2', D, D],
  configureAutoArchive: ['pending D-1', D, D],
  considerAutoArchive: WORK_ONLY,
  recordIdle: WORK_ONLY,
  interrupt: [M, D, D],
  cancelRun: BOTH,
  stopCall: BOTH,
  freeze: WORK_ONLY,
  receive: [D, M, 'matrix scope-release-receive [fact scope-release]'],
  readWork: WORK_ONLY,
  readInput: WORK_ONLY,
  queryOperation: BOTH,
  readModelSelection: BOTH,
  queryControlOperation: BOTH,
  loadRecovery: WORK_ONLY,
  inspectIdle: WORK_ONLY,
  'history.begin': BOTH,
  'history.next': BOTH,
  'history.since': BOTH,
  'history.readModelView': WORK_ONLY,
  pending: [D, M, 'matrix pending-sessions'],
  references: [D, D, 'matrix resident-references'],
  releasedScopes: [D, D, 'matrix released-scopes'],
} as const satisfies Readonly<Record<SessionAccessOperation, Golden>>

const AGENT_GOLDEN = {
  invoke: WORK_ONLY,
  resume: WORK_ONLY,
  submit: WORK_ONLY,
  control: WORK_ONLY,
  read: NOT_MEMBER_ROW,
  events: NOT_MEMBER_ROW,
  acknowledge: NOT_MEMBER_ROW,
  takeover: WORK_ONLY,
  observe: NOT_MEMBER_ROW,
  resolve: WORK_ONLY,
  connect: NOT_MEMBER_ROW,
  reserve: WORK_ONLY,
  publish: [D, D, 'matrix agent-instance-publish'],
  withdraw: [D, D, 'matrix agent-instance-withdraw'],
  quiesce: [D, D, 'matrix agent-instance-quiesce'],
  query: WORK_ONLY,
  load: WORK_ONLY,
  reconcile: NOT_MEMBER_ROW,
  detach: WORK_ONLY,
  'record-terminal-observation': NOT_MEMBER_ROW,
  'receive-result': NOT_MEMBER_ROW,
  'read-message-handoff': NOT_MEMBER_ROW,
  'record-message-handoff': NOT_MEMBER_ROW,
  'exclude-message-handoff': NOT_MEMBER_ROW,
  settle: NOT_MEMBER_ROW,
  'migrate-cancellation': NOT_MEMBER_ROW,
} as const satisfies Readonly<Record<AgentAccessOperation, Golden>>

/** The cell in the notation of the golden table. */
function describeCell(cell: PolicyCell): string {
  switch (cell.verdict) {
    case 'deny':
      return 'deny'
    case 'deny-pending':
      return `pending ${cell.item}`
    case 'member':
    case 'matrix': {
      const head = cell.verdict === 'member' ? 'member' : `matrix ${cell.purpose}`
      if (cell.when === undefined) return head
      const kinds: readonly string[] = cell.when.kinds
      return `${head} [${cell.when.kind} ${kinds.join('|')}]`
    }
    default: {
      const _exhaustive: never = cell
      return String(_exhaustive)
    }
  }
}

function compare(
  name: string,
  table: Readonly<Record<string, PolicyRow>>,
  golden: Readonly<Record<string, Golden>>,
) {
  describe(`${name} table against the golden`, () => {
    it('has exactly the rows of the golden', () => {
      expect(Object.keys(table).toSorted()).toEqual(Object.keys(golden).toSorted())
    })

    it.each(Object.entries(golden))('judges %s cell by cell', (operation, expected) => {
      const row = table[operation]
      expect(row, operation).toBeDefined()
      const actual = COLUMNS.map(column => describeCell(row![column]))
      expect(actual, operation).toEqual([...expected])
    })
  })
}

compare('Session', SESSION_POLICY, SESSION_GOLDEN)
compare('Agent', AGENT_POLICY, AGENT_GOLDEN)

describe('the golden itself', () => {
  it('has the 39 Session rows and 26 Agent rows of the baseline enumerations', () => {
    expect(Object.keys(SESSION_GOLDEN)).toHaveLength(39)
    expect(Object.keys(AGENT_GOLDEN)).toHaveLength(26)
  })
})
