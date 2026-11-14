export class UsageError extends Error {}

export interface Options {
  readonly base?: string
  readonly scopes: readonly string[]
  readonly files: readonly string[]
  readonly full: boolean
  readonly planOnly: boolean
  readonly out?: string
  readonly workers?: number
  readonly maxLines?: number
}

type Spec =
  | { readonly kind: 'flag'; readonly field: 'full' | 'planOnly' }
  | { readonly kind: 'single'; readonly field: 'base' | 'out' }
  | { readonly kind: 'count'; readonly field: 'workers' | 'maxLines' }
  | { readonly kind: 'multi'; readonly field: 'scopes' | 'files' }

const SPECS: ReadonlyMap<string, Spec> = new Map<string, Spec>([
  ['--base', { kind: 'single', field: 'base' }],
  ['--out', { kind: 'single', field: 'out' }],
  ['--workers', { kind: 'count', field: 'workers' }],
  ['--max-lines', { kind: 'count', field: 'maxLines' }],
  ['--scope', { kind: 'multi', field: 'scopes' }],
  ['--files', { kind: 'multi', field: 'files' }],
  ['--full', { kind: 'flag', field: 'full' }],
  ['--plan-only', { kind: 'flag', field: 'planOnly' }],
])

function positive(flag: string, text: string): number {
  const value = Number(text)
  if (!Number.isInteger(value) || value < 1)
    throw new UsageError(`${flag} 要正整数，给的是 ${text}`)
  return value
}

interface Raw {
  readonly flags: Set<string>
  readonly singles: Map<string, string>
  readonly lists: Map<string, string[]>
}

function valueAfter(argv: readonly string[], at: number, arg: string): string {
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} 要给值`)
  return value
}

function valuesAfter(
  argv: readonly string[],
  at: number,
  arg: string,
): { values: string[]; consumed: number } {
  const values: string[] = []
  let consumed = 0
  for (
    let next = argv[at + 1];
    next !== undefined && !next.startsWith('--');
    next = argv[at + 1 + consumed]
  ) {
    values.push(...next.split(',').filter(value => value !== ''))
    consumed += 1
  }
  if (values.length === 0) throw new UsageError(`${arg} 要给值`)
  return { values, consumed }
}

function collect(argv: readonly string[], allowed: readonly string[]): Raw {
  const raw: Raw = { flags: new Set(), singles: new Map(), lists: new Map() }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (arg === '--') continue
    const spec = SPECS.get(arg)
    if (spec === undefined || !allowed.includes(arg)) throw new UsageError(`认不出的参数：${arg}`)
    if (spec.kind === 'flag') raw.flags.add(arg)
    else if (spec.kind === 'multi') {
      const { values, consumed } = valuesAfter(argv, i, arg)
      raw.lists.set(arg, [...(raw.lists.get(arg) ?? []), ...values])
      i += consumed
    } else {
      const value = valueAfter(argv, i, arg)
      if (raw.singles.has(arg)) throw new UsageError(`${arg} 只能给一次`)
      raw.singles.set(arg, value)
      i += 1
    }
  }
  return raw
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

function optionsOf(raw: Raw): Options {
  const options: Mutable<Options> = { scopes: [], files: [], full: false, planOnly: false }
  for (const [flag, spec] of SPECS) {
    const text = raw.singles.get(flag)
    switch (spec.kind) {
      case 'flag':
        options[spec.field] = raw.flags.has(flag)
        break
      case 'multi':
        options[spec.field] = raw.lists.get(flag) ?? []
        break
      case 'single':
        if (text !== undefined) options[spec.field] = text
        break
      case 'count':
        if (text !== undefined) options[spec.field] = positive(flag, text)
        break
    }
  }
  return options
}

export function parseOptions(argv: readonly string[], allowed: readonly string[]): Options {
  return optionsOf(collect(argv, allowed))
}
