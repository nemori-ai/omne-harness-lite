// One process of the governance restart cases. Every phase opens the storage root, does its part,
// writes what the next phase needs to the state file, prints one JSON line and exits.
//   revoke-first     register, issue two logins, revoke the second through governance.
//   revoke-second    a new process: the revoked login is invalid, the other one is recognized.
//   legacy-first     the published 001 build: a catalog with the 001 participant and only the 001
//                    migration, one registration and one login written through its participant.
//   upgrade-second   this build over the 001 files: its registration runs 002; the old account and
//                    login work, governance works on them, the old login is revoked.
//   upgrade-third    this build again: no new migration; the revocation and the team are still there.
// The clock is manual. It starts at the same instant in every process and never goes back.
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  accountCodec,
  loginStateCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  adjustableInvitationTerms,
  manualIdentityClock,
  type ManualIdentityClock,
} from '@omne-harness/identity/testing'
import { openScrypt } from '@omne-harness/scrypt'
import {
  combinationManifest,
  manifestDigest,
  type CombinationRegistrationV2,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import {
  createIdentitySql,
  identitySqlMaterials,
  identitySqlRegistration,
  randomIdentifiers,
} from '@omne-harness/identity-sql'
import { TEST_SCRYPT_PROFILE } from './scrypt.ts'
import { sqliteConfig } from './storage.ts'

const [storageRoot, phase, stateFile] = process.argv.slice(2)
if (storageRoot === undefined || phase === undefined || stateFile === undefined)
  throw new Error('usage: governance-child <storageRoot> <phase> <stateFile>')

const IDENTIFIER = 'restart-ada'
const CREDENTIAL = 'credential-ada'
const START = '2026-10-25T12:00:00Z'

function must<T>(parsed: { ok: true; value: T } | { ok: false }, what: string): T {
  if (!parsed.ok) throw new Error(`${what} did not parse`)
  return parsed.value
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

type State = Readonly<Record<string, string>>

async function readState(): Promise<State> {
  return JSON.parse(await readFile(stateFile as string, 'utf8')) as State
}

/** The catalog of this build: every material of the identity member. */
function currentCatalog(): SqlMaterialCatalog {
  return {
    catalogProtocol: 'sql-catalog/1',
    ...identitySqlMaterials(),
    declaredCombinations: { tenant: null, system: null },
  }
}

/**
 * The catalog of the published 001 build: its participant (a frozen copy in `identity-001/`) with
 * the six 001 tables, and the 001 migration of this build, whose bytes the 001 build published.
 */
function legacyCatalog(): SqlMaterialCatalog {
  const url = new URL('./identity-001/participant.ts', import.meta.url)
  const migration = identitySqlMaterials().migrations.find(item => item.id === '001-identity')
  if (migration === undefined) throw new Error('this build has no 001 migration')
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        participant: 'identity',
        protocol: '1',
        moduleUrl: url.href,
        codeDigest: sha256(readFileSync(fileURLToPath(url))),
        ownedTables: [
          'id_account',
          'id_credential',
          'id_organization',
          'id_tenant',
          'id_membership',
          'id_login',
        ],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [migration],
    readHandlers: [],
    declaredCombinations: { tenant: null, system: null },
  }
}

function legacyRegistration(catalog: SqlMaterialCatalog): CombinationRegistrationV2 {
  const manifest = combinationManifest({ catalog, participants: ['identity'] })
  if (manifest.kind !== 'manifest') throw new Error(`legacy manifest ${manifest.kind}`)
  const digest = manifestDigest(manifest.manifest)
  return {
    scope: { kind: 'system' },
    transactionDomain: 'system.identity',
    combinationVersion: `identity-sql/${digest}`,
    manifestDigest: digest,
    participants: ['identity'],
  }
}

async function openStorage(catalog: SqlMaterialCatalog) {
  const created = await createSqliteStorage({
    config: sqliteConfig(storageRoot as string),
    materials: catalog,
    closeLeases: { admit: () => ({}), release: () => undefined },
  })
  if (created.kind !== 'created') throw new Error(created.problems.join('; '))
  return created
}

async function openScryptModule() {
  const opened = openScrypt(TEST_SCRYPT_PROFILE)
  if (!opened.ok) throw new Error('scrypt profile')
  const decoy = opened.module.derive('decoy', () => ({ ok: true }))
  if (!('done' in decoy)) throw new Error('decoy refused')
  const done = await decoy.done
  if (done.code !== 'material') throw new Error('decoy failed')
  return { module: opened.module, decoyMaterial: done.material }
}

/** This build over the storage root, with a manual clock at `START` plus `offset`. */
async function openCurrent(offset: string) {
  const created = await openStorage(currentCatalog())
  const registered = await created.storage.registerCombination(identitySqlRegistration())
  const scrypt = await openScryptModule()
  const clock: ManualIdentityClock = manualIdentityClock(must(parseInstant(START), 'start'))
  clock.advanceBy(must(parseDuration(offset), 'offset'))
  const provider = createIdentitySql({
    storage: created.storage,
    clock: clock.clock,
    terms: {
      read: () =>
        Promise.resolve({
          kind: 'read' as const,
          terms: {
            maxLifetime: must(parseDuration('PT86400S'), 'long'),
            idlePeriod: must(parseDuration('PT3600S'), 'short'),
          },
        }),
    },
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: must(parseDuration('PT3600S'), 'short'),
      maxDuration: must(parseDuration('PT86400S'), 'long'),
    }).source,
    scrypt: scrypt.module,
    accessRefreshGranularity: must(parseDuration('PT60S'), 'refresh'),
    decoyMaterial: scrypt.decoyMaterial,
  })
  return {
    registered: registered.kind,
    provider,
    async close() {
      provider.stop()
      await scrypt.module.close()
      await created.control.close({ initiator: 'disposal' })
    },
  }
}

