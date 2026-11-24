import type { AssetStanding, ImpactLine, PlacedLine } from '@omne-harness/assets'

/** What is known of a directory before it is published as a tool. */
export type ScriptToolPublishFacts = Readonly<{
  name: string
  /** The deployment holds a tool of this name: a tenant publishes none under it. */
  deployed: boolean
  /** The first thing its category refuses in the directory; null when it would be taken. */
  refused: string | null
}>

export type Told = Readonly<{ lines: readonly ImpactLine[]; advice: string | null }>

/** What publishing a directory as a tool would do, said to the agent that is about to publish it. */
export function scriptToolImpact(point: string, facts: ScriptToolPublishFacts): Told {
  const line = (mark: ImpactLine['mark'], says: string): ImpactLine => ({
    mark,
    of: null,
    point,
    key: facts.name,
    says,
  })
  if (facts.deployed)
    return {
      lines: [line('!', `→ would be refused: the deployment holds a tool named ${facts.name}`)],
      advice: 'Publish it under another name.',
    }
  if (facts.refused !== null)
    return { lines: [line('!', `→ would be refused: ${facts.refused}`)], advice: null }
  return {
    lines: [line('+', '→ held; Tools of this tenant finds it and calls it from now')],
    advice: 'A call of it asks a person unless the session lets it through.',
  }
}

/** How the last load of the held version came out; `unknown` when it cannot be asked now. */
export type ScriptToolLoad = 'callable' | 'unknown' | Readonly<{ failed: string }>

/** Where a held tool stands: by the asset rules first, and when they pick it, by whether it could be loaded. */
export function scriptToolPlace(
  point: string,
  name: string,
  standing: AssetStanding | undefined,
  load: ScriptToolLoad,
): PlacedLine {
  const place = (word: string, says: string): PlacedLine => ({
    point,
    key: name,
    standing: word,
    says,
  })
  if (standing === undefined) return place('not known', 'how this one stands cannot be read now')
  if (standing.kind === 'unavailable')
    return place('not known', `the ${standing.layer} layer cannot be read now`)
  if (standing.kind === 'filtered')
    return place(
      'not in effect',
      standing.by === undefined ? standing.reason : `${standing.reason} by ${standing.by}`,
    )
  if (load === 'callable') return place('selected', 'Tools of this tenant calls it now')
  if (load === 'unknown')
    return place('not known', 'whether it could be loaded cannot be asked now')
  return place('not in effect', `it is held and could not be loaded: ${load.failed}`)
}
