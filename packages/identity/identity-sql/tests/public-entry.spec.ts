// The public entries: what the root exports, what `./cordis` exports, and that the root loads
// without Cordis (IC-4).
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
  expect(root.IDENTITY_SQL_DEFAULT_CONFIG).toEqual({
    maxLifetime: 'PT2592000S',
    idlePeriod: 'PT604800S',
  })
})

it('exports only the plugin from ./cordis', () => {
  expect(Object.keys(cordis)).toEqual(['IdentitySqlPlugin'])
  expect(cordis.IdentitySqlPlugin.inject).toEqual(['storage'])
  expect(cordis.IdentitySqlPlugin.name).toBe('identity-sql')
})

it('describes one participant, one migration and three snapshot read handlers', () => {
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
  ])
  expect(materials.migrations.map(item => `${item.owner}/${item.id}`)).toEqual([
    'identity/001-identity',
  ])
  expect(materials.readHandlers.map(item => item.handler).sort()).toEqual([
    'identity.issue-basis',
    'identity.login-by-proof',
    'identity.standing',
  ])
  for (const handler of materials.readHandlers) expect(handler.ordering).toBe('snapshot')
  for (const item of [...materials.participants, ...materials.readHandlers])
    expect(item.moduleUrl.startsWith('file:')).toBe(true)
})

it('registers the combination with a version that carries the manifest digest', () => {
  const result = combinationManifest({ catalog: identityCatalog(), participants: ['identity'] })
  if (result.kind !== 'manifest') throw new Error(result.kind)
  const digest = manifestDigest(result.manifest)
  const combination = root.identitySqlCombination()
  expect(combination.manifestDigest).toBe(digest)
  expect(combination.combinationVersion).toBe(`identity-sql/${digest}`)
  expect(root.identitySqlRegistration()).toEqual({
    scope: { kind: 'system' },
    transactionDomain: 'system.identity',
    combinationVersion: `identity-sql/${digest}`,
    manifestDigest: digest,
    participants: ['identity'],
  })
})

it('judges the plugin configuration: two positive SI-second durations', () => {
  expect(root.parseIdentitySqlConfig(root.IDENTITY_SQL_DEFAULT_CONFIG).kind).toBe('valid')
  for (const bad of [
    { maxLifetime: 'PT0S', idlePeriod: 'PT1S' },
    { maxLifetime: 'PT1S', idlePeriod: '-PT1S' },
    { maxLifetime: 'P1D', idlePeriod: 'PT1S' },
    { maxLifetime: 'PT1S' },
    { maxLifetime: 'PT1S', idlePeriod: 'PT1S', extra: 1 },
    null,
  ]) {
    const judged = root.parseIdentitySqlConfig(bad)
    expect(judged.kind).toBe('invalid')
  }
})
