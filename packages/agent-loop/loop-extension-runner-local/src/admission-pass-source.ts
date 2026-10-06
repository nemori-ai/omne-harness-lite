import { randomUUID } from 'node:crypto'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import type { OfficialAdmissionLease } from '@omne-harness-lite/loop-extension-runner'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type {
  AdmissionInput,
  AdmissionPassRecord,
  ToolAdmissionPassSourceOperations,
} from '@omne-harness-lite/tool-admission'

const rejected = (reason: 'invalidInput' | 'notAuthorized' | 'passUnavailable' | 'unavailable') =>
  ({ kind: 'rejected', reason }) as const

function ownScope(value: unknown): SessionScope | undefined {
  const copied = copyJsonValue(value)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok)
  )
    return undefined
  const scope = copied.ok as Record<string, unknown>
  if (
    Object.keys(scope).length !== 2 ||
    !Object.hasOwn(scope, 'tenant') ||
    !Object.hasOwn(scope, 'session')
  )
    return undefined
  const tenant = parseTenantId(scope.tenant)
  const session = parseOpaqueIdentifier(scope.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session
    ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
    : undefined
}

interface CapturedPass {
  readonly access: SessionAccess
  readonly scope: SessionScope
  readonly record: AdmissionPassRecord
}

/** Runner-private writer. Only the read side is published as a service. */
export function createAdmissionPassSource(dependencies: {
  readonly access: SessionAccessOperations
  readonly isActive: () => boolean
}) {
  const authorize = dependencies.access.authorize.bind(dependencies.access)
  const ownerActive = dependencies.isActive
  const passes = new Map<string, CapturedPass>()
  const reads = new Set<Promise<unknown>>()
  let admitting = true
  const active = () => {
    try {
      return admitting && ownerActive()
    } catch {
      return false
    }
  }
  const source = Object.freeze<ToolAdmissionPassSourceOperations>({
    read(access, suppliedScope, pass) {
      if (!active()) return Promise.resolve(rejected('unavailable'))
      const scope = ownScope(suppliedScope)
      if (!scope || !('ok' in parseOpaqueIdentifier(pass, 'AdmissionPass')))
        return Promise.resolve(rejected('invalidInput'))
      const work = Promise.resolve().then(async () => {
        try {
          if (!active()) return rejected('unavailable')
          // Authorization precedes looking up the pass, including the absent case.
          const authorized = await authorize(access, scope, 'run.advance')
          if (!active()) return rejected('unavailable')
          if (authorized.kind === 'rejected')
            return rejected(
              authorized.reason === 'ownerStopped' ? 'unavailable' : authorized.reason,
            )
          const captured = passes.get(pass)
          if (captured === undefined) return rejected('passUnavailable')
          if (
            captured.access !== access ||
            captured.scope.session !== scope.session ||
            !tenantIdEquals(captured.scope.tenant, scope.tenant)
          )
            return rejected('notAuthorized')
          if (!captured.record.isActive()) return rejected('passUnavailable')
          return { kind: 'found', record: captured.record } as const
        } catch {
          return rejected('unavailable')
        }
      })
      reads.add(work)
      void work.then(
        () => reads.delete(work),
        () => reads.delete(work),
      )
      return work
    },
  })
  return Object.freeze({
    source,
    /** The dispatcher calls this only after it validates origins and preceding rewrites. */
    open(input: {
      readonly access: SessionAccess
      readonly scope: SessionScope
      readonly inputs: readonly [AdmissionInput, ...AdmissionInput[]]
      readonly finalKeys: readonly [string, ...string[]]
      readonly hostIsActive: () => boolean
      readonly contribution: OfficialAdmissionLease
    }) {
      if (!active()) throw new Error('Admission pass source is closed')
      const scope = ownScope(input.scope)
      if (!scope || input.inputs.length === 0 || input.finalKeys.length !== input.inputs.length)
        throw new TypeError('Invalid private admission pass')
      // The runner already validates these inputs. Copy data here to fix its value for the round.
      // Grants are opaque live objects and deliberately retain identity.
      const inputs = input.inputs.map(({ grants, ...data }) => {
        const copied = copyJsonValue(data)
        if ('failed' in copied) throw new TypeError('Invalid private admission data')
        return Object.freeze({ ...(copied.ok as object), grants }) as AdmissionInput
      }) as [AdmissionInput, ...AdmissionInput[]]
      const finalKeys = Object.freeze([...input.finalKeys]) as readonly [string, ...string[]]
      const hostIsActive = input.hostIsActive
      const contributionIsActive = input.contribution.isActive.bind(input.contribution)
      const pass = `admission-pass:${randomUUID()}`
      const record: AdmissionPassRecord = Object.freeze({
        inputs: Object.freeze(inputs),
        finalKeys,
        isActive() {
          try {
            return (
              active() &&
              passes.get(pass)?.record === record &&
              hostIsActive() &&
              contributionIsActive()
            )
          } catch {
            return false
          }
        },
      })
      passes.set(pass, Object.freeze({ access: input.access, scope, record }))
      return Object.freeze({
        pass,
        close() {
          if (passes.get(pass)?.record === record) passes.delete(pass)
        },
      })
    },
    closeAdmission() {
      admitting = false
      passes.clear()
    },
    async drain() {
      while (reads.size !== 0) await Promise.allSettled([...reads])
    },
  })
}
