// The accounts conformance suite of ModelCommands: drives an implementation through its public
// methods only and reports, for each account obligation of the Model contract, whether it is kept.
// The account obligations include what lives as long as the account on the dispatch record (the
// message identities) and the batch whose termination cannot settle (nothing of it is kept, the
// account included). The in-memory ModelCommands runs it now; a durable provider runs the same
// suite later.
import { randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { judgePart } from '@omne-harness/message'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  type Access,
  type Admit,
  type CallAccess,
  type CustodyState,
  type DispatchId,
  type DispatchRecord,
  type DurableEvidence,
  type ModelBlock,
  type ModelCallId,
  type ModelInstanceId,
  type ModelOperationId,
  type ResultVersion,
  type Termination,
} from '@omne-harness/model-contract'
import {
  type CallAccountReport,
  type ModelCommands,
  type TransportFact,
  type WriteContext,
} from '@omne-harness/model-contract/provider'

/** What the party that assembled the ModelCommands gives the suite. */
export type CommandsAccountsSubject<P> = Readonly<{
  commands: ModelCommands<P>
  /**
   * An admission the commands accept. The suite gives each call its own `call` and `operation`.
   * Its request holds at least one message, so that the suite can see the message identities.
   */
  admit: Admit<P>
  /** The instance that claims each call; the commands must accept its execution channel. */
  instance: ModelInstanceId
  /** Continuity evidence the commands accept for claiming `call`. */
  continuity(call: ModelCallId): DurableEvidence
  /** A trusted supplier receipt the commands accept for a late fact of this dispatch. */
  lateSource(input: Readonly<{ call: ModelCallId; dispatch: DispatchId }>): DurableEvidence
  /**
   * The completion evidence of the admission's consumer that the commands accept for a processed
   * handoff of this result version of the call.
   */
  completion(input: Readonly<{ call: ModelCallId; result: ResultVersion }>): DurableEvidence
  /** A caller of the admission's tenant without the qualification to read dispatch facts. */
  outsider: Access<P>
  /** Releases what the subject holds. */
  dispose?(): Promise<void>
}>

export type CommandsAccountsOptions<P> = Readonly<{
  /** Makes a fresh subject. The suite makes one per obligation. */
  subject(): CommandsAccountsSubject<P> | Promise<CommandsAccountsSubject<P>>
}>

/** Every obligation, in the order the suite checks them. */
export const ACCOUNT_OBLIGATIONS = [
  'account-completed-with-subject-and-receipt',
  'account-read-by-original-call',
  'same-event-registered-once',
  'same-event-other-report-refused',
  'later-revision-replaces-and-is-late',
  'report-naming-subject-refused',
  'unqualified-reader-refused',
  'messages-outlive-cleanup',
  'state-reply-without-replay-format-refused',
] as const

export type AccountObligation = (typeof ACCOUNT_OBLIGATIONS)[number]

/** A passed obligation carries no detail; a failed one says what the suite saw. */
export type AccountObligationResult =
  | Readonly<{ obligation: AccountObligation; status: 'pass' }>
  | Readonly<{ obligation: AccountObligation; status: 'fail'; detail: string }>

export type CommandsAccountsReport = Readonly<{
  ok: boolean
  results: readonly AccountObligationResult[]
}>

/** A violation the suite found. Every other exception is reported as a thrown subject. */
class AccountsViolation extends Error {}

function check(condition: boolean, detail: string): asserts condition {
  if (!condition) throw new AccountsViolation(detail)
}

function show(value: unknown): string {
  return JSON.stringify(value)
}

function succeeded<T>(
  outcome: Readonly<{ ok: T }> | Readonly<{ failure: unknown }>,
  what: string,
): T {
  if ('ok' in outcome) return outcome.ok
  throw new AccountsViolation(`${what} failed with ${show(outcome.failure)}`)
}

function suffix(): string {
  return randomBytes(8).toString('hex')
}

function decodedOrThrow<T>(outcome: Readonly<{ ok: T }> | Readonly<{ failure: unknown }>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`the suite made an invalid identity: ${show(outcome.failure)}`)
}

const operation = (): ModelOperationId =>
  decodedOrThrow(decodeModelOperationId(`mop_accounts-${suffix()}`))

/** The account a supplier reports for the first time. Its cost is billable and known. */
const REPORT: CallAccountReport = {
  usage: [
    { name: 'input', state: 'known', lexeme: '400', unit: 'token' },
    { name: 'output', state: 'known', lexeme: '18', unit: 'token' },
  ],
  cost: [{ state: 'known', lexeme: '0.000123', unit: 'openrouter-credit', source: 'billable' }],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'accounts-suite/first',
  duration: { state: 'unknown' },
  revision: '1',
}

