import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialBinding, EndpointHolding } from '@omne-harness/mcp-contract'
import type {
  CredentialFailure,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
} from '@omne-harness/mcp-contract/provider'
import type { Principal } from './identities.ts'

export type AnyHandle = HttpCredentialHandle

export function releasing<H extends AnyHandle>(handle: H, release: () => Promise<void>): H {
  return { ...handle, release }
}

export function reshapedCredentials(
  port: CredentialUse<Principal>,
  shape: (handle: AnyHandle) => AnyHandle,
  before?: () => Promise<void>,
): CredentialUse<Principal> {
  async function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<AnyHandle, CredentialFailure>> {
    if (before !== undefined) await before()
    const answer = await port.acquire(access, holding, purpose, binding)
    return 'failure' in answer ? answer : { ok: shape(answer.ok) }
  }
  return { acquire }
}