function loginOf(text: string | undefined) {
  return must(loginStateCodec.parse(text ?? ''), 'login')
}

function out(value: Readonly<Record<string, unknown>>): void {
  process.stdout.write(JSON.stringify({ phase, ...value }))
}

async function revokeFirst(): Promise<void> {
  const current = await openCurrent('PT0S')
  try {
    const { operations, governance } = current.provider
    const registered = await operations.registerAndActivate({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    if (registered.kind !== 'succeeded') throw new Error('registration failed')
    const keeper = await operations.issueLogin({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    const revoked = await operations.issueLogin({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    if (keeper.kind !== 'succeeded' || revoked.kind !== 'succeeded') throw new Error('issue failed')
    const revocation = await governance.revokeLogin({ login: keeper.login, target: revoked.login })
    const before = await operations.recognizeLogin({ loginProof: revoked.loginProof })
    await writeFile(
      stateFile as string,
      JSON.stringify({ keeperProof: keeper.loginProof, revokedProof: revoked.loginProof }),
      'utf8',
    )
    out({ registered: current.registered, revocation: revocation.kind, before: before.kind })
  } finally {
    await current.close()
  }
}

async function revokeSecond(): Promise<void> {
  const state = await readState()
  const current = await openCurrent('PT60S')
  try {
    const { operations } = current.provider
    const revoked = await operations.recognizeLogin({ loginProof: state['revokedProof'] ?? '' })
    const keeper = await operations.recognizeLogin({ loginProof: state['keeperProof'] ?? '' })
    out({ registered: current.registered, revoked: revoked.kind, keeper: keeper.kind })
  } finally {
    await current.close()
  }
}

async function legacyFirst(): Promise<void> {
  const catalog = legacyCatalog()
  const created = await openStorage(catalog)
  const registration = legacyRegistration(catalog)
  const scrypt = await openScryptModule()
  try {
    const registered = await created.storage.registerCombination(registration)
    if (registered.kind !== 'registered') throw new Error(`legacy registration ${registered.kind}`)
    const identifiers = randomIdentifiers()
    const account = identifiers.account()
    const organization = identifiers.organization()
    const personal: TenantId = tenant(organization, account)
    const personalText = must(tenantCodec.encode(personal), 'tenant')
    const derived = scrypt.module.derive(CREDENTIAL, () => ({ ok: true }))
    if (!('done' in derived)) throw new Error('derive refused')
    const material = await derived.done
    if (material.code !== 'material') throw new Error('derive failed')
    const login = identifiers.login()
    const proof = randomBytes(32).toString('base64url')
    const commit = (operation: string, facts: Readonly<Record<string, string>>) =>
      created.storage.commit({
        identity: {
          scope: { kind: 'system' },
          transactionDomain: 'system.identity',
          operation,
          protocolVersion: '2',
          operationKey: randomBytes(16).toString('hex'),
        },
        combinationVersion: registration.combinationVersion,
        manifestDigest: registration.manifestDigest,
        commands: [{ participant: 'identity', facts }],
      })
    const register = await commit('identity.register-and-activate', {
      kind: 'register',
      loginIdentifier: IDENTIFIER,
      account: account.text,
      organization: organization.text,
      tenantText: personalText,
      material: material.material,
      roleModel: 'default-team',
      roleModelRevision: '1',
      role: 'super-admin',
    })
    const issue = await commit('identity.issue-login', {
      kind: 'issue-login',
      login: login.text,
      account: account.text,
      tenantText: personalText,
      proofDigest: sha256(proof),
      issuedAt: START,
      maxDeadline: '2026-10-26T12:00:00Z',
      idleDeadline: '2026-10-25T13:00:00Z',
      maxLifetime: 'PT86400S',
      idlePeriod: 'PT3600S',
    })
    await writeFile(
      stateFile as string,
      JSON.stringify({
        proof,
        login: login.text,
        account: account.text,
        tenant: personalText,
        legacyVersion: registration.combinationVersion,
      }),
      'utf8',
    )
    out({
      registered: registered.kind,
      register: register.kind,
      issue: issue.kind,
      legacyVersion: registration.combinationVersion,
      currentVersion: identitySqlRegistration().combinationVersion,
    })
  } finally {
    await scrypt.module.close()
    await created.control.close({ initiator: 'disposal' })
  }
}

async function upgradeSecond(): Promise<void> {
  const state = await readState()
  const current = await openCurrent('PT60S')
  try {
    const { operations, governance } = current.provider
    const recognized = await operations.recognizeLogin({ loginProof: state['proof'] ?? '' })
    const old = loginOf(state['login'])
    const personal = must(tenantCodec.parse(state['tenant'] ?? ''), 'tenant')
    const fresh = await operations.issueLogin({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    if (fresh.kind !== 'succeeded') throw new Error(`issue ${fresh.kind}`)
    const logins = await governance.queryOwnValidLogins({ login: old })
    const current0 = await governance.queryCurrentTenant({ login: old })
    const created = await governance.createOrganization({
      login: old,
      actingTenant: personal,
      createCallId: 'upgrade-1',
      name: 'Upgraded team',
      governanceModelId: 'default-team',
    })
    const revoked = await governance.revokeLogin({ login: fresh.login, target: old })
    const after = await operations.recognizeLogin({ loginProof: state['proof'] ?? '' })
    await writeFile(
      stateFile as string,
      JSON.stringify({ ...state, freshProof: fresh.loginProof, freshLogin: fresh.login.text }),
      'utf8',
    )
    out({
      registered: current.registered,
      recognized: recognized.kind,
      recognizedLogin:
        recognized.kind === 'recognized' ? loginStateCodec.encode(recognized.login) : null,
      recognizedTenant:
        recognized.kind === 'recognized' ? tenantCodec.encode(recognized.tenant) : null,
      recognizedAccount:
        recognized.kind === 'recognized' ? accountCodec.encode(recognized.account) : null,
      validLogins: logins.kind === 'succeeded' ? logins.logins.length : logins.kind,
      currentTenant:
        current0.kind === 'succeeded' ? tenantCodec.encode(current0.tenant) : current0.kind,
      created: created.kind,
      revoked: revoked.kind,
      after: after.kind,
    })
  } finally {
    await current.close()
  }
}

async function upgradeThird(): Promise<void> {
  const state = await readState()
  const current = await openCurrent('PT120S')
  try {
    const { operations, governance } = current.provider
    const old = await operations.recognizeLogin({ loginProof: state['proof'] ?? '' })
    const fresh = await operations.recognizeLogin({ loginProof: state['freshProof'] ?? '' })
    const memberships = await governance.queryOwnMemberships({
      login: loginOf(state['freshLogin']),
    })
    out({
      registered: current.registered,
      old: old.kind,
      fresh: fresh.kind,
      memberships:
        memberships.kind === 'succeeded'
          ? memberships.memberships.map(entry => entry.role.role).sort()
          : memberships.kind,
    })
  } finally {
    await current.close()
  }
}

const PHASES: Readonly<Record<string, () => Promise<void>>> = {
  'revoke-first': revokeFirst,
  'revoke-second': revokeSecond,
  'legacy-first': legacyFirst,
  'upgrade-second': upgradeSecond,
  'upgrade-third': upgradeThird,
}

const run = PHASES[phase]
if (run === undefined) throw new Error(`unknown phase ${phase}`)
run().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
