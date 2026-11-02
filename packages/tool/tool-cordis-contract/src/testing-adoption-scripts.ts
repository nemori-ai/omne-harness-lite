// The two scripted doubles of RD-COORD. `createScriptedToolGenerations` stands in for the
// generation coordinator `toolGenerations` (TL-05) at the first load of the adoption point.
// `createScriptedAdoptionPoint` stands in for the assembly coordinator's adoption point (AS-06)
// that Session calls before `startRun`. Both answer only from their scripts and record each call;
// they do not implement the retention duty, the adoption-point table or any selection rule. An
// unscripted call answers `unavailable`. Both declare `durability: 'none'` and must not be
// assembled into production. The adoption point does not import session-contract: the material
// item types are parameters, so `R = ResidentTool` and `K = ResidentAdoption['keys'][number]`
// give a material of the form of `ResidentAdoption`.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access, residentToolFacts } from '@omne-harness/tool-contract'
import {
  sameBindingKey,
  type AdoptionPlan,
  type FreezeVerdict,
  type ToolAuthority,
  type ToolBindingKey,
  type ToolBindingRegistry,
  type ToolBindingScope,
  type ToolLoadedRegistration,
} from '@omne-harness/tool-contract/provider'
import type { ToolGenerations, ToolLoadFailure, ToolLoadState } from './cordis.ts'

// ---------------------------------------------------------------------------------------------
// The scripted generation coordinator
// ---------------------------------------------------------------------------------------------

/** One call that reached the scripted coordinator. `unload` and `sweep` run at the system scope. */
export type ScriptedGenerationsCall<P> = Readonly<{
  verb: 'ensureLoaded' | 'unload' | 'sweep'
  key: ToolBindingKey | null
  authority: ToolAuthority | null
  access: ToolBindingScope<P>
}>

export type ScriptedToolGenerations<P, E, B extends ContentBlock> = Readonly<{
  durability: 'none'
  generations: ToolGenerations<P, E, B>
  /**
   * Sets the answer of `ensureLoaded` for one key; a later call for the same key replaces it.
   * With `write`, a `loaded` answer first registers `write` in the registry of the double under
   * the caller's access and the caller's authority, so a later `snapshot` sees the key.
   */
  answer(
    key: ToolBindingKey,
    result: Outcome<ToolLoadState, ToolLoadFailure>,
    write?: ToolLoadedRegistration<E, B>,
  ): void
  /** Every call in arrival order, as a copy. */
  readonly calls: readonly ScriptedGenerationsCall<P>[]
}>

type GenerationsScript<E, B extends ContentBlock> = Readonly<{
  key: ToolBindingKey
  result: Outcome<ToolLoadState, ToolLoadFailure>
  write: ToolLoadedRegistration<E, B> | undefined
}>

/**
 * Builds the scripted coordinator. `ensureLoaded` finds the script by the binding key of the
 * authority (its layer and asset); without a script it answers `unavailable`. `unload` answers
 * `retained` and `sweep` an empty report; both only record the call. `loaderFor` calls
 * `missing('loaderFor')`; the testing entry passes one that throws `NotApplicable`. A scripted write that the registry refuses, or that comes with the system scope,
 * throws: the script is wrong, and the double must not answer `loaded` for a key it did not write.
 */
export function scriptedToolGenerations<P, E, B extends ContentBlock>(
  input: Readonly<{ registry?: ToolBindingRegistry<P, E, B> }>,
  missing: (handle: string) => never,
): ScriptedToolGenerations<P, E, B> {
  const { registry } = input
  const scripts: GenerationsScript<E, B>[] = []
  const calls: ScriptedGenerationsCall<P>[] = []
  const record = (call: ScriptedGenerationsCall<P>): void => {
    calls.push(Object.freeze(call))
  }

  const register = (
    write: ToolLoadedRegistration<E, B>,
    authority: ToolAuthority,
    access: ToolBindingScope<P>,
  ): void => {
    if (registry === undefined) throw new Error('a scripted write needs the registry of the double')
    if ('scope' in access) throw new Error('a scripted write needs the access of a tenant')
    const written = registry.register({ ...access, loaded: write, authority })
    if ('failure' in written)
      throw new Error(`the registry refused the scripted write: ${JSON.stringify(written.failure)}`)
  }

  const generations: ToolGenerations<P, E, B> = {
    async ensureLoaded({ authority, access }) {
      const key: ToolBindingKey = { layer: authority.layer, asset: authority.asset }
      record({ verb: 'ensureLoaded', key, authority, access })
      const script = scripts.find(item => sameBindingKey(item.key, key))
      if (script === undefined)
        return fail({ kind: 'unavailable', diagnostic: 'no script for this key' })
      if (
        'ok' in script.result &&
        script.result.ok.state === 'loaded' &&
        script.write !== undefined
      )
        register(script.write, authority, access)
      return script.result
    },
    async unload({ key }) {
      record({ verb: 'unload', key, authority: null, access: { scope: 'system' } })
      return succeed(Object.freeze({ state: 'retained' as const }))
    },
    async sweep() {
      record({ verb: 'sweep', key: null, authority: null, access: { scope: 'system' } })
      return succeed(Object.freeze({ reloaded: Object.freeze([]), unloaded: Object.freeze([]) }))
    },
    loaderFor() {
      return missing('loaderFor')
    },
  }

  return Object.freeze({
    durability: 'none' as const,
    generations: Object.freeze(generations),
    answer(key, result, write) {
      if (write !== undefined && registry === undefined)
        throw new TypeError('a scripted write needs the registry of the double')
      const index = scripts.findIndex(item => sameBindingKey(item.key, key))
      const script = Object.freeze({ key, result, write })
      if (index < 0) scripts.push(script)
      else scripts[index] = script
    },
    get calls() {
      return Object.freeze([...calls])
    },
  } satisfies ScriptedToolGenerations<P, E, B>)
}

