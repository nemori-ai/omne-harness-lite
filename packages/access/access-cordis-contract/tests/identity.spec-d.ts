import { expectTypeOf, test } from 'vitest'
import type {
  AccessIdentity,
  ActForResult,
  IdentityFailure,
  LoginIdentity,
  LoginResult,
  Principal,
} from '@omne-harness/access-cordis-contract'

test('a failure is denied or basis-unavailable, nothing else', () => {
  expectTypeOf<IdentityFailure['outcome']>().toEqualTypeOf<'denied' | 'basis-unavailable'>()
  // @ts-expect-error an identity failure has no third kind
  const other: IdentityFailure = { outcome: 'unknown' }
  void other
})

test('identifyLogin takes the proof text and gives a login or a failure', () => {
  expectTypeOf<AccessIdentity['identifyLogin']>().parameters.toEqualTypeOf<[proof: string]>()
  expectTypeOf<AccessIdentity['identifyLogin']>().returns.toEqualTypeOf<Promise<LoginResult>>()
  expectTypeOf<LoginResult>().toEqualTypeOf<
    { readonly outcome: 'identified'; readonly login: LoginIdentity } | IdentityFailure
  >()
})

test('actFor takes the login and the tenant header text and gives a principal or a failure', () => {
  expectTypeOf<AccessIdentity['actFor']>().parameters.toEqualTypeOf<
    [login: LoginIdentity, tenant: string]
  >()
  expectTypeOf<AccessIdentity['actFor']>().returns.toEqualTypeOf<Promise<ActForResult>>()
  expectTypeOf<ActForResult>().toEqualTypeOf<
    { readonly outcome: 'issued'; readonly principal: Principal } | IdentityFailure
  >()
})

test('reportAccess takes the login and settles with nothing', () => {
  expectTypeOf<AccessIdentity['reportAccess']>().parameters.toEqualTypeOf<[login: LoginIdentity]>()
  expectTypeOf<AccessIdentity['reportAccess']>().returns.toEqualTypeOf<Promise<void>>()
})

test('a principal is not a login and a plain object is neither', () => {
  expectTypeOf<Principal>().not.toEqualTypeOf<LoginIdentity>()
  // @ts-expect-error only an implementation of the identity port creates a login
  const forged: LoginIdentity = {}
  void forged
})
