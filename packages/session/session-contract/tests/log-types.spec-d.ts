// The type controls of the additive contract: what the commit must carry cannot be left out, what
// `create` does not take is not there, and an implementation written before the additions still
// fits the interfaces that grew.
import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionEvidenceCommand,
  GuardCommand,
  ResidentAdoption,
  SessionAccess,
  SessionAdoptionSource,
  SessionCommand,
  SessionEvidenceBridge,
  SessionLogCommitObservation,
  SessionLogObservation,
  SessionTransactionPort,
  SessionWork,
} from '@omne-harness/session-contract'

type Commit = NonNullable<SessionTransactionPort<string>['commitLog']>
type CommitInput = Parameters<Commit>[0]

it('requires the operation and the head receipt of the commit observation', () => {
  const base = {} as SessionLogObservation
  const complete: SessionLogCommitObservation = {
    ...base,
    operation: 'op' as SessionLogCommitObservation['operation'],
    executionEvidence: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
  }
  const input: CommitInput = { observation: complete }
  void input
  // @ts-expect-error the operation is required
  const noOperation: SessionLogCommitObservation = {
    ...base,
    executionEvidence: complete.executionEvidence,
  }
  // @ts-expect-error the head receipt is required
  const noEvidence: SessionLogCommitObservation = { ...base, operation: complete.operation }
  // @ts-expect-error the event channel observation is not enough for the commit
  const optional: CommitInput = { observation: base }
  void [noOperation, noEvidence, optional]
})

it('keeps commitLog optional on the port, so an older provider still fits', () => {
  expectTypeOf<SessionTransactionPort<string>>().toHaveProperty('commitLog')
  type WithoutCommitLog = Omit<SessionTransactionPort<string>, 'commitLog'>
  expectTypeOf<WithoutCommitLog>().toMatchTypeOf<SessionTransactionPort<string>>()
})

it('gives the verdict slot to startRun and reload, and not to create', () => {
  type StartAdoption = NonNullable<
    Parameters<SessionWork<string>['startRun']>[0]['residentAdoption']
  >
  type ReloadAdoption = NonNullable<
    Parameters<SessionWork<string>['reload']>[0]['residentAdoption']
  >
  expectTypeOf<StartAdoption>().toHaveProperty('verdict')
  expectTypeOf<ReloadAdoption>().toHaveProperty('verdict')
  expectTypeOf<ResidentAdoption>().not.toHaveProperty('verdict')
  type Create = Extract<SessionCommand, { kind: 'create' }>['input']['creation']['residentAdoption']
  expectTypeOf<NonNullable<Create>>().not.toHaveProperty('verdict')
})

it('accepts a bridge and a source written before access and plan', () => {
  const oldBridge: SessionEvidenceBridge = {
    prepare: async (_command: SessionCommand) => ({ ok: [] as readonly GuardCommand[] }),
  }
  const oldSource: SessionAdoptionSource = {
    prepare: async (_command: AdoptionEvidenceCommand) => ({ ok: [] as readonly GuardCommand[] }),
  }
  const typedBridge: SessionEvidenceBridge<string> = oldBridge
  const typedSource: SessionAdoptionSource<string> = oldSource
  void [typedBridge, typedSource]
})

it('gives the bridge and the source the access of the original call', () => {
  expectTypeOf<Parameters<SessionEvidenceBridge<string>['prepare']>[1]>().toEqualTypeOf<
    SessionAccess<string> | undefined
  >()
  expectTypeOf<Parameters<SessionAdoptionSource<string>['prepare']>[1]>().toEqualTypeOf<
    SessionAccess<string> | undefined
  >()
  type Plan = NonNullable<SessionAdoptionSource<string>['plan']>
  expectTypeOf<Parameters<Plan>[0]>().toEqualTypeOf<SessionAccess<string>>()
  expectTypeOf<Awaited<ReturnType<Plan>>>().toMatchTypeOf<
    Outcome<{ material: ResidentAdoption }, { kind: 'unavailable' }>
  >()
})
