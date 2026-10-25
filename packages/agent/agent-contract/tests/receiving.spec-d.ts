// Type probes of the receiving surface (SPEC "生产者接收面"). They fail the type check when an entry
// stops reusing the producer's own key, when an entry of the advancing side can be recorded
// without an Authority, or when the snapshot field stops being optional.
import { describe, expectTypeOf, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import type * as M from '@omne-harness/model-contract'
import type { StreamProducer, StreamRef } from '@omne-harness/stream-arrival'
import type * as T from '@omne-harness/tool-contract'
import type {
  Access,
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
  StreamReferenceEntry,
} from '@omne-harness/agent-contract'

describe('the receiving entries', () => {
  it('have the three kinds of the SPEC table', () => {
    expectTypeOf<AgentJournalEntry['kind']>().toEqualTypeOf<
      'start-fence' | 'received' | 'stream-reference'
    >()
  })

  it('reuse the delivery keys of Model and Tool as the key of a received delivery', () => {
    expectTypeOf<
      Extract<ReceivedDelivery, { producer: 'model' }>['key']
    >().toEqualTypeOf<M.ModelDeliveryKey>()
    expectTypeOf<
      Extract<ReceivedDelivery, { producer: 'tool' }>['key']
    >().toEqualTypeOf<T.ToolDeliveryKey>()
    expectTypeOf<
      Extract<ReceivedDelivery, { producer: 'tool' }>['account']
    >().toEqualTypeOf<CallAccount | null>()
    expectTypeOf<ReceivedEntry['kind']>().toEqualTypeOf<'received'>()
  })

  it('keep the stream reference of stream-arrival and no credential', () => {
    expectTypeOf<StreamReferenceEntry['reference']>().toEqualTypeOf<StreamRef>()
    expectTypeOf<StreamReferenceEntry['producer']>().toEqualTypeOf<StreamProducer>()
    expectTypeOf<keyof StreamReferenceEntry>().toEqualTypeOf<
      'kind' | 'producer' | 'reference' | 'consumption'
    >()
  })

  it('name the Tool operation of the fence with the root identity of Tool', () => {
    expectTypeOf<StartFenceEntry['operation']>().toEqualTypeOf<T.ToolOperationId>()
  })
})

describe('the record input', () => {
  it('needs an Authority for an entry of the advancing side and none for received', () => {
    type Input = JournalEntryRecord<string>
    expectTypeOf<Extract<Input, { authority: null }>['entry']>().toEqualTypeOf<ReceivedEntry>()
    expectTypeOf<Extract<Input, { authority: Authority }>['entry']>().toEqualTypeOf<
      StartFenceEntry | StreamReferenceEntry
    >()
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
