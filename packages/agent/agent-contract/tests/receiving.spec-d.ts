// Type probes of the receiving surface (SPEC "生产者接收面"). They fail the type check when an entry
// stops reusing the producer's own key, when an entry of the advancing side can be recorded
// without an Authority, or when the snapshot field stops being optional.
import { describe, expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  AgentJournalEntriesFixture,
  RequiredReceivedCommits,
} from '@omne-harness/agent-contract/testing'
import type { CallAccount } from '@omne-harness/call-account'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  Access,
  AgentReceivedCommits,
  AgentReceivedProvider,
  AgentJournal,
  AgentMaterials,
  ExecutionMutation,
  Material,
  DurableEvidence,
  ReceivedCommitInput,
  ReceivedCommitValue,
  ReceivedCommitResult,
  ReceivedCommitQuery,
  AgentAccessOperation,
  AgentAccountHandoff,
  AgentAccountOutcome,
  AgentAccountOutlet,
  AgentJournalEntries,
  AgentJournalEntry,
  Authority,
  CommandReceipt,
  ExecutionSnapshot,
  JournalEntryRecord,
  ReceivedDelivery,
  ReceivedEntry,
  Reply,
  StartFenceEntry,
} from '@omne-harness/agent-contract'

describe('the receiving entries', () => {
  it('have the three kinds of the SPEC table', () => {
    expectTypeOf<AgentJournalEntry['kind']>().toEqualTypeOf<'start-fence' | 'received'>()
  })

  it('reuse the delivery keys of Model and Tool, one branch per kind of key', () => {
    type Model = Extract<ReceivedDelivery, { producer: 'model' }>
    type Tool = Extract<ReceivedDelivery, { producer: 'tool' }>
    expectTypeOf<Model['key']>().toEqualTypeOf<M.ModelDeliveryKey>()
    expectTypeOf<Tool['key']>().toEqualTypeOf<T.ToolDeliveryKey>()
    expectTypeOf<Extract<Model, { key: { kind: 'result' } }>['accounts']>().toEqualTypeOf<
      readonly M.ModelAccountSnapshot[]
    >()
    expectTypeOf<
      Extract<Model, { key: { kind: 'account' } }>['account']
    >().toEqualTypeOf<CallAccount>()
    expectTypeOf<
      Extract<Tool, { key: { kind: 'result' } }>['account']
    >().toEqualTypeOf<CallAccount | null>()
    expectTypeOf<
      Extract<Tool, { key: { kind: 'account' } }>['account']
    >().toEqualTypeOf<CallAccount>()
    expectTypeOf<ReceivedEntry['kind']>().toEqualTypeOf<'received'>()
  })

  it('cannot carry a null account on an account delivery', () => {
    const key = null as unknown as Extract<M.ModelDeliveryKey, { kind: 'account' }>
    // @ts-expect-error An account delivery carries the CallAccount of its revision.
    const refused: ReceivedDelivery = { producer: 'model', key, account: null }
    void refused
  })

  it('name the Tool operation of the fence with the root identity of Tool', () => {
    expectTypeOf<StartFenceEntry['operation']>().toEqualTypeOf<T.ToolOperationId>()
  })
})

describe('the record input', () => {
  it('needs an Authority for an entry of the advancing side and none for received', () => {
    type Input = JournalEntryRecord<string>
    expectTypeOf<Extract<Input, { authority: null }>['entry']>().toEqualTypeOf<ReceivedEntry>()
    expectTypeOf<
      Extract<Input, { authority: Authority }>['entry']
    >().toEqualTypeOf<StartFenceEntry>()
    const fence = null as unknown as StartFenceEntry
    const base = null as unknown as Omit<Input, 'authority' | 'entry'>
    // @ts-expect-error A start-fence entry cannot be recorded without an Authority.
    const refused: Input = { ...base, authority: null, entry: fence }
    void refused
  })

  it('returns a command receipt', () => {
    expectTypeOf<AgentJournalEntries<string>['record']>().returns.toEqualTypeOf<
      Reply<CommandReceipt>
    >()
  })
})

