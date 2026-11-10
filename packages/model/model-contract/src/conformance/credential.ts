import { tenantEquals } from '@omne-harness/legal-identity'
import { MODEL_SEND, type CredentialReference, type CredentialResolution } from '../credential.ts'
import type { CredentialLayer } from '../root.ts'
import {
  CREDENTIAL_CONFORMANCE_OBLIGATIONS,
  type CredentialConformanceObligation,
  type CredentialConformanceOptions,
  type CredentialConformanceReport,
  type CredentialConformanceResult,
  type CredentialConformanceSubject,
  type CredentialTarget,
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
  const { port, controls, access, provider, items, secrets } = subject
  requireCondition(!tenantEquals(access.tenant, subject.otherAccess.tenant))
  requireCondition(provider !== subject.bareProvider && items[0] !== items[1])
  requireCondition(new Set([...secrets, subject.rotatedSecret]).size === 3)
  for (const name of [
    'bind',
    'unbind',
    'rotate',
    'revoke',
    'markUnreadable',
    'setUnavailable',
    'close',
  ] as const) {
    requireCondition(typeof controls[name] === 'function')
  }
  const control = (operation: () => void | Promise<void>) => within(operation, waitMs)
  const own = { layer: 'tenant', tenant: access.tenant } as const
  const target = (item: string, scope: CredentialTarget['scope'] = own): CredentialTarget => ({
    provider,
    item,
    scope,
  })
  /** Binds both items of a layer: the first secret to the first item, the second to the second. */
  const bindLayer = (scope: CredentialTarget['scope'] = own) =>
    control(async () => {
      await controls.bind(target(items[0], scope), secrets[0])
      await controls.bind(target(items[1], scope), secrets[1])
    })
  const layerOf = (official: boolean) => port.layerOf({ provider, official, access })
  const resolve = (layer: CredentialLayer) =>
    port.resolve({ provider, layer, purpose: MODEL_SEND, access })
  function values(result: CredentialResolution, first: string, second: string) {
    requireCondition(
      'ok' in result &&
        result.ok.size === 2 &&
        result.ok.get(items[0]) === first &&
        result.ok.get(items[1]) === second,
    )
  }
  function failed(result: CredentialResolution | ReturnType<typeof layerOf>, kind: string) {
    requireCondition('failure' in result && result.failure.kind === kind)
  }
  function layer(result: ReturnType<typeof layerOf>, expected: CredentialLayer['layer']) {
    requireCondition('ok' in result && result.ok.layer === expected)
  }
  return {
    subject,
    port,
    controls,
    items,
    secrets,
    target,
    control,
    bindLayer,
    layerOf,
    resolve,
    values,
    failed,
    layer,
  }
}

type Scene<P> = ReturnType<typeof scene<P>>

const TENANT = { layer: 'tenant' } as const
const OFFICIAL = { layer: 'official' } as const

function checks<P>(): Record<
  CredentialConformanceObligation,
  (input: Scene<P>) => void | Promise<void>
