import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialBinding, EndpointHolding } from '@omne-harness/mcp-contract'
import type {
  CredentialFailure,
  CredentialPurpose,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
  ProcessCredentialHandle,
  ProcessPurpose,
} from '@omne-harness/mcp-contract/provider'
import type { Principal } from './identities.ts'

export type AnyHandle = ProcessCredentialHandle | HttpCredentialHandle

export function releasing<H extends AnyHandle>(handle: H, release: () => Promise<void>): H {
  return { ...handle, release }
}

export function reshapedCredentials(
  port: CredentialUse<Principal>,
  shape: (handle: AnyHandle) => AnyHandle,
  before?: () => Promise<void>,
): CredentialUse<Principal> {
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: ProcessPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle, CredentialFailure>>
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
  async function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: CredentialPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<AnyHandle, CredentialFailure>> {
    if (before !== undefined) await before()
    const answer =
      purpose.kind === 'process-env'
        ? await port.acquire(access, holding, purpose, binding)
        : await port.acquire(access, holding, purpose, binding)
    return 'failure' in answer ? answer : { ok: shape(answer.ok) }
  }
  return { acquire }
}
