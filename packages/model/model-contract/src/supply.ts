import type { Outcome } from '@omne-harness/operation-result'
import type { ModelChoices, ProfileKind, ProfileResolution } from './profile.ts'
import type { ModelFailure } from './result.ts'
import type { ProviderName } from './root.ts'

/** Whether a need is met now: ready with what can be chosen, blocked at one gate with where to fix it, or not known. */
export type ModelSupply<K extends ProfileKind = ProfileKind> =
  | Readonly<{
      state: 'ready'
      choices: readonly Extract<ProfileResolution<K>, { kind: 'resolved' }>[]
    }>
  | Readonly<{ state: 'blocked'; by: 'no-offering' }>
  | Readonly<{ state: 'blocked'; by: 'credential'; providers: readonly ProviderName[] }>
  | Readonly<{
      state: 'blocked'
      by: 'not-enabled' | 'locked' | 'scope'
      models: readonly Readonly<{ provider: ProviderName; route: string }>[]
    }>
  | Readonly<{ state: 'unknown' }>

type Stop = 'need' | 'credential' | 'credential-unknown' | 'not-enabled' | 'locked' | 'scope'
const GATE: Readonly<Record<Stop, number>> = {
  need: 0,
  credential: 1,
  'credential-unknown': 1,
  'not-enabled': 2,
  locked: 3,
  scope: 3,
}

// The gates in their order: the need, the credential, the switch, then what the organization allows.
function stopOf(choice: Extract<ProfileResolution, { kind: 'resolved' }>): Stop | null {
  if (choice.reasons.includes('modality')) return 'need'
  if (choice.credential === 'missing') return 'credential'
  if (choice.credential !== 'available') return 'credential-unknown'
  if (choice.reasons.includes('not-enabled')) return 'not-enabled'
  if (choice.reasons.includes('locked')) return 'locked'
  return choice.reasons.includes('scope') ? 'scope' : null
}

function namedOf(
  choice: Extract<ProfileResolution, { kind: 'resolved' }>,
): Readonly<{ provider: ProviderName; route: string }> {
  const { identity, definition } = choice.profile
  return { provider: definition.suppliers[0].provider, route: identity.route }
}

/** Reduces one listing to one answer. It names the gate where the candidate that went furthest stopped. */
export function supplyOf<K extends ProfileKind>(
  listed: Outcome<ModelChoices<K>, ModelFailure>,
): ModelSupply<K> {
  if (!('ok' in listed)) return { state: 'unknown' }
  const ready: Extract<ProfileResolution<K>, { kind: 'resolved' }>[] = []
  const blocked: Blocked[] = []
  for (const choice of listed.ok.choices) {
    if (choice.kind === 'absent') continue
    const stop = stopOf(choice)
    if (stop === null) ready.push(choice)
    else blocked.push({ choice, stop })
  }
  return ready.length > 0 ? { state: 'ready', choices: ready } : blockedOf(blocked)
}

type Blocked = Readonly<{ choice: Extract<ProfileResolution, { kind: 'resolved' }>; stop: Stop }>

function blockedOf<K extends ProfileKind>(blocked: readonly Blocked[]): ModelSupply<K> {
  const furthest = Math.max(0, ...blocked.map(item => GATE[item.stop]))
  const at = (stop: Stop) => blocked.filter(item => item.stop === stop).map(item => item.choice)
  switch (furthest) {
    case 1: {
      if (at('credential-unknown').length > 0) return { state: 'unknown' }
      const providers = new Set(at('credential').map(choice => namedOf(choice).provider))
      return { state: 'blocked', by: 'credential', providers: [...providers] }
    }
    case 2:
      return { state: 'blocked', by: 'not-enabled', models: at('not-enabled').map(namedOf) }
    case 3: {
      const by = at('locked').length > 0 ? 'locked' : 'scope'
      return { state: 'blocked', by, models: at(by).map(namedOf) }
    }
    default:
      return { state: 'blocked', by: 'no-offering' }
  }
}
