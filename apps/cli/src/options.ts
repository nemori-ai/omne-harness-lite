export interface OptionRules {
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  readonly switches?: readonly string[]
  /** Options that may be given more than once; their values are read from `lists`, in order. */
  readonly repeatable?: readonly string[]
}

export type OptionRead =
  | {
      readonly kind: 'options'
      readonly values: ReadonlyMap<string, string>
      readonly lists: ReadonlyMap<string, readonly string[]>
    }
  | { readonly kind: 'unrecognized' }
  | { readonly kind: 'missing'; readonly option: string }

type Taken = { values: Map<string, string>; lists: Map<string, string[]> }

/** Takes one option with its value; false when the command does not take it so. */
function take(taken: Taken, rules: OptionRules, name: string, value: string | undefined): boolean {
  const named = (word: string) =>
    rules.accepted.includes(word) || (rules.switches ?? []).includes(word)
  if (!rules.accepted.includes(name) || value === undefined || named(value)) return false
  if (!(rules.repeatable ?? []).includes(name)) taken.values.set(name, value)
  else taken.lists.set(name, [...(taken.lists.get(name) ?? []), value])
  return true
}

export function readOptions(args: readonly string[], rules: OptionRules): OptionRead {
  const taken: Taken = { values: new Map(), lists: new Map() }
  const { values, lists } = taken
  const switches = rules.switches ?? []
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index] ?? ''
    if (values.has(name)) return { kind: 'unrecognized' }
    if (switches.includes(name)) {
      values.set(name, '')
      continue
    }
    index += 1
    if (!take(taken, rules, name, args[index])) return { kind: 'unrecognized' }
  }
  const missing = rules.required.find(name => !values.has(name))
  if (missing !== undefined) return { kind: 'missing', option: missing }
  return { kind: 'options', values, lists }
}
