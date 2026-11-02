import { noArguments, type AdmissionInput } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type { AccessVerdict, ToolAccessGuard, ToolLedgerAction } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from '@omne-harness/tool-host-local'
import type { AdmissionReader } from './action-admission.ts'
import { classify } from './principals.ts'

type Action = ToolLedgerAction | 'start' | 'invalidate'
type Input = Omit<Parameters<StartCoordinatorAccess<unknown>['qualify']>[0], 'action'> &
  Readonly<{ action: Action }>
const ACTIONS = {
  admit: true,
  lookup: true,
  'query-operation': true,
  control: true,
  'accept-decision': true,
  'accept-resource': true,
  'read-process': true,
  'read-wait': true,
  'read-diagnostics': true,
  'read-result': true,
  'read-content': true,
  'read-raw': false,
  'read-raw-content': false,
  'release-delivery': true,
  account: true,
  recover: true,
  write: true,
  start: true,
  invalidate: false,
} satisfies Readonly<Record<Action, boolean>>

function qualificationRequest(input: Input): AdmissionInput | undefined {
  const { principal, tenant, call, action } = input
  const who = classify(principal)
  if (
    call === null ||
    typeof call !== 'string' ||
    call.length === 0 ||
    who?.column !== 'work' ||
    !tenantCodec.encode(tenant).ok ||
    !tenantEquals(who.principal.tenant, tenant)
  )
    return undefined
  return {
    access: { principal: who.principal, tenant },
    operation: { owner: 'tool', name: action },
    target: { owner: 'tool', kind: 'call', key: call },
    arguments: noArguments(),
    requires: [],
    permit: null,
  }
}

/** The consuming row returns undefined after retirement and reads its current ports each time. */
export function createToolAccessGuard(readAdmission: AdmissionReader) {
  const qualify = async (input: Input): Promise<AccessVerdict> => {
    try {
      const { principal, tenant, call, action } = input
      if (!Object.hasOwn(ACTIONS, action)) return { kind: 'denied', reason: 'unknown-tool-action' }
      if (!ACTIONS[action])
        return {
          kind: 'unavailable',
          diagnostic: 'this tool action has no supported qualification source',
        }
      const request = qualificationRequest({ principal, tenant, call, action })
      if (request === undefined) return { kind: 'denied', reason: 'session-work-and-call-required' }
      const admission = readAdmission()
      if (admission === undefined)
        return { kind: 'unavailable', diagnostic: 'the tool access dependency is unavailable' }
      const answer = await admission.check(request)
      switch (answer.kind) {
        case 'allowed':
          return { kind: 'allowed' }
        case 'denied':
          return { kind: 'denied', reason: answer.reason }
        default:
          return { kind: 'unavailable', diagnostic: 'the tool access dependency is unavailable' }
      }
    } catch {
      return {
        kind: 'unavailable',
        diagnostic: 'the tool access request or dependency failed; exception text is not reported',
      }
    }
  }
  return Object.freeze({ qualify }) satisfies ToolAccessGuard<unknown> &
    StartCoordinatorAccess<unknown>
}
