// Request builders shared by the conformance suite and the tests of this package.
import { combinationManifest, manifestDigest } from '../manifest.ts'
import type {
  CombinationRegistrationV2,
  CommitRequestV2,
  FactCommandV2,
  SqlIdentity,
  SqlMaterialCatalog,
  SqlStorage,
  StorageScope,
} from '../types.ts'
import { ALL_PARTICIPANTS, SMALL_PARTICIPANTS } from './fixtures.ts'

export const TENANT_A: StorageScope = { kind: 'tenant', tenant: 'tenant-a' }
export const TENANT_B: StorageScope = { kind: 'tenant', tenant: 'tenant-b' }
export const SYSTEM: StorageScope = { kind: 'system' }
export const DOMAIN_A = 'domain-a'

type WithMaterials = Readonly<{ materials: SqlMaterialCatalog }>

export function digestOf(source: WithMaterials, participants: readonly string[]): string {
  const result = combinationManifest({ catalog: source.materials, participants })
  if (result.kind !== 'manifest') throw new Error(`fixture combination is ${result.kind}`)
  return manifestDigest(result.manifest)
}

export function registration(
  source: WithMaterials,
  overrides: Partial<CombinationRegistrationV2> = {},
): CombinationRegistrationV2 {
  const participants = overrides.participants ?? [...SMALL_PARTICIPANTS]
  return {
    scope: TENANT_A,
    transactionDomain: DOMAIN_A,
    combinationVersion: 'small-v1',
    manifestDigest: overrides.manifestDigest ?? digestOf(source, participants),
    participants,
    ...overrides,
  }
}

export function identity(overrides: Partial<SqlIdentity> = {}): SqlIdentity {
  return {
    scope: TENANT_A,
    transactionDomain: DOMAIN_A,
    operation: 'op',
    protocolVersion: '2',
    operationKey: 'key-1',
    ...overrides,
  }
}

export function commitRequest(
  source: WithMaterials,
  overrides: Partial<CommitRequestV2> = {},
): CommitRequestV2 {
  const combinationVersion = overrides.combinationVersion ?? 'small-v1'
  const participants =
    combinationVersion === 'all-v1' ? [...ALL_PARTICIPANTS] : [...SMALL_PARTICIPANTS]
  return {
    identity: identity(),
    combinationVersion,
    manifestDigest: digestOf(source, participants),
    commands: [
      { participant: 'session', facts: { revision: 'r7' } },
      { participant: 'agent-journal', facts: {} },
    ],
    ...overrides,
  }
}

export function command(participant: string, facts: FactCommandV2['facts'] = {}): FactCommandV2 {
  return { participant, facts }
}

export async function registerSmall(
  storage: SqlStorage,
  source: WithMaterials,
  scope: StorageScope = TENANT_A,
  transactionDomain: string = DOMAIN_A,
): Promise<void> {
  const result = await storage.registerCombination(
    registration(source, { scope, transactionDomain }),
  )
  if (result.kind !== 'registered') throw new Error(`registration is ${result.kind}`)
}

export async function registerAll(
  storage: SqlStorage,
  source: WithMaterials,
  scope: StorageScope = TENANT_A,
  transactionDomain: string = DOMAIN_A,
): Promise<void> {
  const result = await storage.registerCombination(
    registration(source, {
      scope,
      transactionDomain,
      combinationVersion: 'all-v1',
      participants: [...ALL_PARTICIPANTS],
    }),
  )
  if (result.kind !== 'registered') throw new Error(`registration is ${result.kind}`)
}
