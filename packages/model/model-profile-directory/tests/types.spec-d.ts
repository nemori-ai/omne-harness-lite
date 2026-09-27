import { expectTypeOf, test } from 'vitest'
import type {
  CredentialValue,
  CredentialPresent,
  LocalCredentialLookupConfig,
  ModelCatalogRead,
} from '@omne-harness-lite/model-profile-directory'
import type { ReadCredentialBindingIn } from '@omne-harness-lite/model-profile-directory/tx-reads'
import type { Instant } from '@omne-harness-lite/offer-expiry'

test('public surfaces retain precise scope and required borrowed reader', () => {
  expectTypeOf<CredentialValue['scope']['layer']>().toEqualTypeOf<'tenant' | 'factory'>()
  expectTypeOf<LocalCredentialLookupConfig>().not.toMatchTypeOf<{ readBoundReplicaIn?: never }>()
  expectTypeOf<Awaited<ReturnType<ReadCredentialBindingIn>>>().toMatchTypeOf<
    { binding: { credentialRef: string; boundAt: Instant } } | { absent: true }
  >()
  expectTypeOf<keyof ModelCatalogRead>().toEqualTypeOf<
    'readProfile' | 'listProfiles' | 'credentialPresent'
  >()
  // @ts-expect-error S20 has no organization credential source.
  const organization: CredentialValue['scope'] = { layer: 'organization', organization: 'O' }
  // @ts-expect-error Local P-1r cannot start without an actual borrowed reader.
  const missing: LocalCredentialLookupConfig = { mode: 'localCredentialOnly' }
  const exposed: CredentialPresent = {
    present: true,
    scope: { layer: 'factory' },
    // @ts-expect-error A runtime reader cannot return the directory reference on the public read face.
    credentialRef: 'secret',
  }
  expectTypeOf(organization).toEqualTypeOf<CredentialValue['scope']>()
  expectTypeOf(missing).toEqualTypeOf<LocalCredentialLookupConfig>()
  expectTypeOf(exposed).toEqualTypeOf<CredentialPresent>()
})
