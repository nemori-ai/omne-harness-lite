// The login confirmation of `startRun` (assembly page「桥接责任」, the login gate; session-adapters
// SPEC AD-10: "startRun 的命令不带首条输入 … 所以登录确认由 sessionAdoptionSource 准备").
//
// The command carries no first input, so this source reads it: the Session work snapshot with the
// Access of the original call, `judgeRunStart` for the first input the decision will take, then that
// input's `origin`. The server entry writes the origin of an ordinary input as the login-entry
// evidence when it accepts the input after a recognized login (handoff「普通输入的来源与登录门」);
// the recognition at acceptance is the evidence of the gate. An origin with another owner gives no
// confirmation, so Session answers `login-required`. Nothing here signs, widens or defaults: a read
// that fails is handed back, and the confirmation names only facts the log already holds.
//
// Only an interactive start asks for the gate (session-contract `decide`, ruling R2), so only an
// interactive start reads the Session. A dispatch start gets no confirmation and needs none.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  deriveSessionOperation,
  judgeRunStart,
  type AdoptionEvidenceCommand,
  type GuardCommand,
  type InputId,
  type RoutedInput,
  type SessionAccess,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'

/** The owner that `decide` looks for (session-contract `LOGIN_ENTRY_OWNER`). */
export const LOGIN_ENTRY_OWNER = 'login-entry'

/** The protocol of the confirmation material. It names the shape of `facts`, not an authority. */
export const LOGIN_ENTRY_PROTOCOL = Object.freeze({
  owner: '@omne-harness/harness-server',
  name: 'login-entry-confirmation',
  revision: '1',
  digest: 'harness-server:login-entry-confirmation/1',
})

/** The owner named when the Session read face cannot be had. */
export const LOGIN_SOURCE_OWNER = 'sessionAdoptionSource'

type StartRun = Extract<AdoptionEvidenceCommand, { kind: 'startRun' }>
type Answer = Outcome<GuardCommand | null, SessionFailure>

/** The two Session reads this source needs, taken per call. `undefined` means the face is absent. */
export type SessionWorkReads<P> = Readonly<{
  readWork(access: SessionAccess<P>): Promise<Outcome<WorkSnapshot, SessionFailure>>
  readInput(
    input: SessionAccess<P> & Readonly<{ input: InputId }>,
  ): Promise<Outcome<Extract<RoutedInput, { kind: 'ordinary' }>, SessionFailure>>
}>

const unavailable = (diagnostic: string): Answer =>
  fail({ kind: 'unavailable', owner: LOGIN_SOURCE_OWNER, diagnostic })

/**
 * The login confirmation of one `startRun`, or `null` when there is none to give: the start is not
 * interactive, no first input is eligible (the decision refuses before the gate), or the first input
 * was not accepted through a login. A failed read is the failure, never a missing confirmation.
 */
export async function loginConfirmationOf<P>(
  reads: SessionWorkReads<P> | undefined,
  command: StartRun,
  access: SessionAccess<P> | undefined,
): Promise<Answer> {
  if (command.input.entry !== 'interactive') return succeed(null)
  if (access === undefined)
    return unavailable('the start reached the adoption source without its access')
  if (access.session !== command.input.session) return fail({ kind: 'denied', action: 'startRun' })
  if (reads === undefined)
    return unavailable('the Session read face is absent; the first input cannot be read')
  const work = await reads.readWork(access)
  if ('failure' in work) return work
  const judgment = judgeRunStart(work.ok, command.input.entry)
  if (judgment.kind !== 'eligible') return succeed(null)
  // The start names its first input only through its operation identity (session-contract OP-00:
  // session, first input, predecessor). A start formed for another first input than the one read
  // here gets no confirmation, so a confirmation never vouches for an input the start did not name.
  const operation = deriveSessionOperation({
    kind: 'startRun',
    session: command.input.session,
    first: judgment.first,
    predecessor: work.ok.run.kind === 'terminal' ? work.ok.run.terminal.run : null,
  })
  if (operation !== command.input.operation) return succeed(null)
  const first = await reads.readInput({ ...access, input: judgment.first })
  if ('failure' in first) return first
  const origin = first.ok.origin
  if (origin.owner !== LOGIN_ENTRY_OWNER) return succeed(null)
  return succeed({
    owner: LOGIN_ENTRY_OWNER,
    participant: 'session-evidence',
    protocol: LOGIN_ENTRY_PROTOCOL,
    // The origin's record is the login state text; it stays in the log and is not copied here.
    facts: {
      kind: 'object',
      entries: [
        { key: 'version', value: { kind: 'number', lexeme: '1' } },
        { key: 'session', value: { kind: 'string', value: command.input.session } },
        { key: 'input', value: { kind: 'string', value: judgment.first } },
        { key: 'operation', value: { kind: 'string', value: operation } },
        { key: 'origin', value: { kind: 'string', value: origin.digest } },
      ],
    },
  })
}
