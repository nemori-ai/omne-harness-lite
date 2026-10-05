import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { EntryServices } from '../service-faces.ts'
import type { RequestRecord } from './record-shapes.ts'
import { readJsonText } from '../json.ts'
import { RECEIVE_LIMITS } from '../ops/limits.ts'
import { entryAnswerBytes, routeFailureBytes, routeSuccessBytes } from './answers.ts'
import { accountCorrelation, tenantCorrelation } from './record.ts'
import { conformsTo } from './schema.ts'
import { project } from './route-wire.ts'
import { createDecisionPolicy } from './decision-policy.ts'

export interface DecisionContext {
  readonly storage: AtomicStorage
  readonly services: EntryServices
  readonly publicHealth: Buffer
}
export interface Decision {
  readonly bytes: Buffer | undefined
  readonly record: RequestRecord
}
const JSON_LIMITS = { depth: RECEIVE_LIMITS.jsonDepth, members: RECEIVE_LIMITS.objectMembers }
const policy = createDecisionPolicy(
  {
    entry: entryAnswerBytes,
    failure: routeFailureBytes,
    project,
    conforms: conformsTo,
    success: routeSuccessBytes,
  },
  { account: accountCorrelation, tenant: tenantCorrelation },
)

export async function decide(body: Buffer, context: DecisionContext): Promise<Decision> {
  const reading = readJsonText(body, JSON_LIMITS)
  const result = await policy.decide(reading, {
    get services() {
      return context.services
    },
    get publicHealth() {
      return context.publicHealth
    },
    boundary: {
      run: work =>
        context.storage.atomic(async unit => {
          const services = {
            accounts: context.services.accounts.participate(unit),
            logins: context.services.logins.participate(unit),
            organizations: context.services.organizations.participate(unit),
            memberships: context.services.memberships.participate(unit),
            offers: context.services.offers.participate(unit),
          }
          return work(services)
        }),
    },
  })
  return { bytes: result.reply, record: result.record }
}
