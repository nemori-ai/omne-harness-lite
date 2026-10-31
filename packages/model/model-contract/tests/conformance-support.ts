import { referenceParts } from './reference-input.ts'
// Support for the tests of the conformance suite: a way to wrap the scripted subject in a provider
// that breaks exactly one obligation, and to read which obligations the suite then fails.
import type {
  CallAccess,
  ModelCalls,
  ModelConsumption,
  ModelDirectory,
  ModelHandle,
  Observation,
} from '@omne-harness/model-contract'
import type { ModelProvider } from '@omne-harness/model-contract/provider'
import {
  checkModelProviderConformance,
  type ConformanceHooks,
  type ConformanceObligation,
  type ConformanceSubject,
} from '@omne-harness/model-contract/conformance'
import {
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import { expect } from 'vitest'
import {
  DEFAULT_CAPACITY,
  DEFAULT_CONSUMER,
  DEFAULT_REQUEST,
} from '../src/conformance/conformance-defaults.ts'
import type { Scene } from '../src/conformance/conformance-types.ts'

export type Subject = ConformanceSubject<ScriptedPrincipal>

/** What a check is given, for tests that call the helpers of the suite directly. */
export function sceneOf(waitMs = 200): Scene<ScriptedPrincipal> {
  return {
    subject: createScriptedConformanceSubject(),
    request: DEFAULT_REQUEST,
    consumer: DEFAULT_CONSUMER,
    capacity: DEFAULT_CAPACITY,
    waitMs,
  }
}
type Quiesce = ModelProvider<ScriptedPrincipal>['quiesce']

export type Patch = Readonly<{
  calls?: (calls: ModelCalls<ScriptedPrincipal>) => ModelCalls<ScriptedPrincipal>
  consumption?: (
    consumption: ModelConsumption<ScriptedPrincipal>,
  ) => ModelConsumption<ScriptedPrincipal>
  instances?: (directory: ModelDirectory<ScriptedPrincipal>) => ModelDirectory<ScriptedPrincipal>
  quiesce?: (quiesce: Quiesce) => Quiesce
}>

/** The subject with parts of its provider replaced; whatever the patch leaves out is the scripted provider's. */
export function patched(subject: Subject, patch: Patch): Subject {
  const { provider } = subject
  const { runtime } = provider
  return {
    ...subject,
    provider: {
      ...provider,
      runtime: {
        calls: patch.calls?.(runtime.calls) ?? runtime.calls,
        consumption: patch.consumption?.(runtime.consumption) ?? runtime.consumption,
        instances: patch.instances?.(runtime.instances) ?? runtime.instances,
      },
      quiesce: patch.quiesce?.(provider.quiesce) ?? provider.quiesce,
    },
  }
}

/**
 * The obligations that the suite fails for the subject that `mutate` makes from a fresh scripted
 * one, and the reason it gives for each. No obligation may be left as not applicable: the scripted
 * subject gives every hook. A failure always says why.
 */
export async function failures(mutate: (subject: Subject) => Subject): Promise<
  Readonly<{
    failing: readonly ConformanceObligation[]
    reasons: readonly string[]
  }>
> {
  const report = await checkModelProviderConformance({
    subject: () => mutate(createScriptedConformanceSubject()),
    waitMs: 300,
  })
  expect(report.results.filter(result => result.status === 'not-applicable')).toEqual([])
  const failed = report.results.filter(result => result.status === 'fail')
  for (const result of failed) expect(result.detail).not.toBe('')
  return {
    failing: failed.map(result => result.obligation),
    reasons: failed.map(result => result.detail),
  }
}

export async function failingObligations(
  mutate: (subject: Subject) => Subject,
): Promise<readonly ConformanceObligation[]> {
  return (await failures(mutate)).failing
}

/** The subject with its hooks replaced by what `change` makes of the scripted ones. */
export function hooked(
  subject: Subject,
  change: (hooks: ConformanceHooks<ScriptedPrincipal>) => ConformanceHooks<ScriptedPrincipal>,
): Subject {
  if (subject.hooks === undefined) throw new Error('the scripted subject gives every hook')
  return { ...subject, hooks: change(subject.hooks) }
}

export type ObservationMap = (
  item: Observation,
  position: number,
  access: CallAccess<ScriptedPrincipal>,
) => Observation | Promise<Observation>

async function* mapped(
  source: AsyncIterable<Observation>,
  map: (item: Observation, position: number) => Observation | Promise<Observation>,
): AsyncGenerator<Observation> {
  let position = 0
  for await (const item of source) {
    yield await map(item, position)
    position += 1
  }
}

/** A directory whose handles hand out the observations of the scripted ones, changed by `map`. */
export function observedThrough(map: ObservationMap) {
  return (directory: ModelDirectory<ScriptedPrincipal>): ModelDirectory<ScriptedPrincipal> => ({
    async connect(access) {
      const route = await directory.connect(access)
      if ('failure' in route || route.ok.kind !== 'live') return route
      const handle: ModelHandle<ScriptedPrincipal> = route.ok.handle
      return succeed({
        kind: 'live',
        handle: {
          instance: handle.instance,
          observe: input =>
            mapped(handle.observe(input), (item, position) =>
              map(item, position, referenceParts(access)),
            ),
        },
      })
    },
  })
}
