import { issuedFor } from '../acting.ts'
import type {
  AccessIdentity,
  InProcessAnswer,
  InProcessCall,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { JsonLimits } from '@omne-harness/json-text'
import type { Codec, OperationContract } from '@omne-harness/public-contract'
import type { Entered, Refusal } from '../registry/registry.ts'
import { settleCall, systemClock, type SettledAnswer } from '../settle/settle.ts'
import type { PipelineAccess, PipelineSettings } from './pipeline.ts'

type Limits = Pick<PipelineSettings, 'bodyLimits' | 'readLimits' | 'writeLimits'>

type Identified =
  | Readonly<{ kind: 'caller'; principal: LoginIdentity | Principal | undefined }>
  | Readonly<{ kind: 'refused' | 'unavailable' }>

const NOT_EXECUTED = (refusal: Refusal): InProcessAnswer => ({
  kind: 'not-executed',
  reason: refusal.refused,
})

const answered = (outcome: string, body?: unknown): InProcessAnswer => ({
  kind: 'answered',
  outcome,
  body,
})

async function identified(
  rule: OperationContract['identity'],
  port: AccessIdentity,
  call: InProcessCall,
): Promise<Identified> {
  if (rule === 'none') return { kind: 'caller', principal: undefined }
  try {
    const resumed = await port.resumeLogin(call.login, call.tenant)
    if (resumed.outcome !== 'identified') return failed(resumed.outcome)
    if (rule === 'login') return { kind: 'caller', principal: resumed.login }
    const acting = await port.actFor(resumed.login, call.tenant)
    if (acting.outcome !== 'issued') return failed(acting.outcome)
    issuedFor(acting.principal, call.tenant)
    return { kind: 'caller', principal: acting.principal }
  } catch {
    return { kind: 'unavailable' }
  }
}

const failed = (outcome: 'denied' | 'basis-unavailable'): Identified => ({
  kind: outcome === 'denied' ? 'refused' : 'unavailable',
})

function bodyOf(
  contract: OperationContract,
  body: unknown,
  limits: JsonLimits,
  revision: number,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    const wire = contract.body.write(body as never, limits, revision)
    return wire.ok ? contract.body.read(wire.value, limits, revision) : { ok: false }
  } catch {
    return { ok: false }
  }
}

function valueOf(
  contract: OperationContract,
  answer: SettledAnswer,
  limits: JsonLimits,
  revision: number,
): unknown {
  const codec = (contract.outcomes as Readonly<Record<string, true | Codec<unknown>>>)[
    answer.outcome
  ]
  if (codec === undefined || codec === true) return undefined
  const read = codec.read(answer.body, limits, revision)
  return read.ok ? read.value : undefined
}

/** Does an operation as a call from a client would be done, without the network: enter, identify, check the body, settle, leave. */
export function createInProcessCalls(
  access: PipelineAccess,
  settings: Limits,
): (call: InProcessCall) => Promise<InProcessAnswer> {
  const clock = access.clock ?? systemClock
  const actsFor = async (call: InProcessCall): Promise<boolean> =>
    (await identified('acting-tenant', access.identity, call)).kind === 'caller'
  const enter = async (call: InProcessCall): Promise<Entered | Refusal> => {
    const first = access.registry.enter(call.protocol, call.operation)
    if (!('refused' in first) || first.refused !== 'not-mounted') return first
    if (access.tenantScope === undefined || !(await actsFor(call))) return first
    const own = access.registry.enter(
      call.protocol,
      call.operation,
      access.tenantScope(call.tenant),
    )
    return 'refused' in own && own.refused === 'not-mounted' ? first : own
  }
  return async call => {
    const entered = await enter(call)
    if ('refused' in entered) return NOT_EXECUTED(entered)
    const { member, revision } = entered
    if (member.kind !== 'operation') {
      entered.leave()
      return { kind: 'not-executed', reason: 'not-offered' }
    }
    const { contract } = member
    const limits = settings.readLimits(settings.bodyLimits[contract.limit])
    const caller = await identified(contract.identity, access.identity, call)
    if (caller.kind !== 'caller') {
      entered.leave()
      return answered(caller.kind === 'refused' ? 'denied' : 'basis-unavailable')
    }
    const body = bodyOf(contract, call.body, limits, revision)
    if (!body.ok) {
      entered.leave()
      return answered('protocol-rejected')
    }
    const settled = await settleCall({
      entered,
      principal: caller.principal,
      messageId: call.id,
      revision,
      body: body.value,
      limits: settings.writeLimits,
      config: { graceMs: access.graceMs },
      clock,
      respond: () => undefined,
    })
    return answered(settled.outcome, valueOf(contract, settled, settings.writeLimits, revision))
  }
}
