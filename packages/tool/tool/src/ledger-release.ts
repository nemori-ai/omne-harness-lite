import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ConsumerRef,
  Handoff,
  Reply,
  ToolDeliveryId,
  ToolFailure,
  ToolResultVersion,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  judgeConsumerRef,
  judgeHandoff,
  type ToolCommands,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import { invalid, type MutationInput } from './boundary.ts'
import { digestOf } from './evidence.ts'
import { decideReleasePlaceholder } from './ledger-control.ts'
import { decideRelease, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import type { ToolLedgerAction } from './ledger-guards.ts'
import type { Decide } from './ledger-transactions.ts'

type DeliveryHandoff = Readonly<{
  delivery: ToolDeliveryId
  consumer: ConsumerRef
  evidence: Handoff
}>

type Mutate<P> = <T>(
  input: unknown,
  action: ToolLedgerAction,
  decide: (checked: MutationInput<P>) => Promise<Outcome<Decide<T>, ToolFailure>>,
) => Reply<T>

function field<T>(
  judged: Outcome<T, Readonly<{ field: string; reason: string }>>,
  name: string,
  root: string,
): Outcome<T, ToolFailure> {
  if ('ok' in judged) return judged
  const { field: at, reason } = judged.failure
  return invalid(at === root ? name : `${name}.${at}`, reason)
}

function judgeDeliveryHandoff(input: object): Outcome<DeliveryHandoff, ToolFailure> {
  const delivery = decodeToolDeliveryId(Reflect.get(input, 'delivery'))
  if ('failure' in delivery) return invalid('delivery', delivery.failure.reason)
  const consumer = field(
    judgeConsumerRef(Reflect.get(input, 'consumer')),
    'consumer',
    'ConsumerRef',
  )
  if ('failure' in consumer) return consumer
  const evidence = field(judgeHandoff(Reflect.get(input, 'evidence')), 'evidence', 'Handoff')
  if ('failure' in evidence) return evidence
  return succeed({ delivery: delivery.ok, consumer: consumer.ok, evidence: evidence.ok })
}

function judgeRelease(
  input: object,
): Outcome<Readonly<{ result: ToolResultVersion }> & DeliveryHandoff, ToolFailure> {
  const result = decodeToolResultVersion(Reflect.get(input, 'result'))
  if ('failure' in result) return invalid('result', result.failure.reason)
  const handoff = judgeDeliveryHandoff(input)
  return 'failure' in handoff ? handoff : succeed({ result: result.ok, ...handoff.ok })
}

export function createReleaseCommands<P, B extends ContentBlock>(
  mutate: Mutate<P>,
  graceEnd: () => ToolInstant | null,
): Pick<ToolCommands<P, B>, 'releaseDelivery' | 'releasePlaceholder'> {
  const release =
    <F extends object, T>(
      judge: (input: object) => Outcome<F, ToolFailure>,
      decide: (
        snapshot: Snapshot,
        command: MutationInput<P> & F & Readonly<{ inputDigest: string }>,
        mint: Mint,
      ) => Decision<T>,
    ) =>
    (input: object): Reply<T> =>
      mutate(input, 'release-delivery', checked => {
        const judged = judge(input)
        if ('failure' in judged) return Promise.resolve(judged)
        const command = { ...checked, ...judged.ok, inputDigest: digestOf(judged.ok) }
        return Promise.resolve(
          succeed<Decide<T>>((snapshot, mint) => decide(snapshot, command, mint)),
        )
      })
  return {
    releaseDelivery: release(judgeRelease, (snapshot, command, mint) =>
      decideRelease(snapshot, command, mint, graceEnd()),
    ),
    releasePlaceholder: release(judgeDeliveryHandoff, decideReleasePlaceholder),
  }
}
