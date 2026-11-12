// The pipeline of the new address `/api/<protocol>/v<major>/<name>`: steps 1 to 9 of RFC-0015 §5
// 判断次序, then `settleCall` for steps 10 to 14. It knows no domain and none of the three existing
// locations: the registry, the identity port and the grace come in as `access`, and the values of
// the deployment configuration come from `http.ts` as `PipelineSettings`.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccessIdentity, LoginIdentity } from '@omne-harness/access-cordis-contract'
import { readJsonBytes, type JsonLimits } from '@omne-harness/json-text'
import type { OperationContract } from '@omne-harness/public-contract'
import type { Entered, RegistryForPipeline } from '../registry/registry.ts'
import { settleCall, systemClock, type Clock } from '../settle/settle.ts'
import { parseAddress, pathOf, type Address } from './address.ts'
import { EMPTY_BODY, writeAnswer, writeBare } from './answer.ts'
import { readBody } from './body.ts'
import { contentTypeAccepted, countHeader, hostAccepted } from './headers.ts'
import { establish, type Established } from './identity-rule.ts'
import { watchCall, type CallWatch, type Interruption } from './watch.ts'

/** What turns the new address on. The three come together; without them `/api/...` answers 404. */
export type PipelineAccess = Readonly<{
  registry: RegistryForPipeline
  identity: AccessIdentity
  /** How long a handler may run after the abort before the entry answers for it (`SettleConfig`). */
  graceMs: number
  /** The clock of the grace. Absent: the system clock. */
  clock?: Clock
  /**
   * Receives one event at each error point of the pipeline. Separate from the entry's
   * `ServerEntryDiagnostic`, whose codes the assembly maps one by one. A sink that throws changes
   * no answer.
   */
  diagnostics?: (event: PipelineDiagnostic) => void
}>

/** The in-flight budget the new address shares with the three existing locations. */
export type RequestSlots = Readonly<{
  /** Takes a slot for this response, or `undefined` when the budget is full. Returns the release. */
  take: (res: ServerResponse) => (() => void) | undefined
}>

export type PipelineDiagnosticCode =
  | 'access.path-rejected'
  | 'access.method-rejected'
  | 'access.host-rejected'
  | 'access.content-type-rejected'
  | 'access.not-mounted'
  | 'access.observation-not-served'
  | 'access.busy'
  | 'access.message-id-rejected'
  | 'access.identity-denied'
  | 'access.identity-unavailable'
  | 'access.identity-fault'
  | 'access.body-over-limit'
  | 'access.body-rejected'
  | 'access.aborted'
  | 'access.caller-gone'
  | 'access.report-fault'

/**
 * One event at an error point of the pipeline: its code, the path, and the protocol and operation
 * when they are known. Never a header value, a body, an answer, a principal or an error text.
 */
export type PipelineDiagnostic = Readonly<{
  code: PipelineDiagnosticCode
  path: string
  protocol?: string
  major?: number
  operation?: string
}>

/** The values of the deployment configuration the pipeline needs, given by `http.ts`. */
export type PipelineSettings = Readonly<{
  /** The loopback address the `Host` header may name besides `localhost`. */
  loopback: string
  /** The two body limits by name; an operation's `limit` column picks one. */
  bodyLimits: Readonly<Record<OperationContract['limit'], number>>
  /** The strict-read budgets for a body limit. */
  readLimits: (maxBytes: number) => JsonLimits
  /** The budgets for writing an answer. */
  writeLimits: JsonLimits
  slots: RequestSlots
}>

export type Admission =
  | Readonly<{
      kind: 'refused'
      status: 404 | 405 | 415 | 421
      code: PipelineDiagnosticCode
      path: string
      address?: Address
    }>
  | Readonly<{ kind: 'entered'; address: Address; entered: Entered; contract: OperationContract }>

/**
 * Steps 1 to 5, one synchronous function: nothing between looking the protocol up and entering
 * the call can yield, so a take-down cannot split them (RFC-0015 §15「两条硬要求」).
 */
