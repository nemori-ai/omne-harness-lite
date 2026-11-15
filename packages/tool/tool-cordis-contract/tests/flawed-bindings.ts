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
  emptyToken?: boolean
  ordinalResets?: boolean
  recogniseNothing?: boolean
  overwriteOnConflict?: boolean
  releaseByKey?: boolean
  fiberEndKeepsEntry?: boolean
  keyIgnoresAsset?: boolean
  refusalAsUnavailable?: boolean
  mismatchAsDenied?: boolean
  closeReleases?: boolean
  snapshotIgnoresScope?: boolean
}>

type Register = ToolBindingRegistryService<string>['register']
type Registered = Outcome<ToolContribution, ToolContributionFailure>

export function flawedBindingFixture(flaws: Flaws = {}): ToolBindingRegistryFixture<string> {
  const base = memoryToolBindingRegistryFixture()
  const inner = base.registry
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
