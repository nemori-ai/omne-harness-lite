import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolCallId, type SourceLayer } from '@omne-harness/tool-contract'
import {
  judgeFixedToolRequest,
  type ToolCredentialFailure,
  type ToolCredentialRequest,
  type ToolCredentials,
  type ToolCredentialUsage,
} from '@omne-harness/tool-contract/provider'

type CredentialReply<T> = Promise<Outcome<T, ToolCredentialFailure>>

export interface ToolCredentialAccess<P> {
  /** Check the current principal, tenant, original call and its fixed request. */
  qualify(input: ToolCredentialRequest<P>): CredentialReply<void>
}

export interface ToolCredentialReferences<P> {
  /** Read this exact fixed settings adoption at the requested source. No secret values. */
  read(
    input: ToolCredentialRequest<P> & Readonly<{ source: SourceLayer }>,
  ): CredentialReply<
    Readonly<{ kind: 'unconfigured' }> | Readonly<{ kind: 'configured'; reference: string }>
  >
}

/**
 * One resolution of a secret: the stored binding, a capability that is valid until `revoke`, and
 * `revoke` itself. After `revoke` resolved, the capability must no longer perform its action;
 * `revoke` rejects when the store could not revoke. Error texts must not carry secret values.
 */
export type ToolCredentialResolution<C> = Readonly<{
  binding: ToolCredentialUsage & { tenant: TenantId }
  capability: C
  revoke(): Promise<void> | void
}>

export interface ToolCredentialSecrets<P, C> {
  /** Return the stored binding, independently of the requested usage. No fallback is permitted. */
  resolve(
    input: ToolCredentialRequest<P> & Readonly<{ reference: string }>,
  ): CredentialReply<ToolCredentialResolution<C>>
}

/**
 * A local capability rechecks the original reference immediately before each protected use. The
 * capability it hands to `action` is valid for that use only: when `action` settled, the use
 * revokes it, then returns the result or rethrows the unknown error of `action` as it was. A
 * failed revocation after a successful action rejects with the revocation error; after a failed
 * action, with an `AggregateError` of `[actionError, revocationError]`.
 */
export interface ToolCredentialCapability<C> {
  use<T>(action: (capability: C) => Promise<T>): CredentialReply<T>
}

export type LocalToolCredentialsInput<P, C> = Readonly<{
  access: ToolCredentialAccess<P>
  references: ToolCredentialReferences<P>
  secrets: ToolCredentialSecrets<P, C> | null
}>

function invalid(field: string): Outcome<never, ToolCredentialFailure> {
  return fail({ kind: 'invalid', field, reason: 'credential binding mismatch' })
}

function unavailable(dependency: string): Outcome<never, ToolCredentialFailure> {
  return fail({ kind: 'unavailable', dependency, diagnostic: 'credential provider unavailable' })
}

function sameUsage(left: ToolCredentialUsage, right: ToolCredentialUsage): boolean {
  return (
    left.purpose === right.purpose &&
    left.target === right.target &&
    left.adoption.owner === right.adoption.owner &&
    left.adoption.name === right.adoption.name &&
    left.adoption.revision === right.adoption.revision &&
    left.adoption.digest === right.adoption.digest
  )
}

function fixedInput<P>(
  input: ToolCredentialRequest<P>,
): Outcome<ToolCredentialRequest<P>, ToolCredentialFailure> {
  if (!input || !tenantCodec.encode(input.tenant).ok || !('principal' in input))
    return fail({ kind: 'denied', action: 'credentials' })
  const call = decodeToolCallId(input.call)
  if ('failure' in call) return invalid('call')
  const request = judgeFixedToolRequest(input.request)
  if ('failure' in request) return fail({ kind: 'invalid', ...request.failure })
  const usage = input.usage
  if (!validUsage(usage)) return invalid('usage')
  const fixedUsage = {
    adoption: request.ok.availability.definition.adoption,
    purpose: usage.purpose,
    target: usage.target,
  }
  if (!sameUsage(usage, fixedUsage)) return invalid('usage.adoption')
  return succeed(
    Object.freeze({
      principal: input.principal,
      tenant: input.tenant,
      call: call.ok,
      request: request.ok,
      usage: Object.freeze(fixedUsage),
    }),
  )
}

