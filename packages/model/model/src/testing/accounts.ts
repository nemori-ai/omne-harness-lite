// The accounts conformance suite of ModelCommands: drives an implementation through its public
// methods only and reports, for each account obligation of the Model contract, whether it is kept.
// The in-memory ModelCommands runs it now; a durable provider runs the same suite later.
import { randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  type Access,
  type Admit,
  type CallAccess,
  type CallAccountReport,
  type DispatchId,
  type DispatchRecord,
  type DurableEvidence,
  type ModelCallId,
  type ModelCommands,
  type ModelInstanceId,
  type ModelOperationId,
  type TransportFact,
  type WriteContext,
} from '@omne-harness/model-contract'

/** What the party that assembled the ModelCommands gives the suite. */
export type CommandsAccountsSubject<P> = Readonly<{
  commands: ModelCommands<P>
  /** An admission the commands accept. The suite gives each call its own `call` and `operation`. */
  admit: Admit<P>
  /** The instance that claims each call; the commands must accept its execution channel. */
  instance: ModelInstanceId
  /** Continuity evidence the commands accept for claiming `call`. */
  continuity(call: ModelCallId): DurableEvidence
  /** A trusted supplier receipt the commands accept for a late fact of this dispatch. */
  lateSource(input: Readonly<{ call: ModelCallId; dispatch: DispatchId }>): DurableEvidence
  /** A caller of the admission's tenant without the qualification to read dispatch facts. */
  outsider: Access<P>
  /** Releases what the subject holds. */
  dispose?(): Promise<void>
}>

export type CommandsAccountsOptions<P> = Readonly<{
  /** Makes a fresh subject. The suite makes one per obligation. */
  subject(): CommandsAccountsSubject<P> | Promise<CommandsAccountsSubject<P>>
}>

export type AccountObligation =
  | 'account-completed-with-subject-and-receipt'
  | 'account-read-by-original-call'
  | 'same-event-registered-once'
  | 'same-event-other-report-refused'
  | 'later-revision-replaces-and-is-late'
  | 'report-naming-subject-refused'
  | 'unqualified-reader-refused'

/** Every obligation, in the order the suite checks them. */
export const ACCOUNT_OBLIGATIONS: readonly AccountObligation[] = [
  'account-completed-with-subject-and-receipt',
  'account-read-by-original-call',
  'same-event-registered-once',
  'same-event-other-report-refused',
  'later-revision-replaces-and-is-late',
  'report-naming-subject-refused',
  'unqualified-reader-refused',
]

export type AccountObligationResult = Readonly<{
  obligation: AccountObligation
  status: 'pass' | 'fail'
  /** Empty when the obligation passed; otherwise what the suite saw. */
  detail: string
}>

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
}>

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
    result = { obligation, status: 'pass', detail: '' }
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
