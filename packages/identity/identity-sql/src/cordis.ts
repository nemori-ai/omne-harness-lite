// The Cordis binding (DP3-C16; IC-1 to IC-3, IC-8, IC-13, IC-14): a function plugin that injects
// `storage` and `identityClock`, validates the two lifetimes, opens scrypt with the deployed
// profile, derives the decoy material, registers the identity combination, and provides
// `identityOperations` and `tenantStanding` as subclasses of the identity service definitions. One
// managed effect stops the provider and then waits for scrypt to close. The clock is the injected
// `identityClock` service (R1-D27): this member reads no wall clock.
import type { Context } from '@deepseek-ai/cordis'
import { randomBytes } from 'node:crypto'
import type { IdentityOperations, TenantStandingSource } from '@omne-harness/identity'
import {
  IdentityOperationsService,
  TenantStandingSourceService,
  identityClockKey,
} from '@omne-harness/identity/cordis'
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import { openScrypt, SCRYPT_PROFILE } from '@omne-harness/scrypt'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { constantLoginTerms, parseIdentitySqlConfig, type IdentitySqlConfig } from './config.ts'
import { identitySqlRegistration } from './materials.ts'
import { createIdentitySql } from './provider.ts'

class IdentitySqlOperationsService extends IdentityOperationsService {
  readonly registerAndActivate: IdentityOperations['registerAndActivate']
  readonly issueLogin: IdentityOperations['issueLogin']
  readonly recognizeLogin: IdentityOperations['recognizeLogin']

  constructor(ctx: Context, operations: IdentityOperations) {
    super(ctx)
    this.registerAndActivate = input => operations.registerAndActivate(input)
    this.issueLogin = input => operations.issueLogin(input)
    this.recognizeLogin = input => operations.recognizeLogin(input)
  }
}

class IdentitySqlStandingService extends TenantStandingSourceService {
  readonly read: TenantStandingSource['read']

  constructor(ctx: Context, standing: TenantStandingSource) {
    super(ctx)
    this.read = input => standing.read(input)
  }
}

const configSchema: StandardSchema<IdentitySqlConfig> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness-identity-sql',
    validate(value: unknown) {
      const judged = parseIdentitySqlConfig(value)
      if (judged.kind === 'valid') return { value: judged.config }
      return {
        issues: judged.problems.map(problem => ({ message: `${problem.field}: ${problem.rule}` })),
      }
    },
  },
}

export const IdentitySqlPlugin = definePlugin({
  name: 'identity-sql',
  Config: configSchema,
  inject: [storageKey, identityClockKey],
  async apply(ctx, config) {
    const judged = parseIdentitySqlConfig(config)
    if (judged.kind !== 'valid') throw new Error('identity-sql configuration rejected')
    const storage = ctx.storage
    const clock = ctx.identityClock
    const opened = openScrypt(SCRYPT_PROFILE)
    if (!opened.ok) throw new Error(`scrypt profile rejected: ${opened.code}`)
    const scrypt = opened.module
    const fail = async (message: string): Promise<never> => {
      await scrypt.close()
      throw new Error(message)
    }
    // The decoy: a random secret derived once, kept in memory only (DP3-C6).
    const decoy = scrypt.derive(randomBytes(32).toString('base64url'), () => ({ ok: true }))
    if (!('done' in decoy)) return fail(`decoy-derive-failed:${decoy.code}`)
    const derived = await decoy.done
    if (derived.code !== 'material') return fail(`decoy-derive-failed:${derived.code}`)
    const registered = await storage.registerCombination(identitySqlRegistration())
    if (registered.kind !== 'registered')
      return fail(
        `identity combination not registered: ${registered.kind}${
          registered.kind === 'rejected_before_accept' ? `/${registered.reason}` : ''
        }`,
      )
    const provider = createIdentitySql({
      storage,
      clock,
      terms: constantLoginTerms(judged.terms),
      scrypt,
      decoyMaterial: derived.material,
    })
    new IdentitySqlOperationsService(ctx, provider.operations)
    new IdentitySqlStandingService(ctx, provider.standing)
    // One effect, so the order holds: stop new calls first, then wait for scrypt to finish.
    ctx.effect(() => async () => {
      provider.stop()
      await scrypt.close()
    })
  },
})
