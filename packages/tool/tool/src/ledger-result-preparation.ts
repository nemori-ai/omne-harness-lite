import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ConsumerRef,
  type DurableEvidence,
  type Reply,
  type ToolFailure,
  type ToolOperationId,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import type { CallInput, MutationInput } from './boundary.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import { put, reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import type { LedgerDomain } from './ledger-store.ts'
import type { TerminalText } from './ledger-start.ts'
import type { createLedgerMaterialCustody } from './ledger-material-custody.ts'
import { prepareResultChannels, type ResultChannels } from './ledger-result-material.ts'

export type SyntheticNeed = Readonly<{
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>
  consumer: ConsumerRef
}>
export type ResultPreparationRecord = Readonly<{
  id: ToolOperationId
  operation: ToolOperationId
  inputDigest: string
  need: SyntheticNeed
  basis: DurableEvidence
  state: Readonly<{ kind: 'preparing' }> | Readonly<{ kind: 'prepared'; channels: ResultChannels }>
}>
export type PreparedSynthetic = ResultPreparationRecord &
  Readonly<{ state: Readonly<{ kind: 'prepared'; channels: ResultChannels }> }>
export type SyntheticDecision<T> =
  | Decision<T>
  | Readonly<{ kind: 'prepare-synthetic'; need: SyntheticNeed }>
export type SyntheticDecider<T> = (
  snapshot: Snapshot,
  mint: Mint,
  prepared: PreparedSynthetic | null,
) => SyntheticDecision<T>

type PreparationTransaction = (
  domain: LedgerDomain,
  operation: ToolOperationId,
  decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<ResultPreparationRecord>>,
  unknown: Outcome<ResultPreparationRecord, ToolFailure>,
) => Reply<ResultPreparationRecord>

export function createResultPreparation<P, B extends ContentBlock>(
  ports: Readonly<{
    authorize(input: unknown): Reply<CallInput<P>>
    custody: ReturnType<typeof createLedgerMaterialCustody<P>>
    transact: PreparationTransaction
    text: TerminalText<B>
  }>,
) {
  return async (
    input: MutationInput<P> & Readonly<{ inputDigest: string }>,
    need: SyntheticNeed,
    validate: (snapshot: Snapshot) => Outcome<void, ToolFailure>,
  ): Reply<PreparedSynthetic> => {
    const identity = decodeToolOperationId(
      `result-preparation:${createHash('sha256')
        .update(input.operation)
        .update('\0')
        .update(input.inputDigest)
        .digest('hex')}`,
    )
    if ('failure' in identity)
      return fail({ kind: 'invalid', field: 'operation', reason: 'preparation-identity' })
    const id = identity.ok
    const domain = { kind: 'call', tenant: input.tenant, call: input.call } as const
    const unknown = fail({ kind: 'commit-unknown', operation: id } as const)
    const check = async (snapshot: Snapshot) => {
      const qualified = await ports.authorize(input)
      return 'failure' in qualified ? qualified : validate(snapshot)
    }
    const intent = await ports.transact(
      domain,
      id,
      async (snapshot, mint) => {
        const checked = await check(snapshot)
        if ('failure' in checked) return reply(checked)
        const known = snapshot.resultPreparations.get(id)
        if (known !== undefined) {
          if (
            known.operation !== input.operation ||
            known.inputDigest !== input.inputDigest ||
            digestOf(known.need) !== digestOf(need)
          )
            return reply(fail({ kind: 'conflict', operation: input.operation }))
          return reply(succeed(known))
        }
        if (snapshot.operations.has(id)) return reply(fail({ kind: 'conflict', operation: id }))
        const basis = mintEvidence(
          'result-preparation',
          { tenant: input.tenant, call: input.call, operation: id },
          mint.revision,
          { operation: input.operation, inputDigest: input.inputDigest, need },
        )
        const record: ResultPreparationRecord = {
          id,
          operation: input.operation,
          inputDigest: input.inputDigest,
          need,
          basis,
          state: { kind: 'preparing' },
        }
        return {
          kind: 'commit',
          value: record,
          writes: [
            put({ kind: 'result-preparation', preparation: record }),
            put({
              kind: 'operation',
              operation: {
                tenant: input.tenant,
                call: input.call,
                operation: id,
                inputDigest: input.inputDigest,
                revision: mint.revision,
                receipt: { kind: 'prepare-result', basis },
              },
            }),
          ],
        }
      },
      unknown,
    )
    if ('failure' in intent) return intent
    if (intent.ok.state.kind === 'prepared')
      return succeed({ ...intent.ok, state: intent.ok.state })
    const made = ports.text(need.terminal)
    if ('failure' in made) return made
    const channels = await prepareResultChannels(
      ports.custody,
      { ...input, operation: id, source: intent.ok.basis },
      made.ok,
      validate,
    )
    if ('failure' in channels) return channels
    const saved = await ports.transact(
      domain,
      id,
      async snapshot => {
        const checked = await check(snapshot)
        if ('failure' in checked) return reply(checked)
        const known = snapshot.resultPreparations.get(id)
        if (known === undefined || digestOf(known.basis) !== digestOf(intent.ok.basis))
          return reply(fail({ kind: 'conflict', operation: input.operation }))
        if (known.state.kind === 'prepared')
          return digestOf(known.state.channels) === digestOf(channels.ok)
            ? reply(succeed(known))
            : reply(fail({ kind: 'conflict', operation: input.operation }))
        const record: ResultPreparationRecord = {
          ...known,
          state: { kind: 'prepared', channels: channels.ok },
        }
        return {
          kind: 'commit',
          value: record,
          writes: [put({ kind: 'result-preparation', preparation: record })],
        }
      },
      unknown,
    )
    if ('failure' in saved) return saved
    return saved.ok.state.kind === 'prepared'
      ? succeed({ ...saved.ok, state: saved.ok.state })
      : fail({
          kind: 'unavailable',
          dependency: 'result-preparation',
          diagnostic: 'result preparation is incomplete',
        })
  }
}
