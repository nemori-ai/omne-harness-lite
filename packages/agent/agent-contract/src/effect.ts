import type { AssetStanding, ImpactLine, PlacedLine } from '@omne-harness/assets'

/** One tool a definition keeps resident, and whether it is there for this tenant now; null: that cannot be asked. */
export type ResidentTool = Readonly<{ name: string; there: boolean | null }>

/** What is known of a definition as written: `official`, the deployment brings one of this name; `refused`, the first thing its category refuses. */
export type DefinitionFacts = Readonly<{
  name: string
  official: boolean
  refused: string | null
  residents: readonly ResidentTool[]
  /** References of other categories, as `category/name`: kept, and without effect yet. */
  inert: readonly string[]
}>

export type DefinitionTold<Line> = Readonly<{ lines: readonly Line[]; advice: string | null }>

const inertAdvice = (inert: readonly string[]): string | null =>
  inert.length === 0
    ? null
    : `Kept and without effect yet: ${inert.join(', ')}. Only a tool reference is used.`

const missing = (tool: string) =>
  `its resident tool ${tool} is not there now: a session with it cannot start until it is`

/** What publishing a directory as an Agent definition would do, said to the agent that is about to publish it. */
export function definitionImpact(
  point: string,
  toolPoint: string,
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
  const absent = facts.residents.filter(tool => tool.there === false)
  return {
    lines: [
      own(
        '+',
        '→ held; work can be handed to it with Agents, and a session made with it, from now',
      ),
      ...absent.map((tool): ImpactLine => ({
        mark: '!',
        of: tool.name,
        point: toolPoint,
        key: tool.name,
        says: `→ ${missing(tool.name)}`,
      })),
    ],
    advice: inertAdvice(facts.inert),
  }
}

/** Where a held definition stands, and each tool it keeps resident beside it. */
export function definitionPlaces(
  point: string,
  toolPoint: string,
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
  const tools = facts.residents.map((tool): PlacedLine => ({
    point: toolPoint,
    key: tool.name,
    standing: tool.there === null ? 'not known' : tool.there ? 'in effect' : 'not in effect',
    says: tool.there === false ? missing(tool.name) : 'a tool this definition keeps resident',
  }))
  const stopped = facts.residents.some(tool => tool.there === false)
  return {
    places: [
      stopped
        ? own('not in effect', 'a session with it cannot start now: a resident tool is not there')
        : own('selected', 'work can be handed to it now, and a session made with it'),
      ...tools,
    ],
    advice: inertAdvice(facts.inert),
  }
}
