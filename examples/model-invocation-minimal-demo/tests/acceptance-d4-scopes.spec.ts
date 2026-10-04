import sharp from 'sharp'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { type LoginsService } from '@omne-harness-lite/account-identity'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import {
  createAcceptanceApplication,
  createDemoDefaultRetryConfiguration,
  type AcceptanceConfig,
  type ModelRequestDeployment,
} from '../src/index.ts'
import {
  MODEL_CATALOG_SERVICE,
  CREDENTIAL_LOOKUP_SERVICE,
} from '@omne-harness-lite/model-profile-directory/plugin'
import type {
  ModelCatalog,
  CredentialLookup,
  ProfileRow,
} from '@omne-harness-lite/model-profile-directory'
import {
  ORGANIZATIONS_SERVICE,
  OFFERS_SERVICE,
  MEMBERSHIPS_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  type OrganizationsService,
  type OffersService,
  type MembershipsService,
} from '@omne-harness-lite/organization-governance'
import {
  createSharpImageCodec,
  modelImageBalancedV1,
  createOfficialProfileContent,
  createDeepSeekV4ProInputMeter,
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
} from '@omne-harness-lite/pi-ai-transport'
import {
  decodeModelLogKey,
  openRouterCredentialRedactionConfig,
} from '@omne-harness-lite/model-request-runtime-local'
import { judgeMessage } from '@omne-harness-lite/messages'
import { actor, ref, duration, activateModelFixture } from './support.ts'
import { ROOT, publication, demoRetirement } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'

const model = deepseekV4Pro0813Definition
const evidence = resolve(import.meta.dirname, '../../../tmp/d4-acceptance')
function official() {
  const result = createOfficialProfileContent(model, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: deepseekV4Pro0813Configuration,
  })
  if ('rejected' in result) throw Error('official profile invalid')
  return result.ok
}
function realService<T>(value: unknown, functions: readonly string[]): T {
  if (
    !value ||
    typeof value !== 'object' ||
    functions.some(name => !(name in value) || typeof Reflect.get(value, name) !== 'function')
  )
    throw Error('actual service interface absent')
  return value as T
}
function profile(result: ProfileRow | { readonly failure: string }): ProfileRow {
  if ('failure' in result) throw Error(JSON.stringify(result))
  return result
}
async function deployment(label: string): Promise<AcceptanceConfig> {
  await mkdir(evidence, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(evidence, `${label}-`)),
    activation = generateHandoffKeyPair(),
    purge = generateHandoffKeyPair()
  const keys = {
    activationSigning: join(dir, 'activation.pem'),
    activationVerification: join(dir, 'activation-public.pem'),
    purgeSigning: join(dir, 'purge.pem'),
    purgeVerification: join(dir, 'purge-public.pem'),
    modelReplica: join(dir, 'model-key'),
  }
  for (const [file, bytes] of [
    [keys.activationSigning, activation.privateKeyPem],
    [keys.activationVerification, activation.publicKeyPem],
    [keys.purgeSigning, purge.privateKeyPem],
    [keys.purgeVerification, purge.publicKeyPem],
    [keys.modelReplica, randomBytes(32)],
  ] as const)
    await writeFile(file, bytes, { mode: 0o600, flag: 'wx' })
  return {
    runId: label,
    databaseFile: join(dir, 'db.sqlite'),
    keys,
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: duration(60000) },
    governance: {
      invitationTtlDefault: duration(60000),
      affiliationRequestTtlDefault: duration(60000),
      teamCreationKeyRetention: duration(60000),
    },
    officialManifest: { ordinal: 1, entries: [official()] },
    wait: {
      clockTimeoutMs: 15000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint()) / 1000000,
      sleep: async ms => {
        await new Promise<void>(r => setTimeout(r, ms))
      },
    },
  }
}
async function callConfig(
  label: string,
): Promise<AcceptanceConfig & { modelRequest: ModelRequestDeployment }> {
  const base = await deployment(label),
    dir = resolve(base.databaseFile, '../logs')
  await mkdir(dir, { mode: 0o700 })
  const credentialRedaction = openRouterCredentialRedactionConfig
  let publicationOrdinal = 0
  return {
    ...base,
    sessionLog: {
      dir,
      processOwnership: {
        current: label,
        async observeExit() {
          return 'unknown'
        },
      },
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
    },
    modelRequest: {
      maxScopes: 64,
      acknowledgementCleanup: { next: () => ({ stop: true }) },
      callReferences: {
        maxScopes: 64,
        content: { maxConcurrentWrites: 4, maxContentBytes: 16 * 1024 * 1024 },
      },
      tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
      defaultRetry: createDemoDefaultRetryConfiguration(),
      registryPolicy: { maxRetries: 2, maxInFlight: 8 },
      evaluationInputs: {
        storeKey: label,
        deployedOfficial: [{ capability: ROOT, meta: false }],
        monotonicNow: () => process.hrtime.bigint(),
        async prepare(who) {
          const expectedRevision = publicationOrdinal === 0 ? null : String(publicationOrdinal)
          publicationOrdinal++
          return {
            publication: publication(who, expectedRevision),
            recipe: { rootDefinition: ROOT },
          }
        },
      },
      transport: {
        imagePreparation: { policy: modelImageBalancedV1, codec: createSharpImageCodec(sharp) },
        definitions: [model],
        inputMeters: [createDeepSeekV4ProInputMeter(model)],
        policy: {
          maxConnections: 2,
          idleConnectionTimeoutMs: 5000,
          connectTimeoutMs: 5000,
          maxErrorBodyBytes: 8192,
          maxSseEventBytes: 65536,
          credentialRedaction,
        },
        retirement: demoRetirement(),
      },
      invocation: {
        now: () => '2026-09-29T00:00:00Z',
        firstContentTimeoutMs: 15000,
        idleContentTimeoutMs: 120000,
        schedule(ms, callback) {
          const timer = setTimeout(callback, ms)
          return () => clearTimeout(timer)
        },
        statusCauseTable: { '503': 'upstream_unavailable' },
        credentialRedaction,
      },
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 5000 },
      settlement: {
        contention: {
          name: 'd4-explicit-contention',
          limits: { submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 },
          decide() {
            return { proceed: { waitMs: 0 } }
          },
        },
        scheduler: {
          nowMonotonicMs: () => Number(process.hrtime.bigint() / 1000000n),
          wait(_ms, signal) {
            return {
              completion: Promise.resolve(signal.aborted ? 'cancelled' : 'elapsed'),
              stopped: Promise.resolve(),
              requestStop() {},
            }
          },
        },
      },
    },
  }
}

