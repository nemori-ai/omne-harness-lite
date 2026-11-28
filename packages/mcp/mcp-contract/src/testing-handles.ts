import type { CredentialRefusal, HttpCredentialHandle } from './ports.ts'

export function countingCredential(
  gate: Promise<void> = Promise.resolve(),
): HttpCredentialHandle &
  Readonly<{ rejections(): number; refusals: readonly CredentialRefusal[] }> {
  const refusals: CredentialRefusal[] = []
  return {
    purpose: 'http-authorization',
    async authorize(headers) {
      await gate
      headers.set('authorization', 'Bearer suite-token')
      return { ok: true }
    },
    async reportRejection(refusal) {
      refusals.push(refusal)
    },
    async release() {},
    rejections: () => refusals.length,
    refusals,
  }
}

export function heldCredential(): HttpCredentialHandle & Readonly<{ reached: Promise<void> }> {
  let asked = (): void => undefined
  const reached = new Promise<void>(resolve => {
    asked = resolve
  })
  return {
    purpose: 'http-authorization',
    authorize() {
      asked()
      return new Promise(() => undefined)
    },
    async reportRejection() {},
    async release() {},
    reached,
  }
}
