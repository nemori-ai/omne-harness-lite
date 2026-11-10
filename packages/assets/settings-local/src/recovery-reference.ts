import { z } from 'zod'
import {
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsTargetSchema,
} from '@omne-harness/settings'
import { canonical, digest } from './encoding.ts'
import { domainSchema } from './schema.ts'

const header = z.strictObject({
  version: z.literal('settings-recovery/1'),
  target: SettingsTargetSchema,
})
export const settingsRecoveryReferenceSchema = z.discriminatedUnion('kind', [
  header.extend({ kind: z.literal('capture') }),
  header.extend({
    kind: z.literal('attempt'),
    rootOperationId: SettingsIdSchema,
    rootCommandDigest: z.string().regex(/^[a-f0-9]{64}$/),
    commandKind: z.enum(['change', 'rebase']),
  }),
])
export type SettingsRecoveryReference = z.infer<typeof settingsRecoveryReferenceSchema>

export function encodeSettingsRecoveryReference(
  reference: SettingsRecoveryReference,
): string | undefined {
  const parsed = settingsRecoveryReferenceSchema.safeParse(reference)
  if (!parsed.success) return undefined
  const encoded = canonical(parsed.data)
  return Buffer.byteLength(encoded, 'utf8') <= 16384 ? encoded : undefined
}

/** Decoding establishes routing syntax, not reservation authority or a persisted attempt. */
export function decodeSettingsRecoveryReference(
  targetRef: unknown,
): SettingsRecoveryReference | undefined {
  if (typeof targetRef !== 'string' || Buffer.byteLength(targetRef, 'utf8') > 16384)
    return undefined
  let value: unknown
  try {
    value = JSON.parse(targetRef)
  } catch {
    return undefined
  }
  const parsed = settingsRecoveryReferenceSchema.safeParse(value)
  return parsed.success && canonical(parsed.data) === targetRef ? parsed.data : undefined
}

export const settingsRecoveryIdentitySchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  kind: z.enum(['capture', 'attempt']),
  operationId: SettingsIdSchema,
})
export type SettingsRecoveryIdentity = z.infer<typeof settingsRecoveryIdentitySchema>

/** Full bindings must still be compared after lookup; a digest is only an index key. */
export function settingsRecoveryKey(identity: SettingsRecoveryIdentity): string {
  return digest([identity.domain, identity.principalRef, identity.kind, identity.operationId])
}
