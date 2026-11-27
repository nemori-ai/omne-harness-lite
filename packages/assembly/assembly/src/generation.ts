export type GenerationState = 'absent' | 'standby' | 'serving' | 'retiring' | 'retired' | 'failed'

/** The generations of one row: at most one stands by, at most one serves, and those that retire hold calls. */
export type Generations = Readonly<{
  issued: number
  standby: number | null
  serving: number | null
  retiring: readonly number[]
  failed: readonly number[]
  held: Readonly<Record<number, number>>
}>

export const noGenerations: Generations = {
  issued: 0,
  standby: null,
  serving: null,
  retiring: [],
  failed: [],
  held: {},
}

type Refused<Reason extends string> = Readonly<{ kind: 'refused'; reason: Reason }>

export type Prepared =
  | Readonly<{ kind: 'prepared'; generation: number; generations: Generations }>
  | Refused<'standby-exists'>

export type Promoted =
  | Readonly<{
      kind: 'promoted'
      serving: number
      superseded: number | null
      drained: readonly number[]
      generations: Generations
    }>
  | Refused<'no-standby'>

export type StandbyFailed =
  | Readonly<{ kind: 'failed'; generation: number; generations: Generations }>
  | Refused<'no-standby'>

export type Admitted =
  | Readonly<{ kind: 'admitted'; generation: number; generations: Generations }>
  | Readonly<{ kind: 'unavailable' }>

export type Finished =
  | Readonly<{ kind: 'finished'; drained: boolean; generations: Generations }>
  | Readonly<{ kind: 'nothing-held' }>

export type Fell =
  | Readonly<{ kind: 'fell'; unknown: number; generations: Generations }>
  | Readonly<{ kind: 'nothing-there' }>

const heldBy = (generations: Generations, generation: number): number =>
  generations.held[generation] ?? 0

const without = (list: readonly number[], generation: number): readonly number[] =>
  list.filter(each => each !== generation)

function holding(generations: Generations, generation: number, count: number): Generations['held'] {
  const { [generation]: _dropped, ...rest } = generations.held
  return count > 0 ? { ...rest, [generation]: count } : rest
}

export function stateOfGeneration(generations: Generations, generation: number): GenerationState {
  if (!Number.isInteger(generation) || generation < 1 || generation > generations.issued)
    return 'absent'
  if (generations.standby === generation) return 'standby'
  if (generations.serving === generation) return 'serving'
  if (generations.retiring.includes(generation)) return 'retiring'
  return generations.failed.includes(generation) ? 'failed' : 'retired'
}

export function prepareGeneration(generations: Generations): Prepared {
  if (generations.standby !== null) return { kind: 'refused', reason: 'standby-exists' }
  const generation = generations.issued + 1
  return {
    kind: 'prepared',
    generation,
    generations: { ...generations, issued: generation, standby: generation },
  }
}

/** One step: the generation that stands by serves, and the one that served takes nothing new from here on. */
export function promoteGeneration(generations: Generations): Promoted {
  const { standby, serving } = generations
  if (standby === null) return { kind: 'refused', reason: 'no-standby' }
  const retires = serving !== null && heldBy(generations, serving) > 0
  return {
    kind: 'promoted',
    serving: standby,
    superseded: serving,
    drained: serving === null || retires ? [] : [serving],
    generations: {
      ...generations,
      standby: null,
      serving: standby,
      retiring: retires ? [...generations.retiring, serving] : generations.retiring,
    },
  }
}

export function standbyFailed(generations: Generations): StandbyFailed {
  const { standby } = generations
  if (standby === null) return { kind: 'refused', reason: 'no-standby' }
  return {
    kind: 'failed',
    generation: standby,
    generations: { ...generations, standby: null, failed: [...generations.failed, standby] },
  }
}

export function admitCall(generations: Generations): Admitted {
  const { serving } = generations
  if (serving === null) return { kind: 'unavailable' }
  return {
    kind: 'admitted',
    generation: serving,
    generations: {
      ...generations,
      held: holding(generations, serving, heldBy(generations, serving) + 1),
    },
  }
}

export function finishCall(generations: Generations, generation: number): Finished {
  const left = heldBy(generations, generation) - 1
  if (left < 0) return { kind: 'nothing-held' }
  const drained = left === 0 && generations.retiring.includes(generation)
  return {
    kind: 'finished',
    drained,
    generations: {
      ...generations,
      held: holding(generations, generation, left),
      retiring: drained ? without(generations.retiring, generation) : generations.retiring,
    },
  }
}

/** `generation` went down by itself. The calls it held have an outcome nobody knows: `unknown` counts them. */
export function generationFell(generations: Generations, generation: number): Fell {
  const state = stateOfGeneration(generations, generation)
  if (state === 'absent' || state === 'retired' || state === 'failed')
    return { kind: 'nothing-there' }
  const unknown = heldBy(generations, generation)
  const held = holding(generations, generation, 0)
  if (state === 'standby')
    return {
      kind: 'fell',
      unknown,
      generations: {
        ...generations,
        held,
        standby: null,
        failed: [...generations.failed, generation],
      },
    }
  return {
    kind: 'fell',
    unknown,
    generations: {
      ...generations,
      held,
      serving: state === 'serving' ? null : generations.serving,
      retiring: without(generations.retiring, generation),
    },
  }
}
