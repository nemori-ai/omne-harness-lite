import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  ResidentAdoption,
  ResidentKey,
  ResidentTool,
  SessionAccess,
} from '@omne-harness/session-contract'
import {
  encodeResidentKey,
  projectResidentReferences,
  residentToolFacts,
} from '@omne-harness/tool-contract'
import {
  planAdoption,
  sameBindingKey,
  sameShape,
  type FreezeVerdict,
  type ToolAuthority,
  type ToolBindingEntry,
  type ToolBindingKey,
  type ToolBindingRegistry,
} from '@omne-harness/tool-contract/provider'
import type { ToolGenerations } from '@omne-harness/tool-cordis-contract/cordis'

type Recorded = Extract<ReturnType<typeof residentToolFacts>, { ok: unknown }>['ok']
export type AdoptionPlannerInput = Readonly<{
  recorded: readonly Recorded[]
  capabilities: readonly string[]
}>
export type AdoptionDefinition = Readonly<{
  authority: ToolAuthority
  version: string
  admitted: DurableEvidence
}>
export type AdoptionPlannerOptions<P> = Readonly<{
  readBindings(): Pick<ToolBindingRegistry<P, unknown, never>, 'snapshot'> | undefined
  readGenerations(): Pick<ToolGenerations<P, unknown, never>, 'ensureLoaded'> | undefined
  definitionFor(capability: string): AdoptionDefinition | undefined
}>
type Answer = Outcome<
  Readonly<{ material: ResidentAdoption; verdict: FreezeVerdict | null }>,
  Readonly<{ kind: 'unavailable' }>
>
const unavailable = () => fail({ kind: 'unavailable' as const })

function keyMatches(key: ToolBindingKey, recorded: Recorded): boolean {
  const encoded = encodeResidentKey(key)
  return 'ok' in encoded && encoded.ok === recorded.key
}

function recordedKey(
  recorded: Recorded,
  entries: readonly ToolBindingEntry[],
  definition: AdoptionDefinition | undefined,
): ToolBindingKey | undefined {
  const entry = entries.find(item => keyMatches(item.key, recorded))
  if (entry !== undefined) return entry.key
  if (definition === undefined || definition.authority.asset.name !== recorded.capability)
    return undefined
  const { layer, asset } = definition.authority
  const key = { layer, asset }
  return keyMatches(key, recorded) ? key : undefined
}

function planRecorded<P>(
  access: SessionAccess<P>,
  recorded: Recorded,
  entries: readonly ToolBindingEntry[],
  live: readonly ToolBindingEntry[],
  definition: AdoptionDefinition | undefined,
): ToolBindingKey | undefined {
  const key = recordedKey(recorded, entries, definition)
  if (key === undefined) return undefined
  const projected = projectResidentReferences({
    sessions: [{ ...recorded, tenant: access.tenant, session: access.session }],
    next: null,
  })
  if ('failure' in projected) return undefined
  const shape = projected.ok.items[0]?.shape
  if (shape === undefined || shape.name !== recorded.capability) return undefined
  const winner = live[0]
  const plan = planAdoption({
    recorded: { key, shape, usable: live.some(entry => sameBindingKey(entry.key, key)) },
    sameShape: live.filter(entry => sameShape(entry.shape, shape)).map(entry => entry.key),
    winner: winner === undefined ? null : { key: winner.key, shape: winner.shape },
    reload: null,
  })
  switch (plan.kind) {
    case 'advance':
    case 'keep':
    case 'fallback':
      return plan.key
    case 'reload':
    case 'replacement':
    case 'freeze':
      return undefined
  }
}

/** Collects adoption facts only. Session owns committing the returned material. */
export function createAdoptionPlanner<P>(options: AdoptionPlannerOptions<P>) {
  const snapshot = (access: SessionAccess<P>) => options.readBindings()?.snapshot(access)

  async function plan(access: SessionAccess<P>, input: AdoptionPlannerInput): Promise<Answer> {
    const recorded = structuredClone(input.recorded)
    const wanted = [...new Set([...recorded.map(item => item.capability), ...input.capabilities])]
    const residents: ResidentTool[] = []
    const keys: ResidentAdoption['keys'][number][] = []
    let table = snapshot(access)
    if (table === undefined || 'failure' in table) return unavailable()

    for (const capability of wanted) {
      const previous = recorded.find(item => item.capability === capability)
      const definition = options.definitionFor(capability)
      let entries = table.ok.filter(entry => entry.key.asset.name === capability)
      let live = entries.filter(entry => entry.state === 'live')
      if (live.length > 1) return unavailable()
      if (previous === undefined) {
        if (definition === undefined || definition.authority.asset.name !== capability)
          return unavailable()
        if (live.length === 0) {
          const generations = options.readGenerations()
          if (generations === undefined) return unavailable()
          const loaded = await generations.ensureLoaded({ authority: definition.authority, access })
          if ('failure' in loaded) return unavailable()
          table = snapshot(access)
          if (table === undefined || 'failure' in table) return unavailable()
          entries = table.ok.filter(entry => entry.key.asset.name === capability)
          live = entries.filter(entry => entry.state === 'live')
        }
        const winner = live[0]
        if (live.length !== 1 || winner === undefined) return unavailable()
        const facts = residentToolFacts(winner.key, winner.shape)
        if ('failure' in facts || winner.shape.name !== capability) return unavailable()
        residents.push({
          capability,
          version: definition.version,
          admitted: definition.admitted,
          shape: facts.ok.shape,
        })
        // Tool validated this encoding; Session's brand adds no second wire format.
        keys.push({ capability, key: facts.ok.key as ResidentKey })
      } else {
        if (entries.length === 0) return unavailable()
        const key = planRecorded(access, previous, entries, live, definition)
        if (key === undefined) return unavailable()
        const encoded = encodeResidentKey(key)
        if ('failure' in encoded) return unavailable()
        keys.push({ capability, key: encoded.ok as ResidentKey })
      }
    }
    return succeed({ material: { residents, keys }, verdict: null })
  }
  return { plan }
}
