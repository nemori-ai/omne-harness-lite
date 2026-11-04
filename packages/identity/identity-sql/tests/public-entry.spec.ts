// The public entries: what the root exports, what `./cordis` exports, and that the root loads
// without Cordis (IC-4). The materials: one participant over ten tables, the published migration
// 001 kept byte for byte, the migration 002 after it, and four read handlers. The configuration:
// two lifetimes, and two invitation durations with their initial values.
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import * as root from '@omne-harness/identity-sql'
import * as cordis from '@omne-harness/identity-sql/cordis'
import { identityCatalog } from './fixtures/storage.ts'

it('exports the factory, the materials, the names and the configuration helpers from the root', () => {
  expect(Object.keys(root).sort()).toEqual(
    [
      'CREDENTIAL_UTF8_LIMIT',
      'IDENTITY_DOMAIN',
      'IDENTITY_PARTICIPANT',
      'IDENTITY_SCOPE',
      'IDENTITY_SQL_DEFAULT_CONFIG',
      'LOGIN_IDENTIFIER_UTF8_LIMIT',
      'constantInvitationTerms',
      'constantLoginTerms',
      'createIdentitySql',
      'identitySqlCombination',
      'identitySqlMaterials',
      'identitySqlRegistration',
      'parseIdentitySqlConfig',
      'randomIdentifiers',
    ].sort(),
  )
  expect(root.IDENTITY_PARTICIPANT).toBe('identity')
  expect(root.IDENTITY_DOMAIN).toBe('system.identity')
  expect(root.IDENTITY_SCOPE).toEqual({ kind: 'system' })
  expect(root.LOGIN_IDENTIFIER_UTF8_LIMIT).toBe(1024)
  expect(root.CREDENTIAL_UTF8_LIMIT).toBe(4096)
  // The first values, for a deployment that passes them: P-10 (R2-D204) gives an invitation 7 days
  // unless the issuer asks for at most 30.
  expect(root.IDENTITY_SQL_DEFAULT_CONFIG).toEqual({
    maxLifetime: 'PT2592000S',
    idlePeriod: 'PT604800S',
    invitationDefaultDuration: 'PT604800S',
    invitationMaxDuration: 'PT2592000S',
  })
})

it('exports only the plugin from ./cordis', () => {
  expect(Object.keys(cordis)).toEqual(['IdentitySqlPlugin'])
  expect(cordis.IdentitySqlPlugin.inject).toEqual(['storage', 'identityClock'])
  expect(cordis.IdentitySqlPlugin.name).toBe('identity-sql')
})

it('describes one participant, two migrations and four snapshot read handlers', () => {
  const materials = root.identitySqlMaterials()
  expect(materials.participants.map(item => item.participant)).toEqual(['identity'])
  expect(materials.participants[0]?.grouping).toBe('singleton')
  expect(materials.participants[0]?.ownedTables).toEqual([
    'id_account',
    'id_credential',
    'id_organization',
    'id_tenant',
    'id_membership',
    'id_login',
    'id_organization_profile',
    'id_invitation',
    'id_create_receipt',
    'id_login_revocation',
  ])
  expect(
    materials.migrations.map(item => ({
      migration: `${item.owner}/${item.id}`,
      requires: item.requires.map(entry => `${entry.owner}/${entry.id}`),
    })),
  ).toEqual([
    { migration: 'identity/001-identity', requires: [] },
    { migration: 'identity/002-governance', requires: ['identity/001-identity'] },
  ])
  const handlers = Object.fromEntries(materials.readHandlers.map(item => [item.handler, item]))
  expect(Object.keys(handlers).sort()).toEqual([
    'identity.governance',
    'identity.issue-basis',
    'identity.login-by-proof',
    'identity.standing',
  ])
  const migrationsOf = (name: string) =>
    handlers[name]?.requiresMigrations.map(entry => entry.id) ?? []
  expect(migrationsOf('identity.issue-basis')).toEqual(['001-identity'])
  expect(migrationsOf('identity.standing')).toEqual(['001-identity'])
  expect(migrationsOf('identity.login-by-proof')).toEqual(['001-identity', '002-governance'])
  expect(migrationsOf('identity.governance')).toEqual(['001-identity', '002-governance'])
  // A governance list of 1000 entries fits; one more fails the read instead of being cut.
  expect(handlers['identity.governance']?.maxRowsRead).toBe(1016)
  expect(handlers['identity.governance']?.maxOutputBytes).toBe(1 << 20)
  for (const handler of materials.readHandlers) expect(handler.ordering).toBe('snapshot')
  for (const item of [...materials.participants, ...materials.readHandlers])
    expect(item.moduleUrl.startsWith('file:')).toBe(true)
})

