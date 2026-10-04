import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type {
  AdmissionInput,
  AdmissionJudgment,
  AdmissionResult,
  ToolAdmissionOperations,
  ToolAdmissionPassSourceOperations,
} from '@omne-harness-lite/tool-admission'
import { captureBatch } from './input.ts'
import { createAdmissionJudgment, type AdmissionJudgmentDependencies } from './judgment.ts'
import {
  encodeRunnerAdmissionToken as encodeFormalToken,
  canonicalAdmissionArguments as canonical,
} from '@omne-harness-lite/loop-extension-runner'

const failed = Object.freeze({ kind: 'failed', reason: 'unavailable' } as const)
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
  const tenant = parseTenantId(scope.tenant),
    session = parseOpaqueIdentifier(scope.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session
    ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
    : undefined
}

function sameInput(actual: AdmissionInput, expected: AdmissionInput): boolean {
  // Both inputs passed captureBatch, which owns all JSON data and preserves only the grants identity.
  const { grants: actualGrants, ...actualData } = actual
  const { grants: expectedGrants, ...expectedData } = expected
  return (
    actualGrants === expectedGrants &&
    canonical(actualData as unknown as JsonValue) ===
      canonical(expectedData as unknown as JsonValue)
  )
}

/** Private composition for the provider. The source, authorization and lifecycle are captured once. */
export function createPassBindings(dependencies: {
  readonly access: SessionAccessOperations
  readonly source: ToolAdmissionPassSourceOperations
  readonly judgment?: AdmissionJudgmentDependencies
}): Pick<ToolAdmissionOperations, 'forPass'> & { readonly close: () => Promise<void> } {
  const accessOwner = dependencies.access,
    source = dependencies.source
  const pure = createAdmissionJudgment(dependencies.judgment)
  const pending = new Set<Promise<unknown>>()
  let active = true
  function track<T>(work: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(work)
    pending.add(promise)
    void promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    )
    return promise
  }
  async function authorize(access: SessionAccess, scope: SessionScope) {
    if (!active) return rejected('unavailable')
    const result = await accessOwner.authorize(access, scope, 'run.advance')
    if (!active) return rejected('unavailable')
    return result.kind === 'authorized'
      ? result
      : rejected(result.reason === 'ownerStopped' ? 'unavailable' : result.reason)
  }
  const forPass: ToolAdmissionOperations['forPass'] = (access, scopeInput, pass) => {
    if (!active) return Promise.resolve(rejected('unavailable'))
    const scope = ownScope(scopeInput)
    if (!scope || !('ok' in parseOpaqueIdentifier(pass, 'AdmissionPass')))
      return Promise.resolve(rejected('invalidInput'))
    return track(async () => {
      try {
        const allowed = await authorize(access, scope)
        if (allowed.kind === 'rejected') return allowed
        const found = await source.read(access, scope, pass)
        if (!active) return rejected('unavailable')
        const checked = await authorize(access, scope)
        if (checked.kind === 'rejected') return checked
        if (found.kind === 'rejected') return found
        const record = found.record
        if (!record.isActive()) return rejected('unavailable')
        const fixed = captureBatch(record.inputs, false)
        if ('kind' in fixed || record.finalKeys.length !== fixed.batch.length)
          return rejected('unavailable')
        const tokens = fixed.batch.map((input, index) =>
          encodeFormalToken(input.call, record.finalKeys[index]),
        )
        if (tokens.some(token => typeof token !== 'string') || !record.isActive())
          return rejected('unavailable')
        const current = () => {
          try {
            return active && record.isActive()
          } catch {
            return false
          }
        }
        const judgment = Object.freeze<AdmissionJudgment>({
          admit(batch) {
            if (!current()) return Promise.resolve(failed)
            const captured = captureBatch(batch, false)
            if ('kind' in captured) return Promise.resolve(captured)
            if (
              captured.batch.length !== fixed.batch.length ||
              captured.batch.some((input, index) => !sameInput(input, fixed.batch[index]!))
            )
              return Promise.resolve({ kind: 'failed', reason: 'invalidInput' } as const)
            return track(async () => {
              try {
                if (!current()) return failed
                if ((await authorize(access, scope)).kind !== 'authorized' || !current())
                  return failed
                const result = await pure.admit(captured.batch)
                if (!current()) return failed
                if ((await authorize(access, scope)).kind !== 'authorized' || !current())
                  return failed
                if (result.kind === 'failed') return result
                const results = result.results.map((item, index): AdmissionResult => {
                  const token = tokens[index]
                  if (item.kind !== 'allow') return item
                  if (typeof token !== 'string')
                    throw new Error('Missing captured admission locator')
                  return Object.freeze({ kind: 'allow', token })
                }) as [AdmissionResult, ...AdmissionResult[]]
                return { kind: 'decisions', results: Object.freeze(results) } as const
              } catch {
                return failed
              }
            })
          },
        })
        return { kind: 'bound', judgment } as const
      } catch {
        return rejected('unavailable')
      }
    })
  }
  return Object.freeze({
    forPass,
    async close() {
      active = false
      while (pending.size !== 0) await Promise.allSettled([...pending])
    },
  })
}
