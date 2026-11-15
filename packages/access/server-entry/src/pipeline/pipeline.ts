import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccessIdentity, LoginIdentity } from '@omne-harness/access-cordis-contract'
import { readJsonBytes, type JsonLimits } from '@omne-harness/json-text'
import type { Codec, OperationContract } from '@omne-harness/public-contract'
import {
  createObservationHub,
  type HubDiagnosticCode,
  type ObservationHub,
} from '../observation-hub/hub.ts'
import type { LoginCheck } from '../observation-hub/records.ts'
import type { AccessRegistry, Entered, RegistryForPipeline } from '../registry/registry.ts'
import { settleCall, systemClock, type Clock } from '../settle/settle.ts'
import { parseAddress, pathOf, type Address } from './address.ts'
import { EMPTY_BODY, writeAnswer, writeBare } from './answer.ts'
import { readBody } from './body.ts'
import { contentTypeAccepted, countHeader, hostAccepted } from './headers.ts'
import { establish, type Established, type SignedIn } from './identity-rule.ts'
import { watchCall, type CallWatch, type Interruption } from './watch.ts'

export type PipelineAccess = Readonly<{
  registry: AccessRegistry
  identity: AccessIdentity
  graceMs: number
  frameQueueBytes: number
  availabilityBacklog: number
  clock?: Clock
  diagnostics?: (event: PipelineDiagnostic) => void
}>

export type RequestSlots = Readonly<{
  take: (res: ServerResponse) => (() => void) | undefined
}>

export type PipelineDiagnosticCode =
  | 'access.path-rejected'
  | 'access.method-rejected'
  | 'access.host-rejected'
  | 'access.content-type-rejected'
  | 'access.not-mounted'
  | 'access.busy'
  | 'access.message-id-rejected'
  | 'access.identity-denied'
  | 'access.identity-unavailable'
  | 'access.identity-fault'
  | 'access.body-over-limit'
  | 'access.body-rejected'
  | 'access.aborted'
  | 'access.caller-gone'
  | 'access.listener-fault'
  | 'access.report-fault'
  | HubDiagnosticCode

export type PipelineDiagnostic = Readonly<{
  code: PipelineDiagnosticCode
  path?: string
  protocol?: string
  major?: number
  operation?: string
}>

export type PipelineSettings = Readonly<{
  loopback: string
  bodyLimits: Readonly<Record<OperationContract['limit'], number>>
  readLimits: (maxBytes: number) => JsonLimits
  writeLimits: JsonLimits
  slots: RequestSlots
  observations: Readonly<{ perLogin: number; perInstance: number }>
  heartbeatMs: number
}>

export type Admission =
  | Readonly<{
      kind: 'refused'
      status: 404 | 405 | 415 | 421
      code: PipelineDiagnosticCode
      path: string
      address?: Address
    }>
  | Readonly<{ kind: 'entered'; address: Address; entered: Entered }>

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
  return { kind: 'entered', address, entered }
}

function eventOf(
  code: PipelineDiagnosticCode,
  path: string,
  address?: Address,
): PipelineDiagnostic {
  if (address === undefined) return { code, path }
  return { code, path, protocol: address.protocol, major: address.major, operation: address.name }
}

const MESSAGE_ID = /^[\x21-\x7e]{1,128}$/

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

type BodyRule = Readonly<{ limit: OperationContract['limit']; codec: Codec<unknown> }>

function bodyRuleOf(member: Entered['member']): BodyRule {
  return member.kind === 'operation'
    ? { limit: member.contract.limit, codec: member.contract.body }
    : { limit: member.contract.limit ?? 'small', codec: member.contract.open }
}

