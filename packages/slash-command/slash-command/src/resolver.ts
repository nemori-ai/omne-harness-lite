import {
  type Asker,
  type CommandCatalog,
  type Judgment,
  judge,
  lookupOf,
  type Origin,
  type SenderView,
  type Taken,
} from '@omne-harness/slash-command-contract'

/** A text to append after the person's own words, saying where it came from. */
export type Named = Readonly<{ text: string; origin: Origin }>

export type Resolved =
  | Readonly<{ kind: 'input'; appended: readonly Named[] }>
  | Readonly<{ kind: 'operation'; name: string; operation: string; args: string }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type Words<P> = Readonly<{ text: string; seen: SenderView | null; asker: Asker<P> }>

const UNCHANGED: Resolved = Object.freeze({ kind: 'input', appended: [] })
const spoken = (view: SenderView | null): boolean =>
  view !== null && (view.command !== null || view.references.length > 0)

/** `$1`…`$n` take the arguments in order, `$ARGUMENTS` takes them all; a prompt with neither gets them after a blank line. */
export function expandPrompt(prompt: string, args: string): string {
  const parts = args.match(/"[^"]*"|\S+/gu)?.map(part => part.replace(/^"|"$/gu, '')) ?? []
  if (!/\$(ARGUMENTS|[1-9][0-9]*)/u.test(prompt))
    return args === '' ? prompt : `${prompt}\n\n${args}`
  return prompt.replace(/\$(ARGUMENTS|[1-9][0-9]*)/gu, (_whole, key: string) =>
    key === 'ARGUMENTS' ? args : (parts[Number(key) - 1] ?? ''),
  )
}

function refusalOf(judgment: Exclude<Judgment, { kind: 'accepted' }>): Resolved {
  if (judgment.kind === 'changed')
    return {
      kind: 'refused',
      reason: `what was shown changed: now ${JSON.stringify(judgment.now)}, was ${JSON.stringify(judgment.was)}`,
    }
  if (judgment.reason === 'unavailable')
    return { kind: 'refused', reason: `not usable now: /${judgment.name}: ${judgment.why}` }
  return { kind: 'refused', reason: `no such command: /${judgment.name}` }
}

type Took = Readonly<{ took: Taken }> | Readonly<{ stop: Resolved }>

async function taken<P>(catalog: CommandCatalog<P>, asker: Asker<P>, full: string): Promise<Took> {
  const answer = await catalog.take(asker, full)
  if ('ok' in answer) return { took: answer.ok }
  return answer.failure === 'not-listed'
    ? { stop: { kind: 'refused', reason: `what was shown changed: ${full} cannot be named now` } }
    : { stop: { kind: 'unavailable', diagnostic: `${full} cannot be taken now` } }
}

type Accepted = Extract<Judgment, { kind: 'accepted' }>
type Commanded = Extract<Accepted['recognition'], { kind: 'command' }>

const plainOf = (judgment: Judgment): boolean =>
  judgment.kind === 'accepted' &&
  judgment.view.command === null &&
  judgment.view.references.length === 0

async function commandOf<P>(
  catalog: CommandCatalog<P>,
  asker: Asker<P>,
  recognition: Commanded,
): Promise<Resolved> {
  const answer = await taken(catalog, asker, recognition.name)
  if ('stop' in answer) return answer.stop
  const { took } = answer
  if (took.kind === 'operation')
    return {
      kind: 'operation',
      name: recognition.name,
      operation: took.operation,
      args: recognition.args,
    }
  return {
    kind: 'input',
    appended: [{ text: expandPrompt(took.text, recognition.args), origin: took.origin }],
  }
}

async function referencesOf<P>(
  catalog: CommandCatalog<P>,
  asker: Asker<P>,
  references: readonly string[],
): Promise<Resolved> {
  const appended: Named[] = []
  for (const full of references) {
    const answer = await taken(catalog, asker, full)
    if ('stop' in answer) return answer.stop
    if (answer.took.kind !== 'text')
      return { kind: 'unavailable', diagnostic: `${full} is no text` }
    appended.push({ text: answer.took.text, origin: answer.took.origin })
  }
  return { kind: 'input', appended }
}

/** Recognize against the list as it is now, compare with what was shown, take what was named; the person's words stay as they are. */
export function createResolver<P>(
  catalog: CommandCatalog<P>,
): (words: Words<P>) => Promise<Resolved> {
  return async ({ text, seen, asker }) => {
    if (!text.includes('/') && !spoken(seen)) return UNCHANGED
    const read = await catalog.read(asker)
    const judgment = judge(text, lookupOf(read.catalog), seen ?? undefined)
    const { missing } = read.catalog
    if (missing.length > 0 && (!plainOf(judgment) || spoken(seen)))
      return {
        kind: 'unavailable',
        diagnostic: `the list cannot be told in full: ${missing.join(', ')}`,
      }
    if (judgment.kind !== 'accepted') return refusalOf(judgment)
    if (judgment.recognition.kind === 'command')
      return commandOf(catalog, asker, judgment.recognition)
    return referencesOf(catalog, asker, judgment.view.references)
  }
}
