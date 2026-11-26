import type { PortRead } from '@omne-harness/goal'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import type { SessionFailure, WorkSnapshot } from '@omne-harness/session-contract'
import {
  createGoalCalls,
  createGoalHistory,
  createGoalSessions,
  type DescribeCall,
  type Called,
  type HistoryResults,
  type SessionCalls,
} from '../src/index.ts'

const organization = organizationCodec.parse('org_c0nf0rmance000000000000000')
const account = accountCodec.parse('acc_c0nf0rmance000000000000000')
if (!organization.ok || !account.ok) throw new Error('illegal test tenant')
export const LEGAL_TENANT = tenant(organization.value, account.value)
const encoded = tenantCodec.encode(LEGAL_TENANT)
if (!encoded.ok) throw new Error('the test tenant has no text')
export const TENANT = encoded.value
export const SESSION = 'a'.repeat(64)

export function work(change: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return { session: SESSION, lifecycle: 'dormant', ...change } as unknown as WorkSnapshot
}
export const failure = (kind: SessionFailure['kind']): Called<unknown> => ({
  failure: { kind, owner: 'session', diagnostic: kind } as SessionFailure,
})

/** Reads every call as a run of its `script` argument that exited 0 and wrote nothing, and shows its result under a mark. */
export const describeRun: DescribeCall = call => ({
  tool: call.tool,
  command: (call.arguments as { script?: string } | null)?.script ?? null,
  path: null,
  exit: 0,
  writes: false,
  output: `shown: ${call.result}`,
})

export function world(describe: DescribeCall = describeRun) {
  const accepted: Parameters<SessionCalls['accept']>[0][] = []
  const state = {
    work: { kind: 'read', value: work() } as PortRead<WorkSnapshot | null>,
    answer: { ok: null } as Called<unknown> | Error,
    head: { kind: 'read', value: '41' } as PortRead<string | null>,
    drives: { kind: 'read', value: false } as PortRead<boolean>,
    opened: { kind: 'read', value: null } as Awaited<ReturnType<SessionCalls['opened']>>,
    asked: { kind: 'read', value: null } as Awaited<ReturnType<SessionCalls['asked']>> | Error,
    pages: [] as PortRead<HistoryResults>[],
  }
  const asked: { after: string | null; cursor: string | null }[] = []
  const read: { tenant: unknown; session: string }[] = []
  let broken = false
  const opens = { count: 0 }
  const calls: SessionCalls = {
    async accept(input) {
      accepted.push(input)
      if (state.answer instanceof Error) throw state.answer
      return state.answer
    },
    async work() {
      return state.work
    },
    async head() {
      return state.head
    },
    async drives() {
      return state.drives
    },
    async asked() {
      if (state.asked instanceof Error) throw state.asked
      return state.asked
    },
    async opened() {
      opens.count += 1
      return state.opened
    },
    async resultsAfter({ after, cursor, tenant, session }) {
      asked.push({ after, cursor })
      read.push({ tenant, session })
      if (broken) throw new Error('down')
      return state.pages[asked.length - 1] ?? { kind: 'read', value: { entries: [], next: null } }
    },
    async callsAfter({ after, cursor }) {
      asked.push({ after, cursor })
      if (broken) throw new Error('down')
      return state.pages[asked.length - 1] ?? { kind: 'read', value: { entries: [], next: null } }
    },
  }
  return {
    sessions: createGoalSessions(calls),
    cited: createGoalCalls(calls).cited,
    history: createGoalHistory(calls, describe),
    accepted,
    asked,
    read,
    breakHistory: () => void (broken = true),
    opens,
    state,
  }
}

/** A history entry holding the result of one tool call, as Session hands it out. */
export const result = (callId: string) => ({
  id: callId,
  kind: 'message.tool',
  payload: {
    message: {
      blocks: [
        { kind: 'tool_result', callId },
        { kind: 'text', text: 'ok' },
      ],
    },
  },
})
export const page = (
  entries: readonly unknown[],
  next: string | null,
): PortRead<HistoryResults> => ({
  kind: 'read',
  value: { entries, next },
})
