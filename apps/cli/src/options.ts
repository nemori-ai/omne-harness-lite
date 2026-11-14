export interface OptionRules {
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  readonly switches?: readonly string[]
}

export type OptionRead =
  | { readonly kind: 'options'; readonly values: ReadonlyMap<string, string> }
  | { readonly kind: 'unrecognized' }
  | { readonly kind: 'missing'; readonly option: string }

export function readOptions(args: readonly string[], rules: OptionRules): OptionRead {
  const values = new Map<string, string>()
  const switches = rules.switches ?? []
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index] ?? ''
    const value = args[index + 1]
    if (switches.includes(name)) {
      if (values.has(name)) return { kind: 'unrecognized' }
      values.set(name, '')
      index -= 1
      continue
    }
    if (!rules.accepted.includes(name) || values.has(name)) return { kind: 'unrecognized' }
    if (value === undefined || rules.accepted.includes(value) || switches.includes(value))
      return { kind: 'unrecognized' }
    values.set(name, value)
  }
  const missing = rules.required.find(name => !values.has(name))
  if (missing !== undefined) return { kind: 'missing', option: missing }
  return { kind: 'options', values }
}
