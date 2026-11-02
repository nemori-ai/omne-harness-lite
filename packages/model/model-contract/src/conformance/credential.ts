import { tenantEquals } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  type CredentialPresence,
  type CredentialReference,
  type CredentialResolution,
  type QualifiedCredentialQuery,
} from '../credential.ts'
import {
  CREDENTIAL_CONFORMANCE_OBLIGATIONS,
  type CredentialConformanceObligation,
  type CredentialConformanceOptions,
  type CredentialConformanceReport,
  type CredentialConformanceResult,
  type CredentialConformanceSubject,
} from './credential-types.ts'

function requireCondition(condition: boolean): asserts condition {
  if (!condition) throw new Error('credential obligation violated')
}

/** Timers are cleared on every settled path. Rejected values never enter the report. */
async function within<T>(operation: () => T | Promise<T>, waitMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('credential wait exceeded')), waitMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function scene<P>(subject: CredentialConformanceSubject<P>, waitMs: number) {
  const { port, controls, access, id } = subject
  requireCondition(
    id !== subject.otherId && !tenantEquals(access.tenant, subject.otherAccess.tenant),
  )
  requireCondition(
    new Set([subject.secret, subject.rotatedSecret, subject.factorySecret]).size === 3,
  )
  for (const name of [
    'bind',
    'rotate',
    'revoke',
    'markUnreadable',
    'setUnavailable',
    'close',
  ] as const) {
    requireCondition(typeof controls[name] === 'function')
  }
  const reference: CredentialReference = { id, tenant: access.tenant, purpose: MODEL_SEND }
  const query: QualifiedCredentialQuery<P> = { id, purpose: MODEL_SEND, official: true, access }
  const face = { authorized: true, official: true }
  const control = (operation: () => void | Promise<void>) => within(operation, waitMs)
  function qualified(qualifiedPort = port) {
    const { presentFor, resolveFor } = qualifiedPort
    requireCondition(typeof presentFor === 'function' && typeof resolveFor === 'function')
    return {
      present: () => presentFor.call(qualifiedPort, query),
      resolve: (input = query) => resolveFor.call(qualifiedPort, input),
    }
  }
  function known(result: CredentialPresence, present: boolean) {
    requireCondition(
      result.kind === 'known' &&
        result.present === present &&
        result.id === id &&
        tenantEquals(result.tenant, access.tenant) &&
        result.purpose === MODEL_SEND,
    )
  }
  function value(result: CredentialResolution, scope: 'tenant' | 'factory', secret: string) {
    requireCondition(result.kind === 'value' && result.scope === scope && result.value === secret)
  }
  const bind = () => control(() => controls.bind(reference, subject.secret))
  return { subject, port, controls, reference, query, face, control, qualified, known, value, bind }
}

type Scene<P> = ReturnType<typeof scene<P>>

function checks<P>(): Record<
  CredentialConformanceObligation,
  (input: Scene<P>) => void | Promise<void>