it('keeps the published migration 001 byte for byte', async () => {
  // A domain that 001 created holds this checksum in its mark; another value quarantines it.
  const materials = root.identitySqlMaterials()
  expect(materials.migrations[0]?.checksum).toBe(
    '611479127bce6725a4934f7e5fdd477db845e061d23683044ad0ff7943a9c1b7',
  )
  // `migration.ts` reads its tables and statements from `schema.ts`, which its checksum does not
  // cover: they are pinned to the values of the published build (6c68f4a4b) here.
  const schema = (await import('../dist/worker/schema.js')) as Readonly<Record<string, unknown>>
  const text = JSON.stringify({
    tables: schema['IDENTITY_TABLES'],
    statements: schema['SCHEMA_STATEMENTS'],
    migration: schema['MIGRATION'],
  })
  expect(createHash('sha256').update(text).digest('hex')).toBe(
    'f5c23b70f69b40d3b70749ad196ce2a9982f38757bddf53a193d40e8ad0a40c4',
  )
})

it('registers the combination with the manifest digest and a version of its own', () => {
  const result = combinationManifest({ catalog: identityCatalog(), participants: ['identity'] })
  if (result.kind !== 'manifest') throw new Error(result.kind)
  const digest = manifestDigest(result.manifest)
  const combination = root.identitySqlCombination()
  expect(combination.manifestDigest).toBe(digest)
  // The version also covers the modules that the participant imports (IS-01), so it is not the
  // manifest digest; `combination-version.spec.ts` checks what changes it.
  expect(combination.combinationVersion).toMatch(/^identity-sql\/[0-9a-f]{64}$/u)
  expect(combination.combinationVersion).not.toBe(`identity-sql/${digest}`)
  expect(root.identitySqlRegistration()).toEqual({
    scope: { kind: 'system' },
    transactionDomain: 'system.identity',
    combinationVersion: combination.combinationVersion,
    manifestDigest: digest,
    participants: ['identity'],
  })
})

/** Two legal invitation durations, so that each bad configuration below has one problem only. */
const INVITATIONS = { invitationDefaultDuration: 'PT60S', invitationMaxDuration: 'PT120S' }

it('judges the plugin configuration: positive durations, the default invitation not the longer', () => {
  expect(root.parseIdentitySqlConfig(root.IDENTITY_SQL_DEFAULT_CONFIG).kind).toBe('valid')
  expect(
    root.parseIdentitySqlConfig({ ...INVITATIONS, maxLifetime: 'PT1S', idlePeriod: 'PT1S' }).kind,
  ).toBe('valid')
  for (const bad of [
    { ...INVITATIONS, maxLifetime: 'PT0S', idlePeriod: 'PT1S' },
    { ...INVITATIONS, maxLifetime: 'PT1S', idlePeriod: '-PT1S' },
    { ...INVITATIONS, maxLifetime: 'P1D', idlePeriod: 'PT1S' },
    { ...INVITATIONS, maxLifetime: 'PT1S' },
    { ...INVITATIONS, maxLifetime: 'PT1S', idlePeriod: 'PT1S', extra: 1 },
    { ...INVITATIONS, maxLifetime: 'PT1S', idlePeriod: 'PT1S', invitationDefaultDuration: 'PT0S' },
    { ...INVITATIONS, maxLifetime: 'PT1S', idlePeriod: 'PT1S', invitationMaxDuration: 'P30D' },
    {
      ...INVITATIONS,
      maxLifetime: 'PT1S',
      idlePeriod: 'PT1S',
      invitationDefaultDuration: 'PT2592001S',
    },
    {
      maxLifetime: 'PT1S',
      idlePeriod: 'PT1S',
      invitationDefaultDuration: 'PT61S',
      invitationMaxDuration: 'PT60S',
    },
    null,
  ]) {
    const judged = root.parseIdentitySqlConfig(bad)
    expect(judged.kind).toBe('invalid')
  }
})

it('requires both invitation durations: the provider has no duration of its own (ID-18)', () => {
  const judged = root.parseIdentitySqlConfig({ maxLifetime: 'PT2592000S', idlePeriod: 'PT604800S' })
  expect(judged).toEqual({
    kind: 'invalid',
    problems: [
      { field: 'invitationDefaultDuration', rule: 'must be PT<seconds>S text' },
      { field: 'invitationMaxDuration', rule: 'must be PT<seconds>S text' },
    ],
  })
  const own = root.parseIdentitySqlConfig({
    maxLifetime: 'PT2592000S',
    idlePeriod: 'PT604800S',
    invitationDefaultDuration: 'PT60S',
    invitationMaxDuration: 'PT60S',
  })
  if (own.kind !== 'valid') throw new Error(`invalid: ${JSON.stringify(own.problems)}`)
  expect(own.config.invitationDefaultDuration).toBe('PT60S')
  expect(own.invitationTerms.defaultDuration).toEqual(own.invitationTerms.maxDuration)
})