export function admit(
  req: IncomingMessage,
  registry: RegistryForPipeline,
  loopback: string,
): Admission {
  const target = req.url ?? ''
  const address = parseAddress(target)
  if (address === undefined)
    return { kind: 'refused', status: 404, code: 'access.path-rejected', path: pathOf(target) }
  const refused = (status: 404 | 405 | 415 | 421, code: PipelineDiagnosticCode): Admission => ({
    kind: 'refused',
    status,
    code,
    path: address.path,
    address,
  })
  if (req.method !== 'POST') return refused(405, 'access.method-rejected')
  if (!hostAccepted(req, loopback)) return refused(421, 'access.host-rejected')
  if (!contentTypeAccepted(req)) return refused(415, 'access.content-type-rejected')
  const entered = registry.enter({ name: address.protocol, major: address.major }, address.name)
  if (entered === undefined) return refused(404, 'access.not-mounted')
  if (entered.member.kind !== 'operation') {
    // Observations come with the observation hub; until then their address answers 404.
    entered.leave()
    return refused(404, 'access.observation-not-served')
  }
  return { kind: 'entered', address, entered, contract: entered.member.contract }
}

/** The event of one error point: the path, and the protocol and operation once the path names them. */
function eventOf(
  code: PipelineDiagnosticCode,
  path: string,
  address?: Address,
): PipelineDiagnostic {
  if (address === undefined) return { code, path }
  return { code, path, protocol: address.protocol, major: address.major, operation: address.name }
}

const MESSAGE_ID = /^[\x21-\x7e]{1,128}$/

/** Step 7: exactly one `Omne-Message-Id` of 1 to 128 visible ASCII characters. */
function messageIdOf(req: IncomingMessage): string | undefined {
  if (countHeader(req, 'omne-message-id') !== 1) return undefined
  const value = req.headers['omne-message-id']
  return typeof value === 'string' && MESSAGE_ID.test(value) ? value : undefined
}

type BodyOutcome =
  | Readonly<{ kind: 'read'; value: unknown }>
  | Readonly<{ kind: 'over' }>
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{ kind: 'interrupted'; by: Interruption }>

/** Step 9: the operation's limit, the strict read, then the contract's codec. */
async function readOperationBody(
  req: IncomingMessage,
  contract: OperationContract,
  settings: PipelineSettings,
  watch: CallWatch,
): Promise<BodyOutcome> {
  const maxBytes = settings.bodyLimits[contract.limit]
  const read = await readBody(req, maxBytes, watch.halt)
  if (read.kind === 'over') return { kind: 'over' }
  if (read.kind === 'aborted') return { kind: 'interrupted', by: 'gone' }
  if (read.kind === 'stopped') return { kind: 'interrupted', by: watch.interruption() ?? 'gone' }
  const limits = settings.readLimits(maxBytes)
  const json = readJsonBytes(read.bytes, limits)
  if (json.kind !== 'ok') return { kind: 'rejected' }
  const decoded = contract.body.read(json.value, limits)
  return decoded.ok ? { kind: 'read', value: decoded.value } : { kind: 'rejected' }
}

export type Pipeline = Readonly<{
  /** Answers one request whose path is none of the three existing locations. */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}>

