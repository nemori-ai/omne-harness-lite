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

export function readOptions(args: readonly string[], rules: OptionRules): OptionRead {
  const values = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const switches = rules.switches ?? []
  const repeatable = rules.repeatable ?? []
  const named = (word: string) => rules.accepted.includes(word) || switches.includes(word)
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index] ?? ''
    if (values.has(name)) return { kind: 'unrecognized' }
    if (switches.includes(name)) {
      values.set(name, '')
      continue
    }
    index += 1
    const value = args[index]
    if (!rules.accepted.includes(name) || value === undefined || named(value))
      return { kind: 'unrecognized' }
    if (repeatable.includes(name)) lists.set(name, [...(lists.get(name) ?? []), value])
    else values.set(name, value)
  }
  const missing = rules.required.find(name => !values.has(name))
  if (missing !== undefined) return { kind: 'missing', option: missing }
  return { kind: 'options', values, lists }
}
