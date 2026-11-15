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
  setRelation: [M, D, D],
  configureAutoArchive: [M, D, D],
  considerAutoArchive: WORK_ONLY,
  recordIdle: WORK_ONLY,
  addTodo: WORK_ONLY,
  markTodoComplete: WORK_ONLY,
  removeTodo: WORK_ONLY,
  listTodos: WORK_ONLY,
  interrupt: [M, D, D],
  cancelRun: BOTH,
  stopCall: BOTH,
  retryRun: BOTH,
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
  'directory.list': [M, D, D],
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
  'receive-result': WORK_ONLY,
  'read-message-handoff': NOT_MEMBER_ROW,
  'record-message-handoff': NOT_MEMBER_ROW,
  'exclude-message-handoff': NOT_MEMBER_ROW,
  settle: NOT_MEMBER_ROW,
  'migrate-cancellation': NOT_MEMBER_ROW,
} as const satisfies Readonly<Record<AgentAccessOperation, Golden>>

function describeCell(cell: PolicyCell): string {
  switch (cell.verdict) {
    case 'deny':
      return 'deny'
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
  it('has the 45 Session rows and 26 Agent rows of the baseline enumerations', () => {
    expect(Object.keys(SESSION_GOLDEN)).toHaveLength(45)
    expect(Object.keys(AGENT_GOLDEN)).toHaveLength(26)
  })
})