// ---------------------------------------------------------------------------------------------
// The scripted adoption point
// ---------------------------------------------------------------------------------------------

/** One recorded resident item, as `residentToolFacts` writes it: capability, key text and shape. */
export type AdoptionPointRecorded = Extract<
  ReturnType<typeof residentToolFacts>,
  Readonly<{ ok: unknown }>
>['ok']

/** What Session hands to the adoption point: the recorded resident items and the wanted capabilities. */
export type AdoptionPointInput = Readonly<{
  recorded: readonly AdoptionPointRecorded[]
  capabilities: readonly string[]
}>

/**
 * The adoption material and the freeze verdict. With `R = ResidentTool` and
 * `K = ResidentAdoption['keys'][number]` the material has the form of `ResidentAdoption`.
 */
export type AdoptionPointAnswer<R, K> = Readonly<{
  material: Readonly<{ residents: readonly R[]; keys: readonly K[] }>
  verdict: FreezeVerdict | null
}>

/** The script of one capability: the plan it stands for and its part of the material. */
export type AdoptionPointScript<R, K> = Readonly<{
  plan: AdoptionPlan
  key?: K
  residents?: readonly R[]
}>

export type AdoptionPointCall<P> = Readonly<{ access: Access<P>; input: AdoptionPointInput }>

export type ScriptedAdoptionPoint<P, R, K> = Readonly<{
  durability: 'none'
  plan(
    access: Access<P>,
    input: AdoptionPointInput,
  ): Promise<Outcome<AdoptionPointAnswer<R, K>, Readonly<{ kind: 'unavailable' }>>>
  /** Sets the script of one capability; a later call for the same capability replaces it. */
  script(capability: string, answer: AdoptionPointScript<R, K> | 'unavailable'): void
  /** Every call in arrival order, as a copy. */
  readonly calls: readonly AdoptionPointCall<P>[]
}>

/**
 * Builds the scripted adoption point. `plan` takes the caller's access, never a bare tenant. It
 * answers for each capability of `recorded` and of `capabilities`, recorded first, once each.
 * When any of them has no script or is scripted `unavailable`, the whole answer is `unavailable`.
 * Otherwise the material joins the `key` and `residents` parts in that order, and the verdict is
 * the one of the first capability whose plan is `freeze`, or null.
 */
export function createScriptedAdoptionPoint<P, R = unknown, K = unknown>(): ScriptedAdoptionPoint<
  P,
  R,
  K
> {
  const scripts = new Map<string, AdoptionPointScript<R, K> | 'unavailable'>()
  const calls: AdoptionPointCall<P>[] = []

  return Object.freeze({
    durability: 'none' as const,
    async plan(access, input) {
      calls.push(Object.freeze({ access, input }))
      const wanted = [
        ...new Set([...input.recorded.map(item => item.capability), ...input.capabilities]),
      ]
      const keys: K[] = []
      const residents: R[] = []
      let verdict: FreezeVerdict | null = null
      for (const capability of wanted) {
        const script = scripts.get(capability)
        if (script === undefined || script === 'unavailable') return fail({ kind: 'unavailable' })
        if (script.key !== undefined) keys.push(script.key)
        if (script.residents !== undefined) residents.push(...script.residents)
        if (verdict === null && script.plan.kind === 'freeze') verdict = script.plan.verdict
      }
      const material = Object.freeze({
        residents: Object.freeze(residents),
        keys: Object.freeze(keys),
      })
      return succeed(Object.freeze({ material, verdict }))
    },
    script(capability, answer) {
      scripts.set(capability, answer)
    },
    get calls() {
      return Object.freeze([...calls])
    },
  } satisfies ScriptedAdoptionPoint<P, R, K>)
}
