import { ACCOUNT_PREFERENCE_LIMITS, type IdentityGovernance } from '@omne-harness/identity'
import { OPERATIONS, type GovernanceFacts, type GovernanceReadInput } from './worker/schema.ts'

type Refused =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>
type Begun = Readonly<{ kind: 'begun'; login: string; nowKey: string }>
type Reply = Readonly<{ outcome: string; [field: string]: unknown }>

export type PreferenceDeps = Readonly<{
  begin(request: unknown): Promise<Begun | Refused>
  query(
    request: GovernanceReadInput,
  ): Promise<Readonly<{ kind: 'answered'; output: Reply }> | Refused>
  write(
    operation: string,
    facts: GovernanceFacts,
  ): Promise<Readonly<{ kind: 'written'; reply: Reply }> | Refused>
  malformed(): never
}>

const DENIED = Object.freeze({ kind: 'denied' as const })

const nameOf = (request: unknown): string | undefined => {
  const name = (request as { name?: unknown }).name
  return typeof name === 'string' &&
    name.length > 0 &&
    name.length <= ACCOUNT_PREFERENCE_LIMITS.name
    ? name
    : undefined
}

type Asked = Readonly<{ name: string; value: string | null; expected: string }>

function writeOf(request: unknown): Asked | undefined {
  const name = nameOf(request)
  const { value, expected } = request as { value?: unknown; expected?: unknown }
  const fits =
    value === null || (typeof value === 'string' && value.length <= ACCOUNT_PREFERENCE_LIMITS.value)
  return name === undefined || !fits || typeof expected !== 'string'
    ? undefined
    : { name, value: value as string | null, expected }
}

const readValid = (output: Readonly<Record<string, unknown>>): boolean =>
  output['outcome'] === 'read' &&
  typeof output['revision'] === 'string' &&
  (output['value'] === null || typeof output['value'] === 'string')

/** The preferences of the calling account: read under a name, written against the revision read. */
export function preferenceGovernance(
  deps: PreferenceDeps,
): Pick<IdentityGovernance, 'readAccountPreference' | 'writeAccountPreference'> {
  const readAccountPreference: IdentityGovernance['readAccountPreference'] = async request => {
    const begun = await deps.begin(request)
    if (begun.kind !== 'begun') return begun
    const name = nameOf(request)
    if (name === undefined) return DENIED
    const answered = await deps.query({
      query: 'preference',
      login: begun.login,
      nowKey: begun.nowKey,
      name,
    })
    if (answered.kind !== 'answered') return answered
    const { outcome, value, revision } = answered.output
    if (outcome === 'denied') return DENIED
    if (!readValid(answered.output)) return deps.malformed()
    return Object.freeze({
      kind: 'succeeded',
      value: value as string | null,
      revision: revision as string,
    })
  }

  const writeAccountPreference: IdentityGovernance['writeAccountPreference'] = async request => {
    const begun = await deps.begin(request)
    if (begun.kind !== 'begun') return begun
    const asked = writeOf(request)
    if (asked === undefined) return DENIED
    const written = await deps.write(OPERATIONS.writePreference, {
      kind: 'write-preference',
      login: begun.login,
      nowKey: begun.nowKey,
      ...asked,
    })
    if (written.kind !== 'written') return written
    const { outcome, revision } = written.reply
    if (outcome === 'denied') return DENIED
    if ((outcome === 'succeeded' || outcome === 'conflict') && typeof revision === 'string')
      return Object.freeze({ kind: outcome, revision })
    return deps.malformed()
  }

  return { readAccountPreference, writeAccountPreference }
}

/** The rest of the governance with the preferences added, frozen. */
export function withPreferences(deps: PreferenceDeps) {
  return <T extends object>(rest: T): Readonly<T & ReturnType<typeof preferenceGovernance>> =>
    Object.freeze({ ...rest, ...preferenceGovernance(deps) })
}