describe('D4 independent real tenant and directory providers', () => {
  it('D4-E organization and tenant custom scopes retain independent configuration history; actual membership removal revokes access', async () => {
    const config = await deployment('scope-history')
    let logins: LoginsService | undefined
    let catalog: ModelCatalog | undefined,
      organizations: OrganizationsService | undefined,
      offers: OffersService | undefined,
      memberships: MembershipsService | undefined,
      lookup: CredentialLookup | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'requestPreparation',
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (!['accountIdentity', 'governance', 'directory', 'lookup'].includes(name)) return
          await fiber
          if (name === 'accountIdentity')
            logins = realService(fiber.ctx.get(LOGINS_SERVICE), ['verify', 'revoke'])
          if (name === 'directory')
            catalog = realService(fiber.ctx.get(MODEL_CATALOG_SERVICE), [
              'registerProfile',
              'updateProfile',
              'withdrawProfile',
              'readProfile',
            ])
          if (name === 'lookup')
            lookup = realService(fiber.ctx.get(CREDENTIAL_LOOKUP_SERVICE), ['value'])
          if (name === 'governance') {
            organizations = realService(fiber.ctx.get(ORGANIZATIONS_SERVICE), ['createTeam'])
            offers = realService(fiber.ctx.get(OFFERS_SERVICE), [
              'issueInvitation',
              'acceptInvitation',
            ])
            memberships = realService(fiber.ctx.get(MEMBERSHIPS_SERVICE), [
              'remove',
              'switchCurrentTenant',
            ])
          }
        },
      },
    })
    try {
      await app.ready
      if (!catalog || !organizations || !offers || !memberships || !lookup || !logins)
        throw Error('actual providers absent')
      const owner = await actor(app, 'd4-admin'),
        other = await actor(app, 'd4-member'),
        outsider = await actor(app, 'd4-outsider')
      const created = await organizations.createTeam(owner.account)
      if ('failure' in created) throw Error(JSON.stringify(created))
      const team = created.ok
      const invitation = await offers.issueInvitation(team.tenant, other.account, 'member')
      if ('failure' in invitation) throw Error(JSON.stringify(invitation))
      const joined = await offers.acceptInvitation(other.account, invitation.ok)
      if ('failure' in joined) throw Error(JSON.stringify(joined))
      const member = joined.ok
      const base = { ...official(), origin: 'custom' as const }
      const orgRow = profile(
        await catalog.registerProfile(
          team.tenant,
          { layer: 'organization', organization: team.organization },
          base,
        ),
      )
      const tenantRow = profile(
        await catalog.registerProfile(
          member,
          { layer: 'tenant', tenant: member },
          {
            ...base,
            adaptation: {
              ...base.adaptation,
              configuration: {
                revision: 'tenant-cfg',
                values: base.adaptation.configuration.values,
              },
            },
          },
        ),
      )
      expect(profile(await catalog.readProfile(member, orgRow.ref)).ref).toEqual(orgRow.ref)
      expect(await catalog.readProfile(outsider.tenant, orgRow.ref)).toEqual({
        failure: 'notAuthorized',
      })
      expect(await catalog.readProfile(team.tenant, tenantRow.ref)).toEqual({
        failure: 'notAuthorized',
      })
      expect(
        await catalog.updateProfile(member, orgRow.ref, {
          replace: { providers: ['deepinfra/fp8'] },
        }),
      ).toEqual({ failure: 'notAuthorized' })
      const revised = profile(
        await catalog.updateProfile(member, tenantRow.ref, {
          replace: {
            adaptation: {
              ...base.adaptation,
              configuration: {
                revision: 'tenant-cfg-next',
                values: base.adaptation.configuration.values,
              },
            },
          },
        }),
      )
      expect(revised.profile.adaptation.configuration.revision).toBe('tenant-cfg-next')
      expect(profile(await catalog.readProfile(member, orgRow.ref)).profile.adaptation).toEqual(
        orgRow.profile.adaptation,
      )
      expect(
        await catalog.updateProfile(member, tenantRow.ref, {
          replace: {
            adaptation: {
              ...base.adaptation,
              configuration: {
                revision: 'tenant-cfg',
                values: { cache: { mode: 'explicit', ttl: 'changed', breakpoints: [] } },
              },
            },
          },
        }),
      ).toMatchObject({ failure: 'invalidInput' })
      expect(profile(await catalog.readProfile(member, tenantRow.ref))).toEqual(revised)
      expect(await memberships.switchCurrentTenant(other.loginState, member)).toBe('ok')
      expect(await memberships.currentTenant(other.loginState)).toEqual({ ok: member })
      const current = { ...other, tenant: member }
      expect(
        await app.publishCredential(current, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d4-team-credential'),
          body: Buffer.from('d4-controlled-secret'),
        })),
      ).toEqual({ stored: true })
      const previousCredential = await lookup.value(member, 'custom')
      if ('failure' in previousCredential) throw Error('bound credential missing')
      expect(Buffer.from(previousCredential.value).toString()).toBe('d4-controlled-secret')
      expect(
        await app.publishCredential(current, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d4-team-credential-next'),
          body: Buffer.from('d4-rotated-secret'),
        })),
      ).toEqual({ stored: true })
      const rotated = await lookup.value(member, 'custom')
      if ('failure' in rotated) throw Error('rotated credential missing')
      expect(Buffer.from(rotated.value).toString()).toBe('d4-rotated-secret')
      expect(Buffer.from(previousCredential.value).toString()).toBe('d4-controlled-secret')
      expect(await lookup.value(outsider.tenant, 'custom')).toEqual({
        failure: 'credentialUnavailable',
      })
      expect(await catalog.withdrawProfile(member, tenantRow.ref)).toEqual({
        ref: tenantRow.ref,
        registration: 'withdrawn',
      })
      expect(profile(await catalog.readProfile(member, tenantRow.ref)).profile.registration).toBe(
        'withdrawn',
      )
      expect(await memberships.remove(team.tenant, member)).toBe('ok')
      // Directory S16 reads by supplied scope chain; membership is checked at mutation/credential/application admission.
      expect(profile(await catalog.readProfile(member, orgRow.ref))).toEqual(orgRow)
      expect(await catalog.relistProfile(member, tenantRow.ref)).toEqual({
        failure: 'notAuthorized',
      })
      // Directory S20 is a trusted runtime lookup; membership revocation is enforced by application admission.
      expect(await app.readOfficialProfiles(current)).toEqual({ failure: 'membershipNotEffective' })
      let sourceCalls = 0
      expect(
        await app.publishCredential(current, async checked => {
          sourceCalls++
          return {
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref('must-not-read'),
            body: Buffer.from('must-not-read'),
          }
        }),
      ).toEqual({ failure: 'membershipNotEffective' })
      expect(sourceCalls).toBe(0)
      expect(await logins.revoke(owner.loginState, owner.loginState)).toBe('ok')
      expect(await app.readOfficialProfiles(owner)).toHaveProperty('step', 'verify')
    } finally {
      await app.close()
    }
  }, 30000)

  it('D4-H actual runtime preserves invalidInput/unavailable/success without switching definitions or publishing rejected anchors', async () => {
    const config = await callConfig('runtime-three-way')
    const tls = await createLocalTls(resolve(config.databaseFile, '../tls'))
    let catalog: ModelCatalog | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name !== 'directory') return
          await fiber
          catalog = realService(fiber.ctx.get(MODEL_CATALOG_SERVICE), [
            'registerProfile',
            'updateProfile',
          ])
        },
      },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app, 'd4-runtime')
      diagnostics = await activateModelFixture(app, who, config)
      if (!catalog) throw Error('catalog unavailable')
      const base = { ...official(), origin: 'custom' as const }
      const bad = profile(
        await catalog.registerProfile(
          who.tenant,
          { layer: 'tenant', tenant: who.tenant },
          {
            ...base,
            adaptation: {
              ...base.adaptation,
              configuration: {
                revision: 'invalid-config',
                values: { cache: { mode: 'explicit', ttl: 'bad', breakpoints: [] } },
              },
            },
          },
        ),
      )
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d4-runtime-key'),
          body: Buffer.from('d4-local-runtime-key'),
        })),
      ).toEqual({ stored: true })
      for (const phase of ['invalid', 'missing', 'ready'] as const) {
        if (phase !== 'invalid') {
          const adaptation =
            phase === 'missing'
              ? {
                  ...base.adaptation,
                  definition: { modelId: model.modelId, revision: 'absent-definition' },
                }
              : base.adaptation
          expect(
            await catalog.updateProfile(who.tenant, bad.ref, { replace: { adaptation } }),
          ).not.toHaveProperty('failure')
        }
        const prepared = await app.prepareSession(who, `d4-${phase}`)
        if (!('session' in prepared)) throw Error('session not prepared')
        expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
        expect(await app.bindModelRuntime(who, prepared.session)).toHaveProperty('service')
        expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({
          attached: true,
        })
        expect(await app.selectModel(who, prepared.session, model.modelId)).toEqual({
          selected: model.modelId,
        })
        const user = judgeMessage({
          type: 'user',
          id: `d4-${phase}-user`,
          createdAt: '2026-09-29T00:00:00Z',
          blocks: [
            {
              id: `d4-${phase}-text`,
              kind: 'text',
              text: phase,
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        if (!('ok' in user) || user.ok.type !== 'user') throw Error('user invalid')
        const result = await app.startServiceCall(who, prepared.session, {
          user: user.ok,
          parameters: { reasoningEffort: 'low', maxOutputTokens: 128 },
          host: host.host,
        })
        if (phase === 'ready') {
          expect(result).toHaveProperty('result.replyPending')
          if ('result' in result && 'replyPending' in result.result)
            expect(
              await app.persistModelReply(who, prepared.session, result.result.replyPending),
            ).toHaveProperty('settled')
          expect(tls.requests).toHaveLength(1)
        } else {
          expect(result).toEqual(
            phase === 'invalid' ? { invalidInput: { reason: 'malformed' } } : { unavailable: true },
          )
          expect(tls.requests).toHaveLength(0)
          const history = await app.readSessionLog(who, prepared.session)
          if (!('entries' in history)) throw Error('log unavailable')
          const keys = history.entries.flatMap(x => x.readKeys).map(decodeModelLogKey)
          expect(
            keys.filter(
              x => 'ok' in x && ['opened', 'dispatched', 'response', 'ended'].includes(x.ok.kind),
            ),
          ).toHaveLength(0)
        }
      }
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  }, 30000)
})
