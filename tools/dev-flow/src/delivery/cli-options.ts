import { InputError } from './protocol.ts'

export type CliOptionSchema = {
  values: readonly string[]
  flags?: readonly string[]
  positional?: boolean
}

export function parseCliOptions(
  args: readonly string[],
  schema: CliOptionSchema,
  usage: string,
): { values: Map<string, string>; flags: Set<string>; positional: string[] } {
  const values = new Map<string, string>(),
    flags = new Set<string>(),
    positional: string[] = []
  let terminated = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (!terminated && arg === '--') {
      terminated = true
    } else if (!terminated && schema.flags?.includes(arg)) {
      if (flags.has(arg)) throw new InputError(usage)
      flags.add(arg)
    } else if (!terminated && schema.values.includes(arg)) {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || values.has(arg))
        throw new InputError(usage)
      values.set(arg, value)
      index += 1
    } else if (schema.positional && (terminated || !arg.startsWith('--'))) {
      positional.push(arg)
    } else throw new InputError(usage)
  }
  return { values, flags, positional }
}
