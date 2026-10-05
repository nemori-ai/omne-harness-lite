import { X509Certificate } from 'node:crypto'
import { createRequire } from 'node:module'
import { z } from 'zod'
import type { LocalRecord } from '@omne-harness-lite/client-local-state'

const require = createRequire(new URL('../package.json', import.meta.url))
function fixedSchemas() {
  return require('./generated/ordinary.cjs') as Record<
    | 'GovernanceCenterId'
    | 'LoginStatePresentation'
    | 'AccountId'
    | 'LoginStateId'
    | 'TenantId'
    | 'Envelope'
    | 'Exchange',
    (value: unknown) => boolean
  >
}
function certificatesOnly(text: string): boolean {
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  if (
    !blocks?.length ||
    text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()
  )
    return false
  try {
    return blocks.every(block => new X509Certificate(block).ca)
  } catch {
    return false
  }
}

const opaque = z.string().refine(s => s.isWellFormed())
const trust = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('ca'),
      certificateAuthorities: z.string().refine(certificatesOnly).optional(),
    })
    .strict(),
  z.object({ mode: z.literal('spki'), sha256: z.string().regex(/^[\da-fA-F]{64}$/) }).strict(),
])
const endpoint = z.string().refine(s => {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
  } catch {
    return false
  }
})
const shape = z
  .object({
    center: z
      .object({
        centerId: opaque.refine(s => fixedSchemas().GovernanceCenterId(s)),
        endpoint,
        trust,
      })
      .strict(),
    login: z
      .object({
        presentation: opaque.refine(s => fixedSchemas().LoginStatePresentation(s)),
        handle: opaque.refine(s => fixedSchemas().LoginStateId(s)),
        accountId: opaque.refine(s => fixedSchemas().AccountId(s)).optional(),
      })
      .strict()
      .optional(),
    cache: z.array(
      z
        .object({
          centerId: opaque.refine(s => fixedSchemas().GovernanceCenterId(s)),
          accountId: opaque.refine(s => fixedSchemas().AccountId(s)),
          tenant: z
            .object({ organization: opaque, account: opaque })
            .strict()
            .refine(t => fixedSchemas().TenantId(t))
            .optional(),
          operation: z.string(),
          payload: z.record(z.string(), z.unknown()),
          result: z.unknown(),
          acquiredAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict()
  .nullable()

const reads = new Set([
  'capability.account-identity/v3#S-37',
  ...[22, 26, 27, 34, 35, 36, 55, 56, 57, 58, 59, 60].map(
    s => `capability.organization-governance/v2#S-${s}`,
  ),
])

export function validRecord(value: unknown): value is LocalRecord | null {
  const parsed = shape.safeParse(value)
  if (!parsed.success) return false
  const state = parsed.data
  if (state === null) return true
  for (const c of state.cache) {
    if (
      state.login?.accountId === undefined ||
      c.accountId !== state.login.accountId ||
      c.centerId !== state.center.centerId ||
      (c.tenant !== undefined && c.tenant.account !== c.accountId) ||
      !reads.has(c.operation)
    )
      return false
    if (
      !fixedSchemas().Envelope({
        protocolVersion: '2',
        operation: c.operation,
        presentedLoginState: 'cached-read',
        payload: c.payload,
      }) ||
      !fixedSchemas().Exchange({ operation: c.operation, reply: { result: c.result } })
    )
      return false
    if (c.operation === 'capability.organization-governance/v2#S-34') {
      const organizations = c.payload['organizations']
      if (
        !Array.isArray(organizations) ||
        (organizations.length === 1 ? !Array.isArray(c.result) : typeof c.result !== 'boolean')
      )
        return false
    }
  }
  return true
}

export function sameLogin(a: LocalRecord | null, b: LocalRecord | null): boolean {
  return a?.login?.presentation === b?.login?.presentation && a?.login?.handle === b?.login?.handle
}

export function validTransition(before: LocalRecord | null, after: LocalRecord | null): boolean {
  if (before !== null && before.center.centerId !== after?.center.centerId) return false
  if (!sameLogin(before, after)) return after?.cache.length === 0
  const oldAccount = before?.login?.accountId
  return oldAccount === undefined || oldAccount === after?.login?.accountId
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export const MAX_RECORD_BYTES = 16 * 1024 * 1024
export function capture(
  value: unknown,
):
  | { kind: 'value'; value: LocalRecord | null; json: string }
  | { kind: 'invalid' }
  | { kind: 'limit' } {
  let json: string | undefined
  try {
    json = JSON.stringify(value)
  } catch {
    return { kind: 'invalid' }
  }
  if (json === undefined) return { kind: 'invalid' }
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) return { kind: 'limit' }
  const copy: unknown = JSON.parse(json)
  // JSON's coercions (for example Infinity -> null) must not turn an invalid
  // purported online result into an acceptable cached reading.
  if (!validRecord(value) || !validRecord(copy)) return { kind: 'invalid' }
  return { kind: 'value', value: freeze(copy), json }
}
