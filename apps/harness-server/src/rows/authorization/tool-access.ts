import { noArguments, type AdmissionInput } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type {
  AccessVerdict,
  ToolAccessGuard,
  ToolAccountsGuard,
  ToolLedgerAction,
} from '@omne-harness/tool'
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
  'read-output': true,
  'release-delivery': true,
  account: true,
  recover: true,
  write: true,
  start: true,
  invalidate: false,
} satisfies Readonly<Record<Action, boolean>>

const MEMBER_READS: ReadonlySet<Action> = new Set([
  'lookup',
  'read-result',
  'read-output',
  'account',
  'read-diagnostics',
])

function qualifiedColumn(column: 'login' | 'work', action: Action): boolean {
  return column === 'work' || MEMBER_READS.has(action)
}

function qualificationRequest(input: Input): AdmissionInput | undefined {
  const { principal, tenant, call, action } = input
  const who = classify(principal)
  if (
    call === null ||
    typeof call !== 'string' ||
    call.length === 0 ||
    who === null ||
    who.column === 'system' ||
    !qualifiedColumn(who.column, action) ||
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

/** A member or the session work acting for the tenant may list the usage of its calls (tool/v1). */
export function createToolAccountsGuard(
  readAdmission: AdmissionReader,
): ToolAccountsGuard<unknown> {
  const qualify = async ({
    principal,
    tenant,
  }: Parameters<ToolAccountsGuard<unknown>['qualify']>[0]): Promise<AccessVerdict> => {
    try {
      const who = classify(principal)
      const text = tenantCodec.encode(tenant)
      if (
        who === null ||
        who.column === 'system' ||
        !text.ok ||
        !tenantEquals(who.principal.tenant, tenant)
      )
        return { kind: 'denied', reason: 'tenant-member-required' }
      const admission = readAdmission()
      if (admission === undefined)
        return { kind: 'unavailable', diagnostic: 'the tool access dependency is unavailable' }
      const answer = await admission.check({
        access: { principal: who.principal, tenant },
        operation: { owner: 'tool', name: 'list-accounts' },
        target: { owner: 'tool', kind: 'tenant', key: text.value },
        arguments: noArguments(),
        requires: [],
        permit: null,
      })
      if (answer.kind === 'allowed') return { kind: 'allowed' }
      if (answer.kind === 'denied') return { kind: 'denied', reason: answer.reason }
      return { kind: 'unavailable', diagnostic: 'the tool access dependency is unavailable' }
    } catch {
      return {
        kind: 'unavailable',
        diagnostic: 'the tool access request or dependency failed; exception text is not reported',
      }
    }
  }
  return Object.freeze({ qualify })
}
