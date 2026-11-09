// The governance contract fixture over the real SQLite provider. Every `create` is a new deployment
// on a new storage root, with both ports of one provider instance over it and the suite's faults on
// the storage boundary. `restart` stops the instance, closes the storage, opens the same files
// again and builds a new instance: the records stay, the latest adopted clock reading does not.
// The suite runs one case at a time, so `create` closes the deployments of the earlier cases.
// `build` is the package under test: the real one, or a mutant of it (`mutants.ts`).
import type {
  IdentityGovernanceContractFixture,
  IdentityGovernanceContractProviderOptions,
  IdentityProviders,
} from '@omne-harness/identity/testing'
import * as real from '@omne-harness/identity-sql'
import type { IdentitySql } from '@omne-harness/identity-sql'
import { parseDuration } from '@omne-harness/utc-instant'
import { withRecordFaults } from './faults.ts'
import { openTestScrypt, type OpenedScrypt } from './scrypt.ts'
import { openSqliteStorage, type OpenedStorage } from './storage.ts'

/** What the fixture needs from a build of this package. */
export type IdentitySqlBuild = Pick<
  typeof real,
  'createIdentitySql' | 'identitySqlMaterials' | 'identitySqlRegistration'
>

export const REAL_BUILD: IdentitySqlBuild = real

type Deployment = Readonly<{
  storage: OpenedStorage
  scrypt: OpenedScrypt
  provider: IdentitySql
  options: IdentityGovernanceContractProviderOptions
}>

export type GovernanceFixture = Readonly<{
  fixture: IdentityGovernanceContractFixture
  /** Closes every deployment that is still open and removes its root. */
  close(): Promise<void>
}>

const refresh = parseDuration('PT0.1S')
if (!refresh.ok) throw new Error('invalid fixture granularity')
const REFRESH = refresh.value

export function governanceFixture(build: IdentitySqlBuild = REAL_BUILD): GovernanceFixture {
  const live = new Map<IdentityProviders, Deployment>()

  const open = async (
    options: IdentityGovernanceContractProviderOptions,
    root?: string,
  ): Promise<IdentityProviders> => {
    const storage = await openSqliteStorage(root, build.identitySqlMaterials())
    const registered = await storage.storage.registerCombination(build.identitySqlRegistration())
    if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
    const scrypt = await openTestScrypt()
    const provider = build.createIdentitySql({
      storage: withRecordFaults(storage.storage, options.faults),
      clock: options.clock,
      terms: options.terms,
      invitationTerms: options.invitationTerms,
      // Shorter than half of the suite's shortest idle period, so every report of the suite commits.
      accessRefreshGranularity: REFRESH,
      scrypt: scrypt.module,
      decoyMaterial: scrypt.decoyMaterial,
    })
    const providers: IdentityProviders = {
      operations: provider.operations,
      governance: provider.governance,
    }
    live.set(providers, { storage, scrypt, provider, options })
    return providers
  }

  const shut = async (deployment: Deployment, remove: boolean): Promise<void> => {
    deployment.provider.stop()
    await deployment.scrypt.module.close()
    await deployment.storage.close({ remove })
  }

  const closeAll = async (): Promise<void> => {
    // Deleting the entry being visited is safe in a Map iteration.
    for (const [providers, deployment] of live) {
      live.delete(providers)
      await shut(deployment, true)
    }
  }

  return {
    fixture: {
      injectsRecordFaults: true,
      async create(options) {
        await closeAll()
        return open(options)
      },
      async restart(providers) {
        const deployment = live.get(providers)
        if (deployment === undefined) throw new Error('restart of a deployment that is not open')
        live.delete(providers)
        await shut(deployment, false)
        return open(deployment.options, deployment.storage.base)
      },
    },
    close: closeAll,
  }
}
