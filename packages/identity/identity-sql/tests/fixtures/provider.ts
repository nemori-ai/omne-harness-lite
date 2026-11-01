// One provider over one fresh SQLite deployment: the storage is opened, the identity combination
// is registered, the scrypt module is opened with the test profile, and the provider is built.
// `close` stops the provider, closes scrypt and closes the storage.
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { IdentityClock, LoginTermsSource } from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  manualIdentityClock,
  type AdjustableLoginTerms,
  type ManualIdentityClock,
} from '@omne-harness/identity/testing'
import type { ScryptCompute } from '@omne-harness/scrypt'
import { parseDuration, parseInstant, type Duration, type Instant } from '@omne-harness/utc-instant'
import {
  createIdentitySql,
  identitySqlRegistration,
  type IdentifierSource,
  type IdentitySql,
} from '@omne-harness/identity-sql'
import { openTestScrypt, type OpenedScrypt } from './scrypt.ts'
import { openSqliteStorage, type OpenedStorage } from './storage.ts'

export function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text}`)
  return parsed.value
}

export function duration(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text}`)
  return parsed.value
}

export const START = '2026-10-25T12:00:00Z'
export const LONG = 'PT86400S'
export const SHORT = 'PT3600S'

export type ProviderOptions = Readonly<{
  clock?: IdentityClock
  terms?: LoginTermsSource
  /** Wraps the real storage before the provider sees it. The registration goes to the real one. */
  wrap?: (storage: SqlStorage) => SqlStorage
  identifiers?: IdentifierSource
  compute?: ScryptCompute
  /** Reuse an open deployment instead of opening a new one. */
  storage?: OpenedStorage
}>

export type OpenedProvider = Readonly<{
  provider: IdentitySql
  storage: OpenedStorage
  scrypt: OpenedScrypt
  clock: ManualIdentityClock
  terms: AdjustableLoginTerms
  close(): Promise<void>
}>

export async function openProvider(options: ProviderOptions = {}): Promise<OpenedProvider> {
  const storage = options.storage ?? (await openSqliteStorage())
  const registered = await storage.storage.registerCombination(identitySqlRegistration())
  if (registered.kind !== 'registered')
    throw new Error(`registration ${registered.kind}: ${JSON.stringify(registered)}`)
  const scrypt = await openTestScrypt(undefined, options.compute)
  const clock = manualIdentityClock(instant(START))
  const terms = adjustableLoginTerms({ maxLifetime: duration(LONG), idlePeriod: duration(SHORT) })
  const provider = createIdentitySql({
    storage: options.wrap === undefined ? storage.storage : options.wrap(storage.storage),
    clock: options.clock ?? clock.clock,
    terms: options.terms ?? terms.source,
    scrypt: scrypt.module,
    decoyMaterial: scrypt.decoyMaterial,
    ...(options.identifiers === undefined ? {} : { identifiers: options.identifiers }),
  })
  return {
    provider,
    storage,
    scrypt,
    clock,
    terms,
    async close() {
      provider.stop()
      await scrypt.module.close()
      if (options.storage === undefined) await storage.close({ remove: true })
    },
  }
}
