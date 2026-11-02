export interface OptionRules {
  /** Every option name the command accepts, with its leading dashes. */
  readonly accepted: readonly string[]
  /** The options the command requires, in the order a missing one is named. */
  readonly required: readonly string[]
}

export type OptionRead =
  | { readonly kind: 'options'; readonly values: ReadonlyMap<string, string> }
  | { readonly kind: 'unrecognized' }
  | { readonly kind: 'missing'; readonly option: string }

/**
 * Reads `--name value` pairs. A value is the next word, even when it starts with a dash, unless
 * that word is itself an option of this command. A repeated option, an unknown word, `--name=value`,
 * and a stray word all count as unrecognized. A required option that is absent is named only
 * after the whole list has been read, so unrecognized words win over a missing option.
 */
export function readOptions(args: readonly string[], rules: OptionRules): OptionRead {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index] ?? ''
    const value = args[index + 1]
    if (!rules.accepted.includes(name) || values.has(name)) return { kind: 'unrecognized' }
    if (value === undefined || rules.accepted.includes(value)) return { kind: 'unrecognized' }
    values.set(name, value)
  }
  const missing = rules.required.find(name => !values.has(name))
  if (missing !== undefined) return { kind: 'missing', option: missing }
  return { kind: 'options', values }
}
