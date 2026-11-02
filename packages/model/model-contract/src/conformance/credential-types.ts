import type { Access } from '@omne-harness/legal-identity'
import type { CredentialId, CredentialPort, CredentialReference } from '../credential.ts'

/** Test controls belong to the assembly, never to the credential port. */
export type CredentialConformanceControls = Readonly<{
  bind(reference: CredentialReference, secret: string): void | Promise<void>
  rotate(reference: CredentialReference, secret: string): void | Promise<void>
  revoke(reference: CredentialReference): void | Promise<void>
  markUnreadable(reference: CredentialReference): void | Promise<void>
  setUnavailable(unavailable: boolean): void | Promise<void>
  close(): void | Promise<void>
}>

/** Fresh, empty tenant bindings and a configured synthetic factory value. */
export type CredentialConformanceSubject<P> = Readonly<{
  port: CredentialPort<P>
  access: Access<P>
  otherAccess: Access<P>
  id: CredentialId
  otherId: CredentialId
  factorySecret: string
  secret: string
  rotatedSecret: string
  controls: CredentialConformanceControls
  dispose?(): void | Promise<void>
}>

export const CREDENTIAL_CONFORMANCE_OBLIGATIONS = [
  'qualified-methods-required',
  'legacy-presence-and-resolution',
  'legacy-unauthorized-denied',
  'legacy-purpose-denied',
  'legacy-factory-rules',
  'qualified-presence-and-resolution',
  'qualified-independent-of-legacy',
  'qualified-foreign-holder-denied',
  'qualified-factory-official-only',
  'qualified-other-binding-blocks-factory',
  'qualified-purpose-denied',
  'rotation-visible',
  'revoked-binding-denied',
  'unreadable-binding-preserved',
  'unavailable-source-preserved',
  'closed-port-denied',
] as const

export type CredentialConformanceObligation = (typeof CREDENTIAL_CONFORMANCE_OBLIGATIONS)[number]
export type CredentialConformanceResult = Readonly<{
  obligation: CredentialConformanceObligation
  status: 'pass' | 'fail'
  /** Fixed diagnostic text. Subject errors and secret values are never included. */
  detail: string
}>
export type CredentialConformanceReport = Readonly<{
  ok: boolean
  results: readonly CredentialConformanceResult[]
}>
export type CredentialConformanceOptions<P> = Readonly<{
  subject(): CredentialConformanceSubject<P> | Promise<CredentialConformanceSubject<P>>
  /** Positive integer milliseconds per asynchronous factory, control and disposal call. */
  waitMs?: number
}>
