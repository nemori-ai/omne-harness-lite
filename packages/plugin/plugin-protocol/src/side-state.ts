/** What a waiting plugin lacks on one side: a port, a point, or a reference a point needs, by its name. */
export type Absent = Readonly<{ kind: 'port' | 'point' | 'reference'; name: string }>

/** What a waiting plugin lacks, in words: each one by its kind and its name. */
export const lacksText = (lacks: readonly Absent[]): string =>
  lacks.map(each => `${each.kind} ${each.name}`).join(', ')

/** One plugin on one side. `over` is the older generation still live while the new one loads. */
export type SideState =
  | Readonly<{ kind: 'unwanted' }>
  | Readonly<{
      kind: 'loading'
      version: string
      next: 'keep' | 'unload' | Readonly<{ load: string }>
      over?: string
    }>
  | Readonly<{ kind: 'loaded'; version: string }>
  | Readonly<{ kind: 'failed'; version: string; reason: string }>
  | Readonly<{ kind: 'waiting'; version: string; lacks: readonly Absent[] }>
  | Readonly<{ kind: 'held'; version: string }>

export type SideEvent =
  | Readonly<{ kind: 'listed'; version: string }>
  | Readonly<{ kind: 'unlisted' }>
  | Readonly<{ kind: 'restarted' }>
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'broke'; reason: string }>
  | Readonly<{ kind: 'lacking'; lacks: readonly Absent[] }>
  | Readonly<{ kind: 'appeared' }>
  | Readonly<{ kind: 'held' }>

export type SideEffect =
  | Readonly<{ kind: 'load'; version: string }>
  | Readonly<{ kind: 'unload'; version: string }>

export type SideStep = Readonly<{ state: SideState; effects: readonly SideEffect[] }>

type Loading = Extract<SideState, { kind: 'loading' }>

export const UNWANTED: SideState = Object.freeze({ kind: 'unwanted' })

const stay = (state: SideState): SideStep => ({ state, effects: [] })
const load = (version: string): SideEffect => ({ kind: 'load', version })
const unloads = (version: string | undefined): readonly SideEffect[] =>
  version === undefined ? [] : [{ kind: 'unload', version }]

function begin(version: string, over?: string): SideStep {
  const state: Loading = {
    kind: 'loading',
    version,
    next: 'keep',
    ...(over !== undefined && { over }),
  }
  return { state, effects: [load(version)] }
}

function listed(state: SideState, version: string): SideStep {
  if (state.kind === 'unwanted') return begin(version)
  if (state.kind === 'loading') {
    const next = version === state.version ? 'keep' : { load: version }
    return stay({ ...state, next })
  }
  if (state.version === version) return stay(state)
  return state.kind === 'loaded' ? begin(version, state.version) : begin(version)
}

function unlisted(state: SideState): SideStep {
  if (state.kind === 'loading') return stay({ ...state, next: 'unload' })
  return { state: UNWANTED, effects: state.kind === 'loaded' ? unloads(state.version) : [] }
}

function restarted(state: SideState): SideStep {
  if (state.kind === 'unwanted' || state.kind === 'held') return stay(state)
  if (state.kind !== 'loading') return begin(state.version)
  if (state.next === 'unload') return stay(UNWANTED)
  return begin(state.next === 'keep' ? state.version : state.next.load)
}

/** The load in flight ended: `settled` is what it left, `fresh` the generation it brought up, when it did. */
function ended(state: Loading, settled: SideState, fresh: string | undefined): SideStep {
  const older = unloads(state.over)
  if (state.next === 'unload') return { state: UNWANTED, effects: [...unloads(fresh), ...older] }
  if (state.next === 'keep') return { state: settled, effects: older }
  if (fresh === undefined) return begin(state.next.load, state.over)
  const following = begin(state.next.load, fresh)
  return { state: following.state, effects: [...older, ...following.effects] }
}

/** Every state under everything that can happen to it: the next state, and what the loader is to do. */
export function stepSide(state: SideState, event: SideEvent): SideStep {
  switch (event.kind) {
    case 'listed':
      return listed(state, event.version)
    case 'unlisted':
      return unlisted(state)
    case 'restarted':
      return restarted(state)
    case 'done':
      if (state.kind !== 'loading') return stay(state)
      return ended(state, { kind: 'loaded', version: state.version }, state.version)
    case 'broke': {
      if (state.kind !== 'loading') return stay(state)
      const { version } = state
      return ended(state, { kind: 'failed', version, reason: event.reason }, undefined)
    }
    case 'lacking': {
      if (state.kind !== 'loading') return stay(state)
      const { version } = state
      return ended(state, { kind: 'waiting', version, lacks: event.lacks }, undefined)
    }
    case 'appeared':
      return state.kind === 'waiting' ? begin(state.version) : stay(state)
    case 'held':
      if (state.kind !== 'loading') return stay(state)
      return ended(state, { kind: 'held', version: state.version }, undefined)
  }
}