> {
  return {
    'qualified-methods-required': input => {
      input.qualified()
    },
    async 'legacy-presence-and-resolution'(input) {
      const { port, reference, face, known, value, subject } = input
      known(port.present(reference), false)
      requireCondition(port.resolve(reference, { ...face, official: false }).kind === 'absent')
      await input.bind()
      known(port.present(reference), true)
      value(port.resolve(reference, face), 'tenant', subject.secret)
      const foreign = { ...reference, tenant: subject.otherAccess.tenant }
      requireCondition(port.resolve(foreign, face).kind === 'denied')
      const presence = port.present(foreign)
      requireCondition(presence.kind === 'known' && !presence.present)
    },
    async 'legacy-unauthorized-denied'(input) {
      await input.bind()
      requireCondition(
        input.port.resolve(input.reference, { authorized: false, official: true }).kind ===
          'denied',
      )
    },
    'legacy-purpose-denied'({ port, reference, face }) {
      const query = { ...reference, purpose: 'other-purpose' }
      requireCondition(port.present(query).kind === 'denied')
      requireCondition(port.resolve(query, face).kind === 'denied')
    },
    async 'legacy-factory-rules'(input) {
      const { port, reference, face, value, subject } = input
      value(port.resolve(reference, face), 'factory', subject.factorySecret)
      requireCondition(port.resolve(reference, { ...face, official: false }).kind === 'absent')
      await input.control(() =>
        input.controls.bind(
          {
            ...reference,
            id: subject.otherId,
            tenant: subject.otherAccess.tenant,
          },
          subject.secret,
        ),
      )
      value(port.resolve(reference, face), 'factory', subject.factorySecret)
      await input.control(() =>
        input.controls.bind({ ...reference, id: subject.otherId }, subject.secret),
      )
      requireCondition(port.resolve(reference, face).kind === 'absent')
    },
    async 'qualified-presence-and-resolution'(input) {
      const qualified = input.qualified()
      input.known(qualified.present(), false)
      await input.bind()
      input.known(qualified.present(), true)
      input.value(qualified.resolve(), 'tenant', input.subject.secret)
    },
    async 'qualified-independent-of-legacy'(input) {
      await input.bind()
      const port = new Proxy(input.port, {
        get(target, name, receiver) {
          if (name === 'present' || name === 'resolve') throw new Error('legacy path read')
          return Reflect.get(target, name, receiver)
        },
      })
      const qualified = input.qualified(port)
      input.known(qualified.present(), true)
      input.value(qualified.resolve(), 'tenant', input.subject.secret)
    },
    async 'qualified-foreign-holder-denied'(input) {
      await input.bind()
      const query = { ...input.query, access: input.subject.otherAccess }
      requireCondition(input.qualified().resolve(query).kind === 'denied')
      requireCondition(input.port.presentFor?.(query).kind === 'denied')
    },
    async 'qualified-factory-official-only'(input) {
      const qualified = input.qualified()
      input.value(qualified.resolve(), 'factory', input.subject.factorySecret)
      requireCondition(qualified.resolve({ ...input.query, official: false }).kind === 'absent')
      await input.control(() =>
        input.controls.bind(
          {
            ...input.reference,
            id: input.subject.otherId,
            tenant: input.subject.otherAccess.tenant,
          },
          input.subject.secret,
        ),
      )
      input.value(qualified.resolve(), 'factory', input.subject.factorySecret)
    },
    async 'qualified-other-binding-blocks-factory'(input) {
      await input.control(() =>
        input.controls.bind(
          { ...input.reference, id: input.subject.otherId },
          input.subject.secret,
        ),
      )
      requireCondition(input.qualified().resolve().kind === 'absent')
    },
    'qualified-purpose-denied'(input) {
      const query = { ...input.query }
      Reflect.set(query, 'purpose', 'other-purpose')
      requireCondition(input.qualified().resolve(query).kind === 'denied')
      requireCondition(input.port.presentFor?.(query).kind === 'denied')
    },
    async 'rotation-visible'(input) {
      await input.bind()
      await input.control(() => input.controls.rotate(input.reference, input.subject.rotatedSecret))
      input.value(input.qualified().resolve(), 'tenant', input.subject.rotatedSecret)
      input.value(
        input.port.resolve(input.reference, input.face),
        'tenant',
        input.subject.rotatedSecret,
      )
    },
    async 'revoked-binding-denied'(input) {
      await input.bind()
      await input.control(() => input.controls.revoke(input.reference))
      requireCondition(input.qualified().resolve().kind === 'denied')
      requireCondition(input.port.resolve(input.reference, input.face).kind === 'denied')
      input.known(input.qualified().present(), true)
    },
    async 'unreadable-binding-preserved'(input) {
      await input.bind()
      await input.control(() => input.controls.markUnreadable(input.reference))
      requireCondition(input.qualified().resolve().kind === 'unreadable')
      requireCondition(input.port.resolve(input.reference, input.face).kind === 'unreadable')
      input.known(input.qualified().present(), true)
    },
    async 'unavailable-source-preserved'(input) {
      await input.bind()
      await input.control(() => input.controls.setUnavailable(true))
      requireCondition(input.qualified().resolve().kind === 'unavailable')
      requireCondition(input.qualified().present().kind === 'unavailable')
      requireCondition(input.port.resolve(input.reference, input.face).kind === 'unavailable')
      requireCondition(input.port.present(input.reference).kind === 'unavailable')
      await input.control(() => input.controls.setUnavailable(false))
      input.value(input.qualified().resolve(), 'tenant', input.subject.secret)
    },
    async 'closed-port-denied'(input) {
      await input.bind()
      await input.control(() => input.controls.close())
      requireCondition(input.qualified().resolve().kind === 'denied')
      requireCondition(input.qualified().present().kind === 'denied')
      requireCondition(input.port.resolve(input.reference, input.face).kind === 'denied')
      requireCondition(input.port.present(input.reference).kind === 'denied')
    },
  }
}

async function run<P>(
  options: CredentialConformanceOptions<P>,
  obligation: CredentialConformanceObligation,
  check: (input: Scene<P>) => void | Promise<void>,
  waitMs: number,
): Promise<CredentialConformanceResult> {
  let subject: CredentialConformanceSubject<P> | undefined
  let status: CredentialConformanceResult['status'] = 'pass'
  let detail = ''
  try {
    subject = await within(() => options.subject(), waitMs)
    const prepared = scene(subject, waitMs)
    await within(() => check(prepared), waitMs)
  } catch {
    status = 'fail'
    detail = 'Credential obligation, subject construction or test control failed.'
  } finally {
    if (subject !== undefined) {
      try {
        await within(() => subject?.dispose?.(), waitMs)
      } catch {
        status = 'fail'
        detail = 'Subject disposal failed or exceeded the wait bound.'
      }
    }
  }
  return { obligation, status, detail }
}

/** Checks synchronous observable obligations, not principal provenance or official-profile truth. */
export async function checkCredentialPortConformance<P>(
  options: CredentialConformanceOptions<P>,
): Promise<CredentialConformanceReport> {
  const waitMs = options.waitMs ?? 1000
  if (!Number.isSafeInteger(waitMs) || waitMs < 1)
    throw new RangeError('waitMs must be a positive integer')
  const cases = checks<P>()
  const results: CredentialConformanceResult[] = []
  for (const obligation of CREDENTIAL_CONFORMANCE_OBLIGATIONS) {
    results.push(await run(options, obligation, cases[obligation], waitMs))
  }
  return { ok: results.every(result => result.status === 'pass'), results }
}