describe('the snapshot', () => {
  it('lists the entries in an optional field', () => {
    expectTypeOf<ExecutionSnapshot['entries']>().toEqualTypeOf<
      readonly AgentJournalEntry[] | undefined
    >()
    const snapshot = null as unknown as Omit<ExecutionSnapshot, 'entries'>
    const withoutEntries: ExecutionSnapshot = snapshot
    void withoutEntries
  })
})

describe('the access check', () => {
  it('names the receive operation of the result receiver', () => {
    expectTypeOf<'receive-result'>().toExtend<AgentAccessOperation>()
  })
})

describe('the account outlet', () => {
  it('takes an explicit Access and a handoff with a tenant-bound Model call', () => {
    expectTypeOf<Parameters<AgentAccountOutlet<string>['deliver']>[0]>().toEqualTypeOf<
      Readonly<{ access: Access<string>; handoff: AgentAccountHandoff }>
    >()
    expectTypeOf<AgentAccountHandoff['call']>().toEqualTypeOf<M.ModelInvocationRef>()
    expectTypeOf<AgentAccountHandoff['dispatch']>().toEqualTypeOf<M.DispatchId>()
    expectTypeOf<AgentAccountHandoff['resultVersion']>().toEqualTypeOf<M.ResultVersion | null>()
  })

  it('answers with the six kinds of the SPEC', () => {
    expectTypeOf<AgentAccountOutcome['kind']>().toEqualTypeOf<
      'received' | 'denied' | 'conflict' | 'invalid' | 'unknown' | 'unavailable'
    >()
  })
})

describe('the additive joint receiving port', () => {
  it('takes a draft and complete material without Authority or caller material evidence', () => {
    type Input = ReceivedCommitInput<string, ContentBlock>
    expectTypeOf<Input['entry']>().toEqualTypeOf<Omit<ReceivedEntry, 'material'>>()
    expectTypeOf<Input['material']>().toEqualTypeOf<Material<ContentBlock>>()
    expectTypeOf<Input>().toExtend<ExecutionMutation<string>>()
    expectTypeOf<Extract<keyof Input, 'authority'>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<keyof Input['entry'], 'material'>>().toEqualTypeOf<never>()
    expectTypeOf<
      Parameters<AgentReceivedCommits<string, ContentBlock>['commit']>[0]
    >().toEqualTypeOf<Input>()
    expectTypeOf<
      Parameters<AgentReceivedCommits<string, ContentBlock>['query']>[0]
    >().toEqualTypeOf<ExecutionMutation<string>>()
  })

  it('keeps the full original receipt, entry and separate saved evidence', () => {
    expectTypeOf<ReceivedCommitValue>().toEqualTypeOf<
      Readonly<{
        receipt: CommandReceipt
        entry: ReceivedEntry
        saved: DurableEvidence
      }>
    >()
    expectTypeOf<ReceivedCommitResult['kind']>().toEqualTypeOf<'committed' | 'excluded'>()
    expectTypeOf<ReceivedCommitQuery['kind']>().toEqualTypeOf<
      'committed' | 'excluded' | 'unknown'
    >()
    expectTypeOf<AgentReceivedCommits<string, ContentBlock>['commit']>().returns.toEqualTypeOf<
      Reply<ReceivedCommitResult>
    >()
    expectTypeOf<AgentReceivedCommits<string, ContentBlock>['query']>().returns.toEqualTypeOf<
      Reply<ReceivedCommitQuery>
    >()
  })

  it('describes one provider without adding requirements to old ports or fixtures', () => {
    type Provider = AgentReceivedProvider<string, ContentBlock>
    expectTypeOf<Provider['journal']>().toEqualTypeOf<AgentJournal<string>>()
    expectTypeOf<Provider['entries']>().toEqualTypeOf<AgentJournalEntries<string>>()
    expectTypeOf<Provider['materials']>().toEqualTypeOf<AgentMaterials<string, ContentBlock>>()
    expectTypeOf<Provider['received']>().toEqualTypeOf<AgentReceivedCommits<
      string,
      ContentBlock
    > | null>()
    expectTypeOf<keyof AgentJournalEntries<string>>().toEqualTypeOf<'record'>()
    expectTypeOf<
      Extract<keyof AgentJournalEntriesFixture<string>, 'joint'>
    >().toEqualTypeOf<never>()
    expectTypeOf<
      RequiredReceivedCommits<string, ContentBlock>['received']
    >().toEqualTypeOf<'required'>()
  })
})