export function createPipeline(access: PipelineAccess, settings: PipelineSettings): Pipeline {
  const clock = access.clock ?? systemClock
  const diagnose = (event: PipelineDiagnostic): void => {
    try {
      access.diagnostics?.(event)
    } catch {
      // The sink is the host's; its failure is not the pipeline's to report.
    }
  }

  /** Steps 7 to 14 of one entered call. `leave` is called exactly once on every path. */
  async function serve(
    req: IncomingMessage,
    res: ServerResponse,
    admitted: Extract<Admission, { kind: 'entered' }>,
  ): Promise<void> {
    const { address, entered, contract } = admitted
    const note = (code: PipelineDiagnosticCode): void =>
      diagnose(eventOf(code, address.path, address))
    const messageId = messageIdOf(req)
    if (messageId === undefined) {
      note('access.message-id-rejected')
      writeAnswer(res, { outcome: 'protocol-rejected', body: EMPTY_BODY, close: true })
      entered.leave()
      return
    }
    // Before the body is read in full, an answer closes the connection: otherwise Node would read
    // the rest of the body off the wire to reuse it (#1233 spec 已定 11).
    // Each answer is written before `leave`, so a take-down completes after every answer is out.
    const early = (outcome: 'denied' | 'basis-unavailable' | 'protocol-rejected'): void => {
      writeAnswer(res, { outcome, body: EMPTY_BODY, messageId, close: true })
      entered.leave()
    }
    // An aborted call answers; a call whose caller has gone has nobody to answer.
    const interrupted = (by: Interruption): void => {
      if (by === 'aborted') {
        note('access.aborted')
        early('basis-unavailable')
        return
      }
      note('access.caller-gone')
      entered.leave()
    }

    /** Step 8 did not establish the caller. */
    const unestablished = (failure: Exclude<Established, { kind: 'caller' }>): void => {
      switch (failure.kind) {
        case 'interrupted':
          return interrupted(failure.by)
        case 'refused':
          note('access.identity-denied')
          return early('denied')
        case 'unavailable':
          note(failure.thrown ? 'access.identity-fault' : 'access.identity-unavailable')
          return early('basis-unavailable')
      }
    }
    /** Step 9 did not read a body. */
    const unread = (failure: Exclude<BodyOutcome, { kind: 'read' }>): void => {
      switch (failure.kind) {
        case 'interrupted':
          return interrupted(failure.by)
        case 'over':
          note('access.body-over-limit')
          return early('protocol-rejected')
        case 'rejected':
          // The body was read in full, so the connection stays open.
          note('access.body-rejected')
          writeAnswer(res, {
            outcome: 'protocol-rejected',
            body: EMPTY_BODY,
            messageId,
            close: false,
          })
          entered.leave()
      }
    }

    const watch = watchCall(entered.signal, res)
    let caller: Extract<Established, { kind: 'caller' }>
    let body: unknown
    try {
      const established = await establish(contract.identity, req, access.identity, watch)
      if (established.kind !== 'caller') return unestablished(established)
      caller = established
      const read = await readOperationBody(req, contract, settings, watch)
      if (read.kind !== 'read') return unread(read)
      body = read.value
    } finally {
      watch.release()
    }

    const { login } = caller
    await settleCall({
      entered,
      principal: caller.principal,
      messageId,
      body,
      limits: settings.writeLimits,
      config: { graceMs: access.graceMs },
      clock,
      respond: answer => writeAnswer(res, { ...answer, messageId, close: false }),
      ...(login === undefined ? {} : { reportAccess: () => report(login, note) }),
    })
  }

  /** Step 14's report: not awaited, and a failure of it is one diagnostic, never a changed answer. */
  function report(login: LoginIdentity, note: (code: PipelineDiagnosticCode) => void): void {
    let pending: Promise<void>
    try {
      pending = access.identity.reportAccess(login)
    } catch {
      note('access.report-fault')
      return
    }
    Promise.resolve(pending).catch(() => note('access.report-fault'))
  }

  return {
    async handle(req, res) {
      const admission = admit(req, access.registry, settings.loopback)
      if (admission.kind === 'refused') {
        diagnose(eventOf(admission.code, admission.path, admission.address))
        writeBare(res, admission.status, admission.status === 405 ? { allow: 'POST' } : {})
        return
      }
      const release = settings.slots.take(res)
      if (release === undefined) {
        diagnose(eventOf('access.busy', admission.address.path, admission.address))
        writeBare(res, 429, { 'x-omne-limit': 'in-flight-requests' })
        admission.entered.leave()
        return
      }
      try {
        await serve(req, res, admission)
      } catch (fault) {
        // Every path of `serve` leaves itself; a fault in it must not keep a take-down waiting.
        admission.entered.leave()
        throw fault
      } finally {
        release()
      }
    },
  }
}
