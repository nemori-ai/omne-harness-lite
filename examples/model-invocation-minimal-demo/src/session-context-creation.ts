import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs, instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import type {
  ContextRegistration,
  ContextValue,
  ContextSessionSeed,
  ContextSessionInitializer,
} from '@omne-harness-lite/runtime-context'
import type { SessionScope, SessionTenancyService } from '@omne-harness-lite/session-tenancy'

export const sessionRegistration: ContextRegistration = Object.freeze({
  key: 'session',
  source: 'demo-session',
  config: null,
  consumers: Object.freeze(['model', 'tool', 'extension'] as const),
  required: true,
  recovery: 'persisted',
})

export function sessionIdentityValue(scope: SessionScope, clock: Clock): ContextValue | undefined {
  try {
    const instant = clock.now()
    if (instant === 'unavailable') return undefined
    const parsed = instantFromEpochMs(instant)
    if (!('ok' in parsed)) return undefined
    const observedAt = instantToRfc3339(parsed.ok)
    return Object.freeze({
      key: 'session',
      revision: 'initial',
      observedAt,
      value: Object.freeze({ tenant: Object.freeze({ ...scope.tenant }), session: scope.session }),
    })
  } catch {
    return undefined
  }
}

type Result =
  | { readonly kind: 'prepared' }
  | { readonly kind: 'rejected'; readonly reason: 'notAuthorized' | 'unavailable' | 'ownerStopped' }
const unavailable: Result = { kind: 'rejected', reason: 'unavailable' }
const prepared: Result = { kind: 'prepared' }

/** Application-private creation authority. An existing SQL row never grants initialization. */
export function createSessionContextCreator(deps: {
  readonly initializer: ContextSessionInitializer
  readonly tenancy: SessionTenancyService
  readonly clock: Clock
  /** The result must be the confirmed outcome of the transaction that inserts the row. */
  readonly createRow: (scope: SessionScope) => Promise<'created' | 'alreadyPresent'>
}) {
  const initializer = deps.initializer
  const records = new Map<
    string,
    {
      readonly seed: ContextSessionSeed
      status: 'uncertain' | 'created'
    }
  >()
  const jobs = new Map<string, Promise<Result>>()
  let active = true

  async function create(scope: SessionScope, key: string): Promise<Result> {
    let record = records.get(key)
    if (!record) {
      const held = await deps.tenancy.holdingTenant(scope.session)
      if ('tenant' in held)
        return tenantIdEquals(held.tenant, scope.tenant)
          ? prepared
          : { kind: 'rejected', reason: 'notAuthorized' }
      if (held.failure !== 'sessionNotFound') return unavailable
      const initial = sessionIdentityValue(scope, deps.clock)
      if (!initial) return unavailable
      record = {
        status: 'uncertain',
        seed: Object.freeze({
          required: Object.freeze([sessionRegistration]),
          initial: Object.freeze([initial]),
          fixed: Object.freeze([Object.freeze({ key: 'session', value: initial.value })]),
        }),
      }
      records.set(key, record)
      // A prior notFound is insufficient. The transaction must confirm that THIS call inserted.
      const created = await deps.createRow(scope)
      if (created === 'alreadyPresent') {
        records.delete(key)
        return prepared
      }
      record.status = 'created'
    }
    if (record.status === 'uncertain') return unavailable
    const result = await initializer.initializeContextSession(scope, record.seed)
    if (result.kind !== 'applied') return unavailable
    records.delete(key)
    return prepared
  }

  return Object.freeze({
    prepare(input: SessionScope): Promise<Result> {
      if (!active) return Promise.resolve({ kind: 'rejected', reason: 'ownerStopped' })
      const scope = Object.freeze({
        tenant: Object.freeze({ ...input.tenant }),
        session: input.session,
      })
      const key = writeJsonLossless(scope)
      const existing = jobs.get(key)
      if (existing) return existing
      const job = Promise.resolve()
        .then(() => create(scope, key))
        .catch(() => unavailable)
      jobs.set(key, job)
      void job.then(() => {
        if (jobs.get(key) === job) jobs.delete(key)
      })
      return job
    },
    closeAdmission() {
      active = false
    },
    async drain() {
      active = false
      await Promise.allSettled([...jobs.values()])
      if ([...records.values()].some(record => record.status === 'uncertain'))
        throw new Error('session creation transaction was not confirmed')
      // Created-row initialization receipts remain owned by the common context owner.
      records.clear()
    },
  })
}
