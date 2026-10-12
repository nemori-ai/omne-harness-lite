import { createCipheriv, createDecipheriv } from 'node:crypto'
import type { CredentialRef } from '@omne-harness-lite/asset-model'
import type { TenantId } from '@omne-harness-lite/identity-values'

export type BodyContext =
  | { readonly kind: 'replica'; readonly tenant: TenantId; readonly sourceRef?: CredentialRef }
  | {
      readonly kind: 'oauth'
      readonly ref: CredentialRef
      readonly binding: string
      readonly holding: { readonly tenant: TenantId; readonly endpoint: string }
    }
export type OpenBodyResult = { readonly body: Uint8Array } | { readonly unopenable: true }

// Four-byte unsigned big-endian lengths of UTF-16LE code units preserve exact JS identifiers,
// including lone surrogates allowed by the existing opaque-identifier representation.
function aad(context: BodyContext): Buffer {
  const parts =
    context.kind === 'replica'
      ? [
          context.sourceRef === undefined
            ? 'credential-custodian:replica:v1'
            : 'credential-custodian:replica:v2',
          context.tenant.organization,
          context.tenant.account,
          ...(context.sourceRef === undefined ? [] : [context.sourceRef]),
        ]
      : [
          'credential-custodian:oauth:v1',
          context.ref,
          context.binding,
          context.holding.tenant.organization,
          context.holding.tenant.account,
          context.holding.endpoint,
        ]
  return Buffer.concat(
    parts.flatMap(part => {
      const bytes = Buffer.from(part, 'utf16le')
      const length = Buffer.alloc(4)
      length.writeUInt32BE(bytes.length)
      return [length, bytes]
    }),
  )
}
function version(context: BodyContext): number {
  return context.kind === 'replica' && context.sourceRef !== undefined ? 2 : 1
}

/** Pure AES-256-GCM sealing. Caller supplies an independent 12-byte nonce and owns the key. */
export function sealBody(
  key: Uint8Array,
  context: BodyContext,
  body: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  if (key.byteLength !== 32 || nonce.byteLength !== 12 || body.byteLength === 0)
    throw new TypeError('credential sealing input invalid')
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(aad(context))
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([version(context)]),
      nonce,
      cipher.update(body),
      cipher.final(),
      cipher.getAuthTag(),
    ]),
  )
}

/** Authentication, format, key and identity failures all yield unopenable, with no plaintext. */
export function openBody(
  key: Uint8Array,
  context: BodyContext,
  sealed: Uint8Array,
): OpenBodyResult {
  if (key.byteLength !== 32 || sealed.byteLength <= 29 || sealed[0] !== version(context))
    return { unopenable: true }
  let partial: Buffer | undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(1, 13))
    decipher.setAAD(aad(context))
    decipher.setAuthTag(sealed.subarray(-16))
    partial = decipher.update(sealed.subarray(13, -16))
    const final = decipher.final()
    const plaintext = Buffer.concat([partial, final])
    const body = Uint8Array.from(plaintext)
    plaintext.fill(0)
    final.fill(0)
    return { body }
  } catch {
    return { unopenable: true }
  } finally {
    partial?.fill(0)
  }
}