function validUsage(usage: ToolCredentialUsage): boolean {
  return !(
    !usage ||
    !usage.adoption ||
    typeof usage.purpose !== 'string' ||
    usage.purpose.trim().length === 0 ||
    typeof usage.target !== 'string' ||
    usage.target.trim().length === 0
  )
}

/** Reference selection is separate from use; a selected missing secret never selects another source. */
export function createLocalToolCredentials<P, C>(
  ports: LocalToolCredentialsInput<P, C>,
): ToolCredentials<P, ToolCredentialCapability<C>> {
  const qualify = async (input: ToolCredentialRequest<P>): CredentialReply<void> => {
    try {
      return await ports.access.qualify(input)
    } catch {
      return unavailable('tool-credential-access')
    }
  }

  const selectedReference = async (input: ToolCredentialRequest<P>): CredentialReply<string> => {
    const sources: readonly SourceLayer[] = [
      { kind: 'tenant', tenant: input.tenant },
      { kind: 'organization', organization: input.tenant.organization },
      { kind: 'official' },
    ]
    for (const source of sources) {
      let selected: Awaited<ReturnType<ToolCredentialReferences<P>['read']>>
      try {
        selected = await ports.references.read({ ...input, source })
      } catch {
        return unavailable('tool-credential-references')
      }
      if ('failure' in selected) return selected
      if (selected.ok.kind === 'configured') {
        return typeof selected.ok.reference === 'string' && selected.ok.reference.length > 0
          ? succeed(selected.ok.reference)
          : invalid('reference')
      }
    }
    return fail({ kind: 'missing' })
  }

  /** Qualifies again, resolves the stored binding and checks it. A mismatch revokes at once. */
  const boundCapability = async (
    input: ToolCredentialRequest<P>,
    reference: string,
  ): CredentialReply<ToolCredentialResolution<C>> => {
    const allowed = await qualify(input)
    if ('failure' in allowed) return allowed
    if (ports.secrets === null) return unavailable('tool-credential-secrets')
    let secret: Awaited<ReturnType<ToolCredentialSecrets<P, C>['resolve']>>
    try {
      secret = await ports.secrets.resolve({ ...input, reference })
    } catch {
      return unavailable('tool-credential-secrets')
    }
    if ('failure' in secret) return secret
    if (typeof secret.ok.revoke !== 'function') return unavailable('tool-credential-secrets')
    const mismatch = !tenantEquals(secret.ok.binding.tenant, input.tenant)
      ? invalid('binding.tenant')
      : !sameUsage(secret.ok.binding, input.usage)
        ? invalid('binding.usage')
        : null
    if (mismatch === null) return succeed(secret.ok)
    await secret.ok.revoke()
    return mismatch
  }

  /** Runs `action` on a capability valid for this use only; see `ToolCredentialCapability`. */
  const restrictedUse = async <T>(
    resolution: ToolCredentialResolution<C>,
    action: (capability: C) => Promise<T>,
  ): Promise<T> => {
    let result: T
    try {
      result = await action(resolution.capability)
    } catch (actionError) {
      try {
        await resolution.revoke()
      } catch (revocationError) {
        throw new AggregateError(
          [actionError, revocationError],
          'the restricted action failed and its capability could not be revoked',
        )
      }
      throw actionError
    }
    await resolution.revoke()
    return result
  }

  const credentials: ToolCredentials<P, ToolCredentialCapability<C>> = {
    resolve: async raw => {
      const input = fixedInput(raw)
      if ('failure' in input) return input
      const allowed = await qualify(input.ok)
      if ('failure' in allowed) return allowed
      const reference = await selectedReference(input.ok)
      if ('failure' in reference) return reference
      // Resolution only proves the binding; the capability it obtained is not handed out.
      const initial = await boundCapability(input.ok, reference.ok)
      if ('failure' in initial) return initial
      await initial.ok.revoke()
      return succeed(
        Object.freeze({
          async use<T>(action: (capability: C) => Promise<T>): CredentialReply<T> {
            const bound = await boundCapability(input.ok, reference.ok)
            return 'failure' in bound ? bound : succeed(await restrictedUse(bound.ok, action))
          },
        }),
      )
    },
  }
  return Object.freeze(credentials)
}