/** The same event with another value: a contradiction, not a revision. */
const OTHER_REPORT: CallAccountReport = {
  ...REPORT,
  usage: [{ name: 'output', state: 'known', lexeme: '19', unit: 'token' }],
}

/** A later revision that shares no field value with the first report except its kinds. */
const REVISED: CallAccountReport = {
  usage: [{ name: 'output', state: 'known', lexeme: '21', unit: 'token' }],
  cost: [{ state: 'unknown', unit: 'openrouter-credit', source: 'billable' }],
  trimmed: { state: 'known', lexeme: '0', unit: 'token' },
  place: 'accounts-suite/revised',
  duration: 'PT1.2S',
  revision: '2',
}

type Started<P> = Readonly<{
  access: CallAccess<P>
  dispatch: DispatchId
  /** Opens a new receive window of the dispatch and preserves the facts in it. */
  deliver(facts: readonly TransportFact[]): ReturnType<ModelCommands<P>['preserve']>
  /** The dispatch record of this dispatch as `dispatches` gives it to `access`. */
  record(): Promise<DispatchRecord | undefined>
  /** Settles the call with this termination and gives the result version. */
  settle(termination: Termination): Promise<ResultVersion>
  /**
   * Hands the result off as processed, then advances the cleanup step by step until it is
   * `released`, at most `MAX_CLEANUP_STEPS` times. Gives the released custody.
   */
  clean(result: ResultVersion): Promise<CustodyState>
}>

/**
 * The most `advanceCleanup` steps the suite takes after a processed handoff. The contract lets the
 * recovery worker advance the cleanup in steps until `released`; an implementation that is still
 * short of `released` after this many steps fails the obligation.
 */
const MAX_CLEANUP_STEPS = 16

/** Admits and claims a call, then prepares, materializes and starts one dispatch of it. */
async function startedDispatch<P>(subject: CommandsAccountsSubject<P>): Promise<Started<P>> {
  const { commands } = subject
  const call = decodedOrThrow(decodeModelCallId(`mcall_accounts-${suffix()}`))
  const dispatch = decodedOrThrow(decodeDispatchId(`mdisp_accounts-${suffix()}`))
  const access: CallAccess<P> = {
    principal: subject.admit.principal,
    tenant: subject.admit.tenant,
    call,
  }
  succeeded(await commands.admit({ ...subject.admit, call, operation: operation() }), 'admit')
  const execution = succeeded(
    await commands.claim({
      ...access,
      instance: subject.instance,
      operation: operation(),
      continuity: subject.continuity(call),
    }),
    'claim',
  )
  async function write(): Promise<WriteContext> {
    const recovery = succeeded(await commands.loadRecovery(access), 'loadRecovery')
    return { ...execution, operation: operation(), expected: recovery.state.revision }
  }
  const supplier = subject.admit.request.suppliers[0]
  succeeded(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier,
      policyDecision: null,
    }),
    'prepareDispatch',
  )
  succeeded(
    await commands.recordMaterialization({
      ...(await write()),
      dispatch,
      receipt: {
        supplier: supplier.adoption,
        representation: subject.admit.request.representation,
        payloadDigest: 'a'.repeat(64),
      },
    }),
    'recordMaterialization',
  )
  const first = `accounts-${suffix()}`
  succeeded(
    await commands.openReceiveWindow({ ...(await write()), dispatch, window: first }),
    'openReceiveWindow',
  )
  succeeded(
    await commands.recordSend({ ...(await write()), dispatch, state: 'started' }),
    'recordSend',
  )
  let window: string | null = first
  return {
    access,
    dispatch,
    async deliver(facts) {
      if (window === null) {
        window = `accounts-${suffix()}`
        succeeded(
          await commands.openReceiveWindow({ ...(await write()), dispatch, window }),
          'openReceiveWindow',
        )
      }
      const current = window
      window = null
      return commands.preserve({ ...(await write()), dispatch, window: current, facts })
    },
    async record() {
      const records = succeeded(await commands.dispatches(access), 'dispatches')
      return records.find(item => item.dispatch === dispatch)
    },
    async settle(termination) {
      const settled = succeeded(
        await commands.settle({ ...(await write()), termination }),
        'settle',
      )
      return settled.version
    },
    async clean(result) {
      succeeded(
        await commands.handoff({
          ...access,
          operation: operation(),
          result,
          evidence: { kind: 'processed', completion: subject.completion({ call, result }) },
        }),
        'handoff',
      )
      let last: CustodyState | undefined
      for (let step = 1; step <= MAX_CLEANUP_STEPS; step += 1) {
        last = succeeded(
          await commands.advanceCleanup({ ...execution, operation: operation() }),
          `cleanup step ${step}`,
        )
        if (last.kind !== 'acknowledged')
          throw new AccountsViolation(
            `after a processed handoff, cleanup step ${step} gave ${show(last)}`,
          )
        if (last.cleanup === 'released') return last
      }
      throw new AccountsViolation(
        `after a processed handoff the cleanup did not reach released in ${MAX_CLEANUP_STEPS} steps; the last state was ${show(last)}`,
      )
    },
  }
}

