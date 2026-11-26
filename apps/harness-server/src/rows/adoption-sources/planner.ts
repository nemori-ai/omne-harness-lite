import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  FreezeVerdict,
  ResidentAdoption,
  ResidentKey,
  SessionAccess,
} from '@omne-harness/session-contract'
import {
  decodeResidentKey,
  encodeResidentKey,
  projectResidentReferences,
  residentToolFacts,
} from '@omne-harness/tool-contract'
import {
  planAdoption,
  sameBindingKey,
  sameShape,
  type ToolAuthority,
  type ToolBindingEntry,
  type ToolBindingKey,
  type ToolBindingRegistry,
  type ToolReloadResult,
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
  /** The authority a recorded version would load under, when one can be named for it. */
  authorityOf(key: ToolBindingKey): ToolAuthority | undefined
}>
type ToolMaterial = Pick<ResidentAdoption, 'residents' | 'keys'>
type Answer = Outcome<
  Readonly<{ material: ToolMaterial; verdict: FreezeVerdict | null }>,
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
): ToolBindingKey | undefined {
  const entry = entries.find(item => keyMatches(item.key, recorded))
  if (entry !== undefined) return entry.key
  const decoded = decodeResidentKey(recorded.key)
  return 'ok' in decoded && decoded.ok.asset.name === recorded.capability ? decoded.ok : undefined
}

function recordedShape<P>(
  access: SessionAccess<P>,
  recorded: Recorded,
): ToolBindingEntry['shape'] | undefined {
  const projected = projectResidentReferences({
    references: [{ ...recorded, tenant: access.tenant, holder: access.session }],
    next: null,
  })
  if ('failure' in projected) return undefined
  const shape = projected.ok.items[0]?.shape
  return shape === undefined || shape.name !== recorded.capability ? undefined : shape
}

type Planned = Readonly<{ material: ToolMaterial } | { verdict: FreezeVerdict }>

/** The version that wins at an adoption point is the one in force now: its holder's or the release's; one live alone wins too. */
function winnerOf(
  live: readonly ToolBindingEntry[],
  definition: AdoptionDefinition | undefined,
): ToolBindingEntry | undefined {
  const named =
    definition === undefined
      ? undefined
      : live.find(entry =>
          sameBindingKey(entry.key, {
            layer: definition.authority.layer,
            asset: definition.authority.asset,
          }),
        )
  return named ?? (live.length === 1 ? live[0] : undefined)
}
type Reload = (key: ToolBindingKey) => Promise<ToolReloadResult>

/** A recorded resident judged again by the Tool's own function; a reload asks the generations coordinator first. */
async function planRecorded<P>(
  access: SessionAccess<P>,
  recorded: Recorded,
  entries: readonly ToolBindingEntry[],
  live: readonly ToolBindingEntry[],
  winner: ToolBindingEntry | undefined,
  reload: Reload,
): Promise<Planned | undefined> {
  const key = recordedKey(recorded, entries)
  if (key === undefined) return undefined
  const shape = recordedShape(access, recorded)
  if (shape === undefined) return undefined
  const facts = {
    recorded: { key, shape, usable: live.some(entry => sameBindingKey(entry.key, key)) },
    sameShape: live.filter(entry => sameShape(entry.shape, shape)).map(entry => entry.key),
    winner: winner === undefined ? null : { key: winner.key, shape: winner.shape },
    reload: null,
  }
  let plan = planAdoption(facts)
  if (plan.kind === 'reload') plan = planAdoption({ ...facts, reload: await reload(key) })
  if (plan.kind === 'reload') return undefined
  if (plan.kind === 'freeze')
    return { verdict: { ...plan.verdict, capability: recorded.capability } }
  const encoded = encodeResidentKey(plan.kind === 'replacement' ? key : plan.key)
  if ('failure' in encoded) return undefined
  return {
    material: {
      residents: [],
      keys: [{ capability: recorded.capability, key: encoded.ok as ResidentKey }],
    },
  }
}

