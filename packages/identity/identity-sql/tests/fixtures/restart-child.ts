// One process of the restart case (R4-2). `first` registers and issues a login over a storage
// root, writes the proof and the identities to a state file, closes the storage and exits.
// `second` opens the same root again and reports what the persisted records make possible.
// The clock is manual and starts at the same instant in both processes.
import { readFile, writeFile } from 'node:fs/promises'
import {
  accountCodec,
  loginStateCodec,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { manualIdentityClock } from '@omne-harness/identity/testing'
import { openScrypt } from '@omne-harness/scrypt'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  createIdentitySql,
  identitySqlMaterials,
  identitySqlRegistration,
} from '@omne-harness/identity-sql'
import { TEST_SCRYPT_PROFILE } from './scrypt.ts'
import { sqliteConfig } from './storage.ts'

const [storageRoot, phase, stateFile] = process.argv.slice(2)
if (storageRoot === undefined || phase === undefined || stateFile === undefined)
  throw new Error('usage: restart-child <storageRoot> <first|second> <stateFile>')

const IDENTIFIER = 'restart-ada'
const CREDENTIAL = 'credential-ada'

function must<T>(parsed: { ok: true; value: T } | { ok: false }, what: string): T {
  if (!parsed.ok) throw new Error(`${what} did not parse`)
  return parsed.value
}

type State = Readonly<{ loginProof: string; account: string; tenant: string; login: string }>

async function main(): Promise<void> {
  const materials = identitySqlMaterials()
  const created = await createSqliteStorage({
    config: sqliteConfig(storageRoot as string),
    materials: {
      catalogProtocol: 'sql-catalog/1',
      ...materials,
      declaredCombinations: { tenant: null, system: null },
    },
    closeLeases: { admit: () => ({}), release: () => undefined },
  })
  if (created.kind !== 'created') throw new Error(created.problems.join('; '))
  const registered = await created.storage.registerCombination(identitySqlRegistration())
  if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
  const opened = openScrypt(TEST_SCRYPT_PROFILE)
  if (!opened.ok) throw new Error('scrypt profile')
  const decoy = opened.module.derive('decoy', () => ({ ok: true }))
  if (!('done' in decoy)) throw new Error('decoy refused')
  const decoyDone = await decoy.done
  if (decoyDone.code !== 'material') throw new Error('decoy failed')
  const clock = manualIdentityClock(must(parseInstant('2026-10-25T12:00:00Z'), 'start'))
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
    scrypt: opened.module,
    decoyMaterial: decoyDone.material,
  })
  try {
    if (phase === 'first') {
      const registration = await provider.operations.registerAndActivate({
        loginIdentifier: IDENTIFIER,
        credential: CREDENTIAL,
      })
      if (registration.kind !== 'succeeded') throw new Error('registration failed')
      const issued = await provider.operations.issueLogin({
        loginIdentifier: IDENTIFIER,
        credential: CREDENTIAL,
      })
      if (issued.kind !== 'succeeded') throw new Error(`issue ${issued.kind}`)
      const state: State = {
        loginProof: issued.loginProof,
        account: must(accountCodec.encode(issued.account), 'account'),
        tenant: must(tenantCodec.encode(issued.tenant), 'tenant'),
        login: must(loginStateCodec.encode(issued.login), 'login'),
      }
      await writeFile(stateFile as string, JSON.stringify(state), 'utf8')
      process.stdout.write(JSON.stringify({ phase, registered: true }))
      return
    }
    const state = JSON.parse(await readFile(stateFile as string, 'utf8')) as State
    const issued = await provider.operations.issueLogin({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    const recognized = await provider.operations.recognizeLogin({ loginProof: state.loginProof })
    const tenant: TenantId = must(tenantCodec.parse(state.tenant), 'tenant')
    const standing = await provider.standing.read({ tenant })
    clock.setTo(must(parseInstant('2026-10-26T12:00:00Z'), 'later'))
    const afterDeadline = await provider.operations.recognizeLogin({
      loginProof: state.loginProof,
    })
    process.stdout.write(
      JSON.stringify({
        phase,
        issue: issued.kind,
        recognized: recognized.kind,
        recognizedAccount:
          recognized.kind === 'recognized' ? accountCodec.encode(recognized.account) : null,
        recognizedTenant:
          recognized.kind === 'recognized' ? tenantCodec.encode(recognized.tenant) : null,
        recognizedLogin:
          recognized.kind === 'recognized' ? loginStateCodec.encode(recognized.login) : null,
        standing: standing.kind,
        standingRevision: standing.kind === 'member' ? standing.evidence.revision : null,
        afterDeadline: afterDeadline.kind,
        expected: { account: state.account, tenant: state.tenant, login: state.login },
      }),
    )
  } finally {
    provider.stop()
    await opened.module.close()
    await created.control.close({ initiator: 'disposal' })
  }
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
