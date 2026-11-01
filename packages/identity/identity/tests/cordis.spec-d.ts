import type { Context } from '@deepseek-ai/cordis'
import { expectTypeOf } from 'vitest'
import type {
  IdentityOperations,
  PrincipalIssuer,
  PrincipalVerifier,
  TenantStandingSource,
} from '@omne-harness/identity'
import {
  IdentityOperationsService,
  PrincipalIssuerService,
  PrincipalVerifierService,
  TenantStandingSourceService,
  identityOperationsKey,
  principalIssuerKey,
  principalVerifierKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'

expectTypeOf<IdentityOperationsService['registerAndActivate']>().toEqualTypeOf<
  IdentityOperations['registerAndActivate']
>()
expectTypeOf<IdentityOperationsService['issueLogin']>().toEqualTypeOf<
  IdentityOperations['issueLogin']
>()
expectTypeOf<IdentityOperationsService['recognizeLogin']>().toEqualTypeOf<
  IdentityOperations['recognizeLogin']
>()
expectTypeOf<TenantStandingSourceService['read']>().toEqualTypeOf<TenantStandingSource['read']>()
expectTypeOf<PrincipalVerifierService['verify']>().toEqualTypeOf<PrincipalVerifier['verify']>()
expectTypeOf<PrincipalIssuerService['issueSystem']>().toEqualTypeOf<
  PrincipalIssuer['issueSystem']
>()
expectTypeOf<PrincipalIssuerService['issueActingForTenant']>().toEqualTypeOf<
  PrincipalIssuer['issueActingForTenant']
>()

declare const ctx: Context
expectTypeOf(ctx[identityOperationsKey]).toEqualTypeOf<IdentityOperationsService>()
expectTypeOf(ctx[tenantStandingKey]).toEqualTypeOf<TenantStandingSourceService>()
expectTypeOf(ctx[principalVerifierKey]).toEqualTypeOf<PrincipalVerifierService>()
expectTypeOf(ctx[principalIssuerKey]).toEqualTypeOf<PrincipalIssuerService>()
// @ts-expect-error the issuer is not a verifier
const wrongVerifier: PrincipalVerifier = ctx[principalIssuerKey]
// @ts-expect-error a login result remains asynchronous
const wrongLogin: IdentityOperationsService['issueLogin'] = () => ({ kind: 'uniform-auth-failure' })
// @ts-expect-error definitions need a concrete provider
new PrincipalIssuerService(ctx)
void wrongVerifier
void wrongLogin