function planInitial(
  capability: string,
  live: readonly ToolBindingEntry[],
  definition: AdoptionDefinition | undefined,
): Planned | undefined {
  if (definition === undefined || definition.authority.asset.name !== capability) return undefined
  const winner = live[0]
  if (live.length !== 1 || winner === undefined) return undefined
  const facts = residentToolFacts(winner.key, winner.shape)
  if ('failure' in facts || winner.shape.name !== capability) return undefined
  const material: ToolMaterial = {
    residents: [
      {
        capability,
        version: definition.version,
        admitted: definition.admitted,
        shape: facts.ok.shape,
      },
    ],
    keys: [{ capability, key: facts.ok.key as ResidentKey }],
  }
  return { material }
}

export function createAdoptionPlanner<P>(options: AdoptionPlannerOptions<P>) {
  const snapshot = (access: SessionAccess<P>) => options.readBindings()?.snapshot(access)

  const reloader =
    (access: SessionAccess<P>): Reload =>
    async key => {
      const generations = options.readGenerations()
      const authority = options.authorityOf(key)
      if (generations === undefined || authority === undefined) return { kind: 'unavailable' }
      const loaded = await generations.ensureLoaded({ authority, access })
      if ('ok' in loaded) return { kind: loaded.ok.state }
      const { failure } = loaded
      switch (failure.kind) {
        case 'missing':
        case 'rejected':
          return { kind: failure.kind, evidence: failure.evidence }
        case 'conflict': {
          const table = snapshot(access)
          const usable =
            table !== undefined &&
            'ok' in table &&
            table.ok.some(entry => entry.state === 'live' && sameBindingKey(entry.key, key))
          return { kind: 'conflict', usable }
        }
        default:
          return { kind: failure.kind }
      }
    }

  async function loadInitial(
    access: SessionAccess<P>,
    capability: string,
    definition: AdoptionDefinition | undefined,
  ): Promise<readonly ToolBindingEntry[] | undefined> {
    if (definition === undefined || definition.authority.asset.name !== capability) return undefined
    const generations = options.readGenerations()
    if (generations === undefined) return undefined
    const loaded = await generations.ensureLoaded({ authority: definition.authority, access })
    if ('failure' in loaded) return undefined
    const table = snapshot(access)
    if (table === undefined || 'failure' in table) return undefined
    return table.ok
  }

  async function collect(access: SessionAccess<P>, input: AdoptionPlannerInput): Promise<Answer> {
    const recorded = structuredClone(input.recorded)
    const wanted = [...new Set([...recorded.map(item => item.capability), ...input.capabilities])]
    const residents: ResidentAdoption['residents'][number][] = []
    const keys: ResidentAdoption['keys'][number][] = []
    const initial = snapshot(access)
    if (initial === undefined || 'failure' in initial) return unavailable()
    let table = initial.ok

    const reload = reloader(access)
    for (const capability of wanted) {
      const previous = recorded.find(item => item.capability === capability)
      const definition = options.definitionFor(capability)
      let entries = table.filter(entry => entry.key.asset.name === capability)
      let live = entries.filter(entry => entry.state === 'live')
      if (previous === undefined && live.length > 1) return unavailable()
      if (previous === undefined && live.length === 0) {
        const loaded = await loadInitial(access, capability, definition)
        if (loaded === undefined) return unavailable()
        table = loaded
        entries = table.filter(entry => entry.key.asset.name === capability)
        live = entries.filter(entry => entry.state === 'live')
      }
      const planned =
        previous === undefined
          ? planInitial(capability, live, definition)
          : await planRecorded(access, previous, entries, live, winnerOf(live, definition), reload)
      if (planned === undefined) return unavailable()
      if ('verdict' in planned)
        return succeed({ material: { residents, keys }, verdict: planned.verdict })
      residents.push(...planned.material.residents)
      keys.push(...planned.material.keys)
    }
    return succeed({ material: { residents, keys }, verdict: null })
  }
  return {
    plan: (access: SessionAccess<P>, input: AdoptionPlannerInput): Promise<Answer> =>
      collect(access, input).catch(unavailable),
  }
}
