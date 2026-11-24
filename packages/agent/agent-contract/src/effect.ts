import type { AssetStanding, ImpactLine, PlacedLine } from '@omne-harness/assets'

/** One capability a definition keeps resident, and whether it is there for this tenant now; null: that cannot be asked. */
export type ResidentReference = Readonly<{
  category: string
  name: string
  there: boolean | null
  /** Why it is not there, when that is known. */
  why?: string
}>

/** What is known of a definition as written: `official`, the deployment brings one of this name; `refused`, the first thing its category refuses. */
export type DefinitionFacts = Readonly<{
  name: string
  official: boolean
  refused: string | null
  residents: readonly ResidentReference[]
}>

export type DefinitionTold<Line> = Readonly<{ lines: readonly Line[]; advice: string | null }>

/** The point each category of resident is told on. */
export type ResidentPoints = Readonly<Record<string, string>>

const TOOL = 'tool'
const NOUNS: Readonly<Record<string, string>> = { mcp: 'mcp endpoint' }
const nounOf = (category: string) => NOUNS[category] ?? category
const article = (noun: string) => (/^[aeiou]/u.test(noun) || noun.startsWith('mcp') ? 'an' : 'a')

function missing(resident: ResidentReference): string {
  const what = `its resident ${nounOf(resident.category)} ${resident.name} is not there now`
  return resident.category === TOOL
    ? `${what}: a session with it cannot start until it is`
    : `${what}${resident.why === undefined ? '' : ` (${resident.why})`}: a session with it starts without it`
}

const pointOf = (points: ResidentPoints, resident: ResidentReference) =>
  points[resident.category] ?? resident.category

/** What publishing a directory as an Agent definition would do, said to the agent that is about to publish it. */
export function definitionImpact(
  point: string,
  points: ResidentPoints,
  facts: DefinitionFacts,
): DefinitionTold<ImpactLine> {
  const own = (mark: ImpactLine['mark'], says: string): ImpactLine => ({
    mark,
    of: null,
    point,
    key: facts.name,
    says,
  })
  if (facts.refused !== null)
    return { lines: [own('!', `→ would be refused: ${facts.refused}`)], advice: null }
  if (facts.official)
    return {
      lines: [
        own(
          '!',
          `→ would be held and not in effect: the definition ${facts.name} of the deployment stands and cannot be replaced`,
        ),
      ],
      advice: 'Publish it under another name.',
    }
  const absent = facts.residents.filter(resident => resident.there === false)
  return {
    lines: [
      own(
        '+',
        '→ held; work can be handed to it with Agents, and a session made with it, from now',
      ),
      ...absent.map((resident): ImpactLine => ({
        mark: '!',
        of: resident.name,
        point: pointOf(points, resident),
        key: resident.name,
        says: `→ ${missing(resident)}`,
      })),
    ],
    advice: null,
  }
}

/** Where a held definition stands, and each capability it keeps resident beside it. */
export function definitionPlaces(
  point: string,
  points: ResidentPoints,
  standing: AssetStanding | undefined,
  facts: DefinitionFacts,
): Readonly<{ places: readonly PlacedLine[]; advice: string | null }> {
  const own = (word: string, says: string): PlacedLine => ({
    point,
    key: facts.name,
    standing: word,
    says,
  })
  if (standing === undefined)
    return { places: [own('not known', 'how this one stands cannot be read now')], advice: null }
  if (standing.kind === 'unavailable')
    return {
      places: [own('not known', `the ${standing.layer} layer cannot be read now`)],
      advice: null,
    }
  if (standing.kind === 'filtered') {
    const why = standing.by === undefined ? standing.reason : `${standing.reason} by ${standing.by}`
    return { places: [own('not in effect', why)], advice: null }
  }
  if (facts.refused !== null)
    return {
      places: [own('not in effect', `it is held and not used: ${facts.refused}`)],
      advice: null,
    }
  const residents = facts.residents.map((resident): PlacedLine => {
    const noun = nounOf(resident.category)
    return {
      point: pointOf(points, resident),
      key: resident.name,
      standing:
        resident.there === null ? 'not known' : resident.there ? 'in effect' : 'not in effect',
      says:
        resident.there === false
          ? missing(resident)
          : `${article(noun)} ${noun} this definition keeps resident`,
    }
  })
  const stopped = facts.residents.some(
    resident => resident.category === TOOL && resident.there === false,
  )
  return {
    places: [
      stopped
        ? own('not in effect', 'a session with it cannot start now: a resident tool is not there')
        : own('selected', 'work can be handed to it now, and a session made with it'),
      ...residents,
    ],
    advice: null,
  }
}