> {
  return {
    'no-items-no-layer'({ port, subject, layer }) {
      const { bareProvider: provider, access } = subject
      layer(port.layerOf({ provider, official: true, access }), 'none')
      const resolved = port.resolve({
        provider,
        layer: { layer: 'none' },
        purpose: MODEL_SEND,
        access,
      })
      requireCondition('ok' in resolved && resolved.ok.size === 0)
    },
    async 'tenant-layer-whole'(input) {
      input.failed(input.layerOf(false), 'missing')
      await input.bindLayer()
      await input.bindLayer(OFFICIAL)
      input.layer(input.layerOf(true), 'tenant')
      input.layer(input.layerOf(false), 'tenant')
      input.values(input.resolve(TENANT), ...input.secrets)
    },
    async 'official-layer-official-profile-only'(input) {
      await input.bindLayer(OFFICIAL)
      input.layer(input.layerOf(true), 'official')
      input.failed(input.layerOf(false), 'missing')
      input.values(input.resolve(OFFICIAL), ...input.secrets)
    },
    async 'layers-never-mixed'(input) {
      await input.bindLayer(OFFICIAL)
      await input.control(() => input.controls.bind(input.target(input.items[0]), input.secrets[0]))
      const selected = input.layerOf(true)
      requireCondition(
        'failure' in selected &&
          selected.failure.kind === 'incomplete' &&
          selected.failure.missing.length === 1 &&
          selected.failure.missing[0] === input.items[1],
      )
      input.failed(input.resolve(TENANT), 'incomplete')
    },
    async 'fixed-layer-no-fallback'(input) {
      await input.bindLayer()
      await input.bindLayer(OFFICIAL)
      input.layer(input.layerOf(true), 'tenant')
      await input.control(async () => {
        await input.controls.unbind(input.target(input.items[0]))
        await input.controls.unbind(input.target(input.items[1]))
      })
      input.failed(input.resolve(TENANT), 'missing')
    },
    async 'foreign-tenant-isolated'(input) {
      await input.bindLayer({ layer: 'tenant', tenant: input.subject.otherAccess.tenant })
      input.failed(input.layerOf(true), 'missing')
      input.failed(input.resolve(TENANT), 'missing')
      await input.bindLayer()
      input.values(input.resolve(TENANT), ...input.secrets)
    },
    async 'rotation-visible'(input) {
      await input.bindLayer()
      await input.control(() =>
        input.controls.rotate(input.target(input.items[0]), input.subject.rotatedSecret),
      )
      input.values(input.resolve(TENANT), input.subject.rotatedSecret, input.secrets[1])
    },
    async 'revoked-item-fails'(input) {
      await input.bindLayer()
      await input.bindLayer(OFFICIAL)
      await input.control(() => input.controls.revoke(input.target(input.items[1])))
      input.failed(input.layerOf(true), 'revoked')
      input.failed(input.resolve(TENANT), 'revoked')
    },
    async 'unreadable-item-fails'(input) {
      await input.bindLayer()
      await input.bindLayer(OFFICIAL)
      await input.control(() => input.controls.markUnreadable(input.target(input.items[0])))
      input.failed(input.layerOf(true), 'unreadable')
      input.failed(input.resolve(TENANT), 'unreadable')
    },
    async 'unavailable-source-preserved'(input) {
      await input.bindLayer()
      await input.control(() => input.controls.setUnavailable(true))
      input.failed(input.layerOf(true), 'unavailable')
      input.failed(input.resolve(TENANT), 'unavailable')
      await input.control(() => input.controls.setUnavailable(false))
      input.values(input.resolve(TENANT), ...input.secrets)
    },
    async 'purpose-denied'(input) {
      await input.bindLayer()
      const reference: CredentialReference<P> = {
        provider: input.subject.provider,
        layer: TENANT,
        purpose: MODEL_SEND,
        access: input.subject.access,
      }
      Reflect.set(reference, 'purpose', 'other-purpose')
      input.failed(input.port.resolve(reference), 'denied')
    },
    async 'closed-port-denied'(input) {
      await input.bindLayer()
      await input.control(() => input.controls.close())
      input.failed(input.layerOf(true), 'denied')
      input.failed(input.resolve(TENANT), 'denied')
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
  let finished = false
  let status: CredentialConformanceResult['status'] = 'pass'
  let detail = ''
  try {
    await within(async () => {
      const created = await options.subject()
      if (finished) await within(() => created.dispose?.(), waitMs)
      else subject = created
    }, waitMs)
    requireCondition(subject !== undefined)
    const prepared = scene(subject, waitMs)
    await within(() => check(prepared), waitMs)
  } catch {
    status = 'fail'
    detail = 'Credential obligation, subject construction or test control failed.'
  } finally {
    finished = true
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
