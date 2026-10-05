import { expectTypeOf, test } from 'vitest'
import type {
  CredentialValue,
  CredentialPresent,
  ModelCatalogRead,
} from '@omne-harness-lite/model-profile-directory'
import type { BoundCredentialReplicaReader } from '@omne-harness-lite/model-profile-directory'
import type { ReadCredentialBindingIn } from '../src/types.ts'
import type { Instant } from '@omne-harness-lite/offer-expiry'

test('public surfaces retain precise scope and required borrowed reader', () => {
  expectTypeOf<CredentialValue['scope']['layer']>().toEqualTypeOf<'tenant' | 'factory'>()
  expectTypeOf<BoundCredentialReplicaReader>().not.toMatchTypeOf<{ readIn?: never }>()
  expectTypeOf<Awaited<ReturnType<ReadCredentialBindingIn>>>().toMatchTypeOf<
    { binding: { credentialRef: string; boundAt: Instant } } | { absent: true }
  >()
  expectTypeOf<keyof ModelCatalogRead>().toEqualTypeOf<
    'readProfile' | 'listProfiles' | 'credentialPresent'
  >()
  // @ts-expect-error S20 has no organization credential source.
  const organization: CredentialValue['scope'] = { layer: 'organization', organization: 'O' }
  // @ts-expect-error Local P-1r cannot start without an actual borrowed reader.
  const missing: BoundCredentialReplicaReader = {}
  const exposed: CredentialPresent = {
    present: true,
    scope: { layer: 'factory' },
    // @ts-expect-error A runtime reader cannot return the directory reference on the public read face.
    credentialRef: 'secret',
  }
  expectTypeOf(organization).toEqualTypeOf<CredentialValue['scope']>()
  expectTypeOf(missing).toEqualTypeOf<BoundCredentialReplicaReader>()
  expectTypeOf(exposed).toEqualTypeOf<CredentialPresent>()
})