function completed<P>(
  started: Started<P>,
  report: CallAccountReport,
  receipt: 'received' | 'late',
): unknown {
  return { ...report, subject: { kind: 'model_call', id: started.access.call }, receipt }
}

function accountFact(event: string, value: CallAccountReport): TransportFact {
  return { kind: 'account', event, value }
}

const COMPLETED = { kind: 'completed', reason: 'stop' } as const

/** A part of the reply through the message judge, so its shape is the one the contract accepts. */
function part(value: unknown): ModelBlock {
  const judged = judgePart(value)
  if (!('ok' in judged)) throw new Error(`the suite made an invalid part: ${show(judged.rejected)}`)
  const block = judged.ok
  if (block.kind === 'text' || block.kind === 'reasoning_state') return block
  throw new Error(`the suite made a part of kind ${block.kind}`)
}

/** One text part of the reply at this index: open, one delta and its seal. */
function textPart(index: string): readonly TransportFact[] {
  const text = part({
    kind: 'text',
    id: 'accounts-reply',
    visibility: { toHuman: true, toModel: true },
    text: 'answer',
  })
  return [
    { kind: 'block-open', index, mode: 'append', content: 'text' },
    { kind: 'block-delta', index, delta: 'answer' },
    { kind: 'block-seal', index, block: text },
  ]
}

/** A reasoning state part sealed whole, then one text part. */
function stateReply(): readonly TransportFact[] {
  const state = part({
    kind: 'reasoning_state',
    id: 'accounts-state',
    visibility: { toHuman: false, toModel: true },
    payload: 'opaque',
    pairs: [],
  })
  return [{ kind: 'block-seal', index: '0', block: state }, ...textPart('1')]
}

async function lateAccount<P>(
  subject: CommandsAccountsSubject<P>,
  started: Started<P>,
  event: string,
  value: CallAccountReport,
) {
  return subject.commands.recordLateFact({
    ...started.access,
    dispatch: started.dispatch,
    operation: operation(),
    source: subject.lateSource({ call: started.access.call, dispatch: started.dispatch }),
    fact: { kind: 'account', event, value },
  })
}

type Obligation<P> = (subject: CommandsAccountsSubject<P>) => Promise<void>