async function readBodyOf(
  req: IncomingMessage,
  rule: BodyRule,
  settings: PipelineSettings,
  watch: CallWatch,
): Promise<BodyOutcome> {
  const maxBytes = settings.bodyLimits[rule.limit]
  const read = await readBody(req, maxBytes, watch.halt)
  if (read.kind === 'over') return { kind: 'over' }
  if (read.kind === 'aborted') return { kind: 'interrupted', by: 'gone' }
  if (read.kind === 'stopped') return { kind: 'interrupted', by: watch.interruption() ?? 'gone' }
  const limits = settings.readLimits(maxBytes)
  const json = readJsonBytes(read.bytes, limits)
  if (json.kind !== 'ok') return { kind: 'rejected' }
  const decoded = rule.codec.read(json.value, limits)
  return decoded.ok ? { kind: 'read', value: decoded.value } : { kind: 'rejected' }
}

export type Pipeline = Readonly<{
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  endObservations: () => Promise<void>
}>

export function createPipeline(access: PipelineAccess, settings: PipelineSettings): Pipeline {
  const clock = access.clock ?? systemClock
  let unrecognised = 0
  const observationKey = (address: Address, messageId: string, login?: SignedIn): string =>
    login === undefined
      ? `unrecognised:${(unrecognised += 1)}`
      : [login.proof, address.path, messageId].join('\n')
  const hub: ObservationHub = createObservationHub({
    limits: settings.observations,
    heartbeatMs: settings.heartbeatMs,
    loginCheckIntervalMs: settings.heartbeatMs,
    frameQueueBytes: access.frameQueueBytes,
    graceMs: access.graceMs,
    clock,
    writeLimits: settings.writeLimits,
  })
  const diagnose = (event: PipelineDiagnostic): void => {
    try {
      access.diagnostics?.(event)
    } catch {}
  }

  async function serve(
    req: IncomingMessage,
    res: ServerResponse,
    admitted: Extract<Admission, { kind: 'entered' }>,
  ): Promise<void> {
    const { address, entered } = admitted
    const { member } = entered
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
    // the rest of the body off the wire to reuse it.
    const early = (outcome: 'denied' | 'basis-unavailable' | 'protocol-rejected'): void => {
      writeAnswer(res, { outcome, body: EMPTY_BODY, messageId, close: true })
      entered.leave()
    }
    const interrupted = (by: Interruption): void => {
      if (by === 'aborted') {
        note('access.aborted')
        early('basis-unavailable')
        return
      }
      note('access.caller-gone')
      entered.leave()
    }

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
    const unread = (failure: Exclude<BodyOutcome, { kind: 'read' }>): void => {
      switch (failure.kind) {
        case 'interrupted':
          return interrupted(failure.by)
        case 'over':
          note('access.body-over-limit')
          return early('protocol-rejected')
        case 'rejected':
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
      const established = await establish(member.contract.identity, req, access.identity, watch)
      if (established.kind !== 'caller') return unestablished(established)
      caller = established
      const read = await readBodyOf(req, bodyRuleOf(member), settings, watch)
      if (read.kind !== 'read') return unread(read)
      body = read.value
    } finally {
      watch.release()
    }

    const { login } = caller
    if (member.kind === 'observation') {
      await hub.open({
        entered,
        contract: member.contract,
        source: member.source,
        principal: caller.principal,
        messageId,
        open: body,
        key: observationKey(address, messageId, login),
        ...(login === undefined
          ? {}
          : { loginKey: login.proof, checkLogin: () => checkLogin(login) }),
        ...(login === undefined || member.contract.countsAsAccess !== true
          ? {}
          : { reportAccess: () => report(login.identity, note) }),
        note,
        res,
      })
      return
    }
    await settleCall({
      entered,
      principal: caller.principal,
      messageId,
      body,
      limits: settings.writeLimits,
      config: { graceMs: access.graceMs },
      clock,
      respond: answer => writeAnswer(res, { ...answer, messageId, close: false }),
      ...(login === undefined ? {} : { reportAccess: () => report(login.identity, note) }),
    })
  }

  async function checkLogin(login: SignedIn): Promise<LoginCheck> {
    const result = await access.identity.identifyLogin(login.proof)
    if (result.outcome === 'identified') return 'valid'
    return result.outcome === 'denied' ? 'denied' : 'unavailable'
  }

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
    endObservations: () => hub.endAll(),
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
        admission.entered.leave()
        throw fault
      } finally {
        release()
      }
    },
  }
}
