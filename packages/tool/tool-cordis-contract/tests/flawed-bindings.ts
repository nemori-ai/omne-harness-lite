// The violating variants of the G7 binding-registry suite: a registry built at the registry
// boundary over the conforming double, with one flaw switched on. With no flaw it is the double
// itself, so the variants stay one flaw away from a conforming provider. Not a test file.
import { fail, type Outcome } from '@omne-harness/operation-result'
import { sameBindingKey } from '@omne-harness/tool-contract/provider'
import type {
  ToolBindingKey,
  ToolContribution,
  ToolContributionFailure,
} from '@omne-harness/tool-contract/provider'
import {
  memoryToolBindingRegistryFixture,
  type ToolBindingRegistryFixture,
  type ToolBindingRegistryService,
} from '@omne-harness/tool-cordis-contract/testing'

export type Flaws = Readonly<{
  /** Every contribution carries an empty token. */
  emptyToken?: boolean
  /** The ordinal of every contribution is `0`, so successors are not later. */
  ordinalResets?: boolean
  /** The same fiber registering the same key and digest again is a conflict, not recognised. */
  recogniseNothing?: boolean
  /** A conflicting registration replaces the holder instead of being refused. */
  overwriteOnConflict?: boolean
  /** A release removes whatever holds the key now, not only its own token. */
  releaseByKey?: boolean
  /** The end of a fiber withdraws nothing. */
  fiberEndKeepsEntry?: boolean
  /** Two asset versions of one capability share one key. */
  keyIgnoresAsset?: boolean
  /** A refused origin is reported as unavailable. */
  refusalAsUnavailable?: boolean
  /** A loaded registration whose key is not the verified key is reported as denied. */
  mismatchAsDenied?: boolean
  /** `close` releases the contribution instead of marking it draining. */
  closeReleases?: boolean
  /** A tenant scope sees every entry. */
  snapshotIgnoresScope?: boolean
}>

type Register = ToolBindingRegistryService<string>['register']
type Registered = Outcome<ToolContribution, ToolContributionFailure>

export function flawedBindingFixture(flaws: Flaws = {}): ToolBindingRegistryFixture<string> {
  const base = memoryToolBindingRegistryFixture()
  const inner = base.registry
  /** The latest contribution the flawed registry handed out for a key. */
  const holders: ToolContribution[] = []
  const handed = new Set<string>()
  const holderOf = (key: ToolBindingKey) => holders.find(item => sameBindingKey(item.key, key))
  const sameCapability = (left: ToolBindingKey, right: ToolBindingKey) =>
    left.asset.name === right.asset.name && !sameBindingKey(left, right)

  const flawedContribution = (contribution: ToolContribution): ToolContribution => {
    const flawed: ToolContribution = Object.freeze({
      key: contribution.key,
      token: flaws.emptyToken === true ? '' : contribution.token,
      ordinal: flaws.ordinalResets === true ? '0' : contribution.ordinal,
      release: () => {
        if (flaws.releaseByKey === true) {
          const holder = holderOf(contribution.key)
          return holder === undefined ? Object.freeze({ removed: false }) : holder.release()
        }
        return contribution.release()
      },
    })
    holders.unshift(contribution)
    return flawed
  }

  const register: Register = input => {
    let outcome: Registered = inner.register(input)
    if ('ok' in outcome && flaws.recogniseNothing === true && handed.has(outcome.ok.token))
      return fail({ kind: 'conflict' })
    if ('failure' in outcome && outcome.failure.kind === 'conflict' && flaws.overwriteOnConflict) {
      holderOf({ layer: input.authority.layer, asset: input.authority.asset })?.release()
      outcome = inner.register(input)
    }
    if ('ok' in outcome && flaws.keyIgnoresAsset === true) {
      const other = holders.find(item => sameCapability(item.key, outcome.ok.key))
      if (other !== undefined && 'ok' in inner.pins(other.key)) {
        outcome.ok.release()
        return fail({ kind: 'conflict' })
      }
    }
    if ('failure' in outcome) {
      if (outcome.failure.kind === 'denied' && flaws.refusalAsUnavailable === true)
        return fail({ kind: 'unavailable', diagnostic: 'origin check did not answer' })
      if (outcome.failure.kind === 'invalid' && flaws.mismatchAsDenied === true)
        return fail({ kind: 'denied' })
      return outcome
    }
    handed.add(outcome.ok.token)
    return { ok: flawedContribution(outcome.ok) }
  }

  const registry: ToolBindingRegistryService<string> = {
    register,
    snapshot: scope =>
      inner.snapshot(flaws.snapshotIgnoresScope === true ? { scope: 'system' } : scope),
    pins: key => inner.pins(key),
    close: key => {
      if (flaws.closeReleases === true) {
        const holder = holderOf(key)
        if (holder === undefined) return fail({ kind: 'unknown-key' })
        holder.release()
        return { ok: undefined }
      }
      return inner.close(key)
    },
    reopen: key => inner.reopen(key),
    drain: key => inner.drain(key),
  }

  const fixture: ToolBindingRegistryFixture<string> = { ...base, registry }
  if (flaws.fiberEndKeepsEntry === true) return { ...fixture, endFiber: () => Promise.resolve() }
  return fixture
}