function obligations<P>(): Readonly<Record<AccountObligation, Obligation<P>>> {
  return {
    async 'account-completed-with-subject-and-receipt'(subject) {
      const started = await startedDispatch(subject)
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'preserve of an account')
      const account = (await started.record())?.account
      const expected = completed(started, REPORT, 'received')
      check(
        isDeepStrictEqual(account, expected),
        `the kept account is ${show(account)}, expected ${show(expected)}`,
      )
    },

    async 'account-read-by-original-call'(subject) {
      const started = await startedDispatch(subject)
      const other = await startedDispatch(subject)
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'preserve of an account')
      const original = await started.record()
      check(
        isDeepStrictEqual(original?.account, completed(started, REPORT, 'received')),
        `dispatches of the original call gave ${show(original)}`,
      )
      const records = succeeded(await subject.commands.dispatches(other.access), 'dispatches')
      check(
        records.every(item => item.account === null),
        `dispatches of another call gave an account: ${show(records)}`,
      )
    },

    async 'same-event-registered-once'(subject) {
      const started = await startedDispatch(subject)
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'first delivery')
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'second delivery in stream')
      succeeded(await lateAccount(subject, started, 'usage', REPORT), 'delivery as a late fact')
      const records = succeeded(await subject.commands.dispatches(started.access), 'dispatches')
      const kept = records.filter(item => item.account !== null)
      check(kept.length === 1, `${kept.length} dispatch records hold an account`)
      const expected = completed(started, REPORT, 'received')
      check(
        isDeepStrictEqual(kept[0]?.account, expected),
        `after three deliveries the account is ${show(kept[0]?.account)}, expected ${show(expected)}`,
      )
    },

    async 'same-event-other-report-refused'(subject) {
      const started = await startedDispatch(subject)
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'first delivery')
      const conflict = await started.deliver([accountFact('usage', OTHER_REPORT)])
      check('failure' in conflict, `the same event with another report was accepted`)
      const account = (await started.record())?.account
      check(
        isDeepStrictEqual(account, completed(started, REPORT, 'received')),
        `after the refused report the account is ${show(account)}`,
      )
    },

    async 'later-revision-replaces-and-is-late'(subject) {
      const started = await startedDispatch(subject)
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'first delivery')
      succeeded(await lateAccount(subject, started, 'revised', REVISED), 'late revision')
      const account = (await started.record())?.account
      const expected = completed(started, REVISED, 'late')
      check(
        isDeepStrictEqual(account, expected),
        `after the late revision the account is ${show(account)}, expected ${show(expected)}`,
      )
    },

    async 'report-naming-subject-refused'(subject) {
      const started = await startedDispatch(subject)
      const named = await started.deliver([
        {
          kind: 'account',
          event: 'usage',
          // A provider that names the subject itself; the shape is what an untyped provider sends.
          value: Object.assign(
            { subject: { kind: 'model_call', id: started.access.call } },
            REPORT,
          ),
        },
      ])
      check('failure' in named, 'a report that names its subject was accepted')
      const record = await started.record()
      check(record?.account === null, `after the refused report the record is ${show(record)}`)
    },

    async 'unqualified-reader-refused'(subject) {
      const started = await startedDispatch(subject)
      succeeded(await started.deliver([accountFact('usage', REPORT)]), 'preserve of an account')
      const read = await subject.commands.dispatches({
        ...subject.outsider,
        call: started.access.call,
      })
      check(
        'failure' in read && read.failure.kind === 'denied',
        `a reader without qualification got ${show(read)}`,
      )
    },

    async 'messages-outlive-cleanup'(subject) {
      const expected = subject.admit.request.messages.map(message => message.id)
      check(expected.length > 0, 'the request of the admission holds no message to keep')
      const started = await startedDispatch(subject)
      succeeded(
        await started.deliver([
          ...textPart('0'),
          accountFact('usage', REPORT),
          { kind: 'ended', termination: COMPLETED },
        ]),
        'preserve of a completed reply',
      )
      await started.clean(await started.settle(COMPLETED))
      const record = await started.record()
      check(
        isDeepStrictEqual(record?.messages, expected),
        `after the cleanup the record holds the messages ${show(record?.messages)}, expected ${show(expected)}`,
      )
      check(
        isDeepStrictEqual(record?.account, completed(started, REPORT, 'received')),
        `after the cleanup the account is ${show(record?.account)}`,
      )
    },

    // The receipt of `startedDispatch` names no replay format, so the reply cannot form a message.
    async 'state-reply-without-replay-format-refused'(subject) {
      const started = await startedDispatch(subject)
      const refused = await started.deliver([
        ...stateReply(),
        accountFact('usage', REPORT),
        { kind: 'ended', termination: COMPLETED },
      ])
      const expected = {
        failure: { kind: 'invalid', field: 'termination', reason: 'replay-format-unknown' },
      }
      check(
        isDeepStrictEqual(refused, expected),
        `a reply with reasoning state and no replay format gave ${show(refused)}`,
      )
      const record = await started.record()
      check(
        record?.account === null && record.terminal === null,
        `after the refused batch the record is ${show(record)}`,
      )
    },
  }
}

function describe(error: unknown): string {
  if (error instanceof AccountsViolation) return error.message
  return error instanceof Error
    ? `the subject threw ${error.name}: ${error.message}`
    : `the subject threw ${String(error)}`
}

async function runOne<P>(
  options: CommandsAccountsOptions<P>,
  obligation: AccountObligation,
  body: Obligation<P>,
): Promise<AccountObligationResult> {
  let subject: CommandsAccountsSubject<P>
  try {
    subject = await options.subject()
  } catch (error) {
    return { obligation, status: 'fail', detail: `the subject factory failed: ${describe(error)}` }
  }
  let result: AccountObligationResult
  try {
    await body(subject)
    result = { obligation, status: 'pass' }
  } catch (error) {
    result = { obligation, status: 'fail', detail: describe(error) }
  }
  try {
    await subject.dispose?.()
  } catch (error) {
    const reason = `the dispose of the subject failed: ${describe(error)}`
    return {
      obligation,
      status: 'fail',
      detail: result.status === 'fail' ? `${result.detail}; also ${reason}` : reason,
    }
  }
  return result
}

/**
 * Checks the account obligations of a ModelCommands implementation through its public methods.
 * Each obligation runs on a fresh subject. A violation, a thrown error or a failed dispose is a
 * failure of that obligation; the suite reports and does not throw.
 */
export async function checkCommandsAccounts<P>(
  options: CommandsAccountsOptions<P>,
): Promise<CommandsAccountsReport> {
  const bodies = obligations<P>()
  const results: AccountObligationResult[] = []
  for (const obligation of ACCOUNT_OBLIGATIONS)
    results.push(await runOne(options, obligation, bodies[obligation]))
  return { ok: results.every(result => result.status === 'pass'), results }
}
