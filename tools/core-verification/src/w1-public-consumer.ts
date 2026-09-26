// 独立 Node 消费者：只经 package exports 消费构建物，不加载产品 src 或 Vitest 转换器。
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FIBER_STATE,
  definePlugin,
  fail,
  fiberIsActive,
  isSuccess,
  resolveOptional,
  succeed,
} from '@omne-harness-lite/kernel-basis'
import { bootAssembly, settle } from '@omne-harness-lite/kernel-basis/testing'
import {
  IDENTITY_BRAND_NAMES,
  IDENTITY_TYPE_NAMES,
  OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS,
  SCHEMA_DEF_NAMES as IDENTITY_SCHEMA_DEFS,
  ORGANIZATION_KINDS,
  TENANT_ROLES,
  ancestorChain,
  generateHandoffKeyPair,
  generateOpaqueIdentifier,
  handoffWarrant,
  invalidInput,
  isOk,
  issueHandoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  ok,
  opaqueIdentifierEquals,
  parseAccountId,
  parseLoginIdentifier,
  parseLoginStateId,
  parseOpaqueIdentifier,
  parseMembershipStanding,
  parseMembershipStandingResult,
  parseOrganizationId,
  parseOrganizationKind,
  parseScopeLayerIdentity,
  parseTenantId,
  parseTenantRole,
  sameAccountDistinctTenants,
  schemaId as identitySchemaId,
  shareAncestor,
  tenantIdEquals,
  toCanonicalJson,
  unwrap,
  validate as validateIdentity,
  verifyHandoffWarrant,
} from '@omne-harness-lite/identity-values'
import {
  SCHEMA_DEF_NAMES as OFFER_SCHEMA_DEFS,
  OFFER_STATES,
  SETTLED_STATES,
  acceptable,
  addDuration,
  compareInstants,
  deriveState,
  instantFromEpochMs,
  instantFromRfc3339,
  instantToRfc3339,
  parseOfferTiming,
  parseOfferTtl,
  parseSettledState,
  schemaId as offerSchemaId,
  timingFrom,
  validate as validateOffer,
} from '@omne-harness-lite/offer-expiry'
import { testClock } from '@omne-harness-lite/offer-expiry/testing'
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  composeMigrations,
  composedMigrationName,
  mapStorageError,
} from '@omne-harness-lite/storage'
import {
  LosslessNumber,
  SCHEMA_DEF_NAMES as CONTENT_SCHEMA_DEFS,
  attachmentRefEquals,
  capabilityIdEquals,
  isCanonicalMediaType,
  isJsonNumber,
  isNonNegativeJsonInteger,
  jsonNumberSource,
  judgeContentBlock,
  modalityOf,
  readJsonStrict,
  readOpaqueJson,
  schemaId as contentSchemaId,
  toOpaqueJson,
  validate as validateContent,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'

interface ConsumerCase {
  readonly id: string
  readonly sources: readonly string[]
  run(): void | Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const negativeControl = process.argv.includes('--negative-control=outcome')
const cases: readonly ConsumerCase[] = [
  {
    id: 'w1.kernel.outcome-public',
    sources: ['realization/packages/core/kernel-basis/design.md#能力到-cordis-的投影'],
    run() {
      const success = succeed({ answer: 42 })
      const failure = fail('consumerUnavailable')
      assert.deepEqual(success, negativeControl ? { ok: { answer: 0 } } : { ok: { answer: 42 } })
      assert.deepEqual(failure, { failure: 'consumerUnavailable' })
      assert.equal(isSuccess(success), true)
      assert.equal(isSuccess(failure), false)
      assert.equal('failure' in success, false)
      assert.equal('ok' in failure, false)
    },
  },
  {
    id: 'w1.kernel.public-lifecycle',
    sources: ['realization/packages/core/kernel-basis/design.md#状态并发与失败映射'],
    async run() {
      const ctx = new Context()
      const plugin = definePlugin({
        name: 'public-config-consumer',
        Config: z.object({ ttl: z.number().positive() }),
        apply(inner, config) {
          assert.equal(fiberIsActive(inner), false)
          inner.provide('w1ConsumerValue', config.ttl)
        },
      })
      const bad = ctx.plugin(plugin, { ttl: 0 })
      try {
        await assert.rejects(async () => {
          await settle(bad)
        }, /invalid config/)
        assert.equal(bad.state, FIBER_STATE.FAILED)
        assert.equal(resolveOptional(ctx, 'w1ConsumerValue'), undefined)
        const good = ctx.plugin(plugin, { ttl: 25 })
        try {
          await settle(good)
          assert.equal(fiberIsActive(good.ctx), true)
          assert.equal(resolveOptional(good.ctx, 'w1ConsumerValue'), 25)
        } finally {
          await good.dispose()
        }
        assert.equal(fiberIsActive(good.ctx), false)
        assert.equal(resolveOptional(ctx, 'w1ConsumerValue'), undefined)
      } finally {
        await bad.dispose()
      }
    },
  },
  {
    id: 'w1.kernel.public-assembly-cleanup',
    sources: ['realization/packages/core/kernel-basis/design.md#成对的装载与撤除'],
    async run() {
      const assembly = await bootAssembly({ services: [{ name: 'w1AssemblyValue', value: 7 }] })
      assert.equal(resolveOptional(assembly.ctx, 'w1AssemblyValue'), 7)
      await assembly.dispose()
      assert.equal(resolveOptional(assembly.ctx, 'w1AssemblyValue'), undefined)
      const disposed: string[] = []
      const prior: Context[] = []
      const original = new Error('public-consumer-startup-error')
      await assert.rejects(
        bootAssembly({
          plugins: [
            {
              plugin: {
                name: 'public-first',
                apply(inner: Context) {
                  prior.push(inner)
                  inner.effect(() => () => {
                    disposed.push('first')
                  })
                },
              },
            },
            {
              plugin: {
                name: 'public-second',
                apply(inner: Context) {
                  prior.push(inner)
                  inner.effect(() => () => {
                    disposed.push('second')
                  })
                },
              },
            },
            {
              plugin: {
                name: 'public-third',
                apply() {
                  assert.equal(prior.length, 2)
                  for (const inner of prior) assert.equal(fiberIsActive(inner), true)
                  throw original
                },
              },
            },
          ],
        }),
        error => error === original,
      )
      assert.deepEqual(disposed, ['second', 'first'])
    },
  },
  {
    id: 'w1.identity.public-values',
    sources: [
      'data.identity-values/v1#S-2',
      'data.identity-values/v1#S-5',
      'data.identity-values/v1#S-7',
      'data.identity-values/v1#S-13',
    ],
    run() {
      const account = unwrap(parseAccountId('acc-consumer'))
      const organization = unwrap(parseOrganizationId('org-consumer'))
      const tenant = unwrap(parseTenantId({ account, organization }))
      const same = unwrap(parseTenantId({ organization, account }))
      const other = unwrap(parseTenantId({ organization: 'org-other', account }))
      assert.equal(tenantIdEquals(tenant, same), true)
      assert.equal(tenantIdEquals(tenant, other), false)
      assert.equal(sameAccountDistinctTenants(tenant, other), true)
      assert.equal(
        toCanonicalJson(tenant),
        '{"organization":"org-consumer","account":"acc-consumer"}',
      )
      assert.equal(isOk(parseLoginIdentifier('reader@example.invalid')), true)
      assert.equal(isOk(parseLoginStateId('login-consumer')), true)
      assert.equal(unwrap(parseOpaqueIdentifier('custom', 'ConsumerId')), 'custom')
      assert.equal(opaqueIdentifierEquals(account, unwrap(parseAccountId('acc-consumer'))), true)
      assert.match(generateOpaqueIdentifier(), /^[a-z2-7]{26}$/)
      // 概率生成的样本词法不支持部署内唯一性的结论。
    },
  },
  {
    id: 'w1.identity.in-band-closed-input',
    sources: [
      'data.identity-values/v1#S-10',
      'data.identity-values/v1#S-11',
      'data.identity-values/v1#S-12',
      'data.identity-values/v1#S-31',
      'data.identity-values/v1#S-32',
      'data.identity-values/v1#S-33',
    ],
    run() {
      for (const input of [undefined, null, '', ' acc', 'acc\n', '\ufeffacc']) {
        const result = parseAccountId(input)
        assert.equal(isOk(result), false)
        assert.equal('invalidInput' in result, true)
        assert.equal('failure' in result, false)
      }
      assert.equal(isOk(parseAccountId('acc\u200b')), true)
      assert.equal(isOk(parseOrganizationKind('other')), false)
      assert.equal(isOk(parseTenantRole('platformAdministrator')), false)
      assert.equal(isOk(parseTenantId({ organization: 'org' })), false)
      assert.equal(
        isOk(parseTenantId({ organization: 'org', account: 'acc', role: 'member' })),
        false,
      )
      assert.equal(isOk(parseScopeLayerIdentity({ layer: 'session', session: 's' })), false)
      assert.equal(isOk(parseMembershipStandingResult({ standing: 'effective' })), false)
      assert.deepEqual(unwrap(parseMembershipStanding({ standing: 'effective', role: 'member' })), {
        standing: 'effective',
        role: 'member',
      })
      assert.deepEqual(ORGANIZATION_KINDS, ['personal', 'team'])
      assert.deepEqual(TENANT_ROLES, ['superAdministrator', 'member'])
      assert.deepEqual(unwrap(parseMembershipStandingResult({ failure: 'unavailable' })), {
        failure: 'unavailable',
      })
      assert.deepEqual(unwrap(parseMembershipStandingResult({ standing: 'ineffective' })), {
        standing: 'ineffective',
      })
      assert.equal(
        validateIdentity('TenantId', { organization: 'org', account: 'acc' }).valid,
        true,
      )
      assert.equal(validateIdentity('TenantId', { organization: 'org' }).valid, false)
      assert.equal(isOk(ok(1)), true)
      const rejected = invalidInput('fixture-invalid')
      assert.equal(isOk(rejected), false)
      assert.throws(() => unwrap(rejected), /fixture-invalid/)
      assert.deepEqual(IDENTITY_BRAND_NAMES, ['AccountId', 'OrganizationId', 'LoginStateId'])
      assert.deepEqual(IDENTITY_TYPE_NAMES, [
        'AccountId',
        'OrganizationId',
        'LoginStateId',
        'TenantId',
        'ScopeLayerIdentity',
      ])
      assert.equal(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS.length, 26)
      assert.equal(Object.isFrozen(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS), true)
    },
  },
  {
    id: 'w1.identity.public-parent-snapshot',
    sources: ['data.identity-values/v1#S-14', 'data.identity-values/v1#S-15'],
    run() {
      const leaf = unwrap(parseOrganizationId('leaf'))
      const root = unwrap(parseOrganizationId('root'))
      assert.deepEqual(
        ancestorChain(leaf, id => (id === leaf ? root : null)),
        { ok: [root] },
      )
      assert.deepEqual(
        shareAncestor(leaf, root, id => (id === leaf ? root : null)),
        { ok: true },
      )
      assert.deepEqual(
        ancestorChain(leaf, () => 'unavailable'),
        { failure: 'unavailable' },
      )
      assert.deepEqual(
        ancestorChain(leaf, () => leaf),
        { failure: 'cycle' },
      )
    },
  },
  {
    id: 'w1.identity.public-warrant',
    sources: ['data.identity-values/v1#S-35'],
    run() {
      const keys = generateHandoffKeyPair()
      const signer = unwrap(loadSigningKey(keys.privateKeyPem))
      const verifier = unwrap(loadVerificationKey(keys.publicKeyPem))
      const wrongKeys = generateHandoffKeyPair()
      const wrongVerifier = unwrap(loadVerificationKey(wrongKeys.publicKeyPem))
      const account = unwrap(parseAccountId('warrant-account'))
      const other = unwrap(parseAccountId('warrant-other'))
      const warrant = issueHandoffWarrant(signer, 'activation', account)
      assert.equal(unwrap(handoffWarrant.parse(warrant)), warrant)
      assert.equal(
        handoffWarrant.verify(
          verifier,
          'activation',
          account,
          handoffWarrant.issue(signer, 'activation', account),
        ),
        'ok',
      )
      assert.equal(verifyHandoffWarrant(verifier, 'activation', account, warrant), 'ok')
      assert.equal(verifyHandoffWarrant(verifier, 'activation', account, warrant), 'ok')
      for (const result of [
        verifyHandoffWarrant(wrongVerifier, 'activation', account, warrant),
        verifyHandoffWarrant(verifier, 'purge', account, warrant),
        verifyHandoffWarrant(verifier, 'activation', other, warrant),
        verifyHandoffWarrant(verifier, 'activation', account, undefined),
        verifyHandoffWarrant(verifier, 'activation', account, 'handmade'),
      ])
        assert.equal(result, 'invalid')
      // 只测原语；重放的领域守卫、密钥保管和装配配对不由这份消费者证明。
    },
  },
  {
    id: 'w1.offer.public-time-shape',
    sources: ['data.offer-expiry/v1#S-4', 'data.offer-expiry/v1#S-14', 'data.offer-expiry/v1#S-22'],
    run() {
      const utc = unwrap(instantFromRfc3339('2026-09-22T09:00:00Z'))
      const offset = unwrap(instantFromRfc3339('2026-09-22T17:00:00+08:00'))
      assert.equal(compareInstants(utc, offset), 0)
      assert.equal(instantToRfc3339(offset), '2026-09-22T09:00:00.000Z')
      assert.equal(unwrap(instantFromEpochMs(utc)), utc)
      const duration = unwrap(parseOfferTtl('PT1S'))
      assert.equal(addDuration(utc, duration), utc + 1_000)
      assert.deepEqual(unwrap(timingFrom(utc, duration)), { issuedAt: utc, expiresAt: utc + 1_000 })
      for (const input of [0, -1, NaN, Infinity, undefined, 'P1M', 'bad'])
        assert.equal(isOk(parseOfferTtl(input)), false)
      const equal = { issuedAt: '2026-09-22T09:00:00Z', expiresAt: '2026-09-22T09:00:00Z' }
      assert.equal(validateOffer('OfferTiming', equal).valid, true)
      assert.equal(isOk(parseOfferTiming(equal)), false)
      assert.equal(isOk(parseSettledState('expired')), false)
      assert.deepEqual(SETTLED_STATES, ['accepted', 'withdrawn'])
      assert.deepEqual(OFFER_STATES, ['pending', 'accepted', 'withdrawn', 'expired'])
    },
  },
  {
    id: 'w1.offer.public-evaluation-order',
    sources: ['data.offer-expiry/v1#S-8', 'data.offer-expiry/v1#S-13', 'data.offer-expiry/v1#S-20'],
    run() {
      const start = unwrap(instantFromEpochMs(1_000))
      const ttl = unwrap(parseOfferTtl(1_000))
      const timing = unwrap(timingFrom(start, ttl))
      const clock = testClock(start)
      clock.advance(1_000)
      assert.equal(
        deriveState({ timing, settled: null, now: clock.now(), target: 'exists' }),
        'pending',
      )
      clock.advance(1)
      assert.equal(
        deriveState({ timing, settled: null, now: clock.now(), target: 'exists' }),
        'expired',
      )
      assert.equal(deriveState({ timing, settled: null, now: start, target: 'absent' }), 'expired')
      assert.equal(
        deriveState({ timing, settled: null, now: clock.now(), target: 'unavailable' }),
        'unavailable',
      )
      clock.setUnavailable(true)
      assert.equal(
        deriveState({ timing, settled: null, now: clock.now(), target: 'absent' }),
        'unavailable',
      )
      assert.equal(
        deriveState({ timing, settled: 'withdrawn', now: clock.now(), target: 'unavailable' }),
        'withdrawn',
      )
      assert.equal(
        deriveState({ timing, settled: 'accepted', now: clock.now(), target: 'absent' }),
        'accepted',
      )
      assert.equal(acceptable('pending'), true)
      for (const state of ['expired', 'withdrawn', 'accepted'] as const)
        assert.equal(acceptable(state), false)
      assert.throws(() => clock.advance(-1), RangeError)
      clock.setUnavailable(false)
      assert.equal(clock.now(), clock.current)
    },
  },
  {
    id: 'w1.storage.exception-dependencies',
    sources: ['realization/packages/core/storage/design.md#状态并发与失败映射'],
    run() {
      const cause = new Error('consumer-cause')
      const transient = new StorageUnavailable('offline', { cause })
      assert.equal(transient.cause, cause)
      assert.deepEqual(mapStorageError(transient, 'consumerUnavailable'), {
        failure: 'consumerUnavailable',
      })
      const errors: readonly unknown[] = [
        new UniqueViolation('consumer_unique', { cause }),
        new ReferenceViolation('missing-target', { cause }),
        new ReferenceViolation('delete-restricted', { cause }),
        new StorageDefect('defect', { cause }),
        cause,
        null,
        'foreign-error',
      ]
      for (const error of errors) {
        let thrown: unknown = Symbol('not-thrown')
        try {
          mapStorageError(error, 'consumerUnavailable')
        } catch (observed) {
          thrown = observed
        }
        assert.equal(thrown, error)
      }
      assert.equal(new UniqueViolation('consumer_unique').constraint, 'consumer_unique')
      assert.equal(new ReferenceViolation('delete-restricted').kind, 'delete-restricted')
      assert.equal(new StorageDefect('defect').name, 'StorageDefect')
    },
  },
  {
    id: 'w1.storage.public-migrations',
    sources: [
      'realization/packages/core/storage/design.md#表结构不在协议里由装配层迁移建立两节点同一约束域',
    ],
    async run() {
      const first = { name: 'consumer_one', migration: { async up() {} } }
      const second = { name: 'consumer_two', migration: { async up() {} } }
      assert.equal(composedMigrationName(1, first), '0001_consumer_one')
      const provider = composeMigrations([first, second])
      const migrations = await provider.getMigrations()
      assert.equal(migrations['0001_consumer_one'], first.migration)
      assert.equal(migrations['0002_consumer_two'], second.migration)
      assert.throws(() => composeMigrations([first, first]), /duplicate migration fragment/)
    },
  },
  {
    id: 'w1.content.public-lossless-json',
    sources: [
      'data.content-blocks/v1#S-12',
      'data.content-blocks/v1#S-24',
      'content-blocks/V-11-module',
    ],
    run() {
      for (const source of [
        '9007199254740993',
        '12345678901234567890',
        '0.10000000000000000001',
        '1.10',
        '-0',
        '1e400',
      ]) {
        const result = readJsonStrict(source)
        assert.ok('ok' in result)
        assert.ok(isJsonNumber(result.ok))
        assert.equal(jsonNumberSource(result.ok), source)
        assert.equal(writeJsonLossless(result.ok), source)
      }
      for (const source of [
        String.raw`{"a":1,"\u0061":2}`,
        '{"nested":{"__proto__":1,"__proto__":2}}',
      ]) {
        assert.deepEqual(readJsonStrict(source), { failed: 'duplicate_member' })
      }
      assert.deepEqual(readJsonStrict('{'), { failed: 'syntax' })
      assert.equal(
        writeJsonLossless(toOpaqueJson({ n: new LosslessNumber('9007199254740993'), value: null })),
        '{"n":9007199254740993,"value":null}',
      )
      assert.deepEqual(readOpaqueJson(toOpaqueJson(null)), null)
      assert.equal(isNonNegativeJsonInteger(new LosslessNumber('1e400')), true)
      assert.equal(isNonNegativeJsonInteger(new LosslessNumber('0.1')), false)
      assert.throws(() => writeJsonLossless({ illegal: undefined }), TypeError)
    },
  },
  {
    id: 'w1.content.public-block-judgment',
    sources: [
      'data.content-blocks/v1#S-12',
      'data.content-blocks/v1#S-13',
      'data.content-blocks/v1#S-24',
      'data.content-blocks/v1#S-26',
      'data.content-blocks/v1#S-27',
    ],
    run() {
      const source =
        '{"id":"b","kind":"tool_call","visibility":{"toHuman":true,"toModel":true},"complete":true,"callId":"c","tool":"read_file","arguments":{"n":12345678901234567890}}'
      const read = readJsonStrict(source)
      assert.ok('ok' in read)
      const judged = judgeContentBlock(read.ok)
      assert.ok('ok' in judged)
      assert.equal(writeJsonLossless(judged.ok), source)
      assert.equal(Object.isFrozen(judged.ok), true)
      assert.deepEqual(judgeContentBlock({ id: 'b', kind: 'unknown' }), {
        rejected: 'kind_unknown',
      })
      const bad = { id: 'b', kind: 'text', text: 'x' }
      assert.deepEqual(judgeContentBlock(bad), { rejected: 'visibility_missing' })
      assert.deepEqual(bad, { id: 'b', kind: 'text', text: 'x' })
      const incomplete = {
        id: 'b',
        kind: 'tool_call',
        complete: false,
        visibility: { toHuman: false, toModel: false },
        rawArguments: '{"unfinished":',
      }
      const retained = judgeContentBlock(incomplete)
      assert.ok('ok' in retained)
      assert.equal(writeJsonLossless(retained.ok), JSON.stringify(incomplete))
      assert.deepEqual(
        judgeContentBlock({ ...incomplete, visibility: { toHuman: true, toModel: false } }),
        { rejected: 'incomplete_call_visible' },
      )
      // 不定义任何参数解析点；只验证已给 rawArguments 的值原样保留。
    },
  },
  {
    id: 'w1.content.public-metadata-meaning',
    sources: [
      'data.content-blocks/v1#S-6',
      'data.content-blocks/v1#S-7',
      'data.content-blocks/v1#S-20',
      'data.content-blocks/v1#S-21',
    ],
    run() {
      assert.equal(isCanonicalMediaType('image/png'), true)
      assert.equal(isCanonicalMediaType('Image/PNG'), false)
      assert.equal(modalityOf('text/plain;charset=UTF-8'), 'text')
      assert.equal(modalityOf('application/pdf'), undefined)
      assert.equal(
        capabilityIdEquals({ category: 'tool', name: 'one' }, { category: 'skill', name: 'one' }),
        false,
      )
      assert.equal(
        capabilityIdEquals({ category: 'tool', name: 'one' }, { category: 'tool', name: 'one' }),
        true,
      )
      assert.equal(
        attachmentRefEquals(
          { storage: 's', key: 'k', mediaType: 'text/plain' },
          { storage: 's', key: 'k', mediaType: 'image/png' },
        ),
        true,
      )
      assert.equal(
        validateContent('AttachmentRef', {
          storage: 's',
          key: 'k',
          mediaType: 'application/pdf',
          bytes: new LosslessNumber('9007199254740993'),
        }).valid,
        true,
      )
      assert.equal(
        validateContent('AttachmentRef', {
          storage: 's',
          key: 'k',
          mediaType: 'application/pdf',
          bytes: new LosslessNumber('-1'),
        }).valid,
        false,
      )
    },
  },
]

const packageNames = [
  'kernel-basis',
  'identity-values',
  'offer-expiry',
  'storage',
  'content-blocks',
] as const
const resolution = []
for (const name of packageNames) {
  const specifier = `@omne-harness-lite/${name}`
  const url = new URL(import.meta.resolve(specifier))
  assert.ok(
    url.pathname.endsWith(`/packages/core/${name}/dist/index.js`),
    `${specifier} must resolve to built dist`,
  )
  const bytes = await readFile(url)
  resolution.push({
    specifier,
    file: fileURLToPath(url),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  // 未获公开的内部路径应由 Node exports 阻止，不绕过为消费者追加访问面。
  await assert.rejects(import(`${specifier}/src/index.ts`), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  })
}
const schemas = []
for (const name of ['identity-values', 'offer-expiry', 'content-blocks']) {
  const specifier = `@omne-harness-lite/${name}/schema`
  const url = new URL(import.meta.resolve(specifier))
  const loaded: unknown = (await import(specifier, { with: { type: 'json' } })).default
  assert.ok(isRecord(loaded))
  assert.ok(isRecord(loaded.$defs))
  const id =
    name === 'identity-values'
      ? identitySchemaId
      : name === 'offer-expiry'
        ? offerSchemaId
        : contentSchemaId
  const definitions =
    name === 'identity-values'
      ? IDENTITY_SCHEMA_DEFS
      : name === 'offer-expiry'
        ? OFFER_SCHEMA_DEFS
        : CONTENT_SCHEMA_DEFS
  assert.equal(loaded.$id, id)
  assert.deepEqual([...definitions].sort(), Object.keys(loaded.$defs).sort())
  const bytes = await readFile(url)
  schemas.push({ specifier, sha256: createHash('sha256').update(bytes).digest('hex') })
}

const results = []
for (const scenario of cases) {
  try {
    await scenario.run()
    results.push({ id: scenario.id, sources: scenario.sources, status: 'passed' })
  } catch (error) {
    results.push({
      id: scenario.id,
      sources: scenario.sources,
      status: 'failed',
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'non-error', message: String(error) },
    })
  }
}
const ownBytes = await readFile(new URL(import.meta.url))
const report = {
  consumerArtifact: {
    file: fileURLToPath(import.meta.url),
    sha256: createHash('sha256').update(ownBytes).digest('hex'),
  },
  format: 1,
  nodeVersion: process.version,
  negativeControl,
  resolution,
  schemas,
  cases: results,
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n')
if (results.some(result => result.status !== 'passed')) process.exitCode = 1
