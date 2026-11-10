import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { CredentialPort } from '../credential.ts'
import type { ProviderName } from '../root.ts'

/** One credential item of one provider in one layer: what a test control writes. */
export type CredentialTarget = Readonly<{
  provider: ProviderName
  item: string
  scope: Readonly<{ layer: 'tenant'; tenant: TenantId }> | Readonly<{ layer: 'official' }>
}>

/** Test controls belong to the assembly, never to the credential port. */
export type CredentialConformanceControls = Readonly<{
  bind(target: CredentialTarget, secret: string): void | Promise<void>
  unbind(target: CredentialTarget): void | Promise<void>
  rotate(target: CredentialTarget, secret: string): void | Promise<void>
  revoke(target: CredentialTarget): void | Promise<void>
  markUnreadable(target: CredentialTarget): void | Promise<void>
  setUnavailable(unavailable: boolean): void | Promise<void>
  close(): void | Promise<void>
}>

/**
 * A fresh port without bindings. `provider` declares exactly the two `items` and the release holds
 * it; `bareProvider` declares no item. The three secrets differ.
 */
export type CredentialConformanceSubject<P> = Readonly<{
  port: CredentialPort<P>
  access: Access<P>
  otherAccess: Access<P>
  provider: ProviderName
  bareProvider: ProviderName
  items: readonly [string, string]
  secrets: readonly [string, string]
  rotatedSecret: string
  controls: CredentialConformanceControls
  dispose?(): void | Promise<void>
}>

export const CREDENTIAL_CONFORMANCE_OBLIGATIONS = [
  'no-items-no-layer',
  'tenant-layer-whole',
  'official-layer-official-profile-only',
  'layers-never-mixed',
  'fixed-layer-no-fallback',
  'foreign-tenant-isolated',
  'rotation-visible',
  'revoked-item-fails',
  'unreadable-item-fails',
  'unavailable-source-preserved',
  'purpose-denied',
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
