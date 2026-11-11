// 三个命令的参数。`--scope` 与 `--files` 可跟几个值，也可重复写，也可用逗号分隔。

/** 用法错误：命令面打印它并退出 2。 */
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

/** 选项的种类与它写进 `Options` 的哪个字段：开关、单值、正整数单值、多值。表的次序就是正整数的校验次序。 */
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

/** 命令行里读到的原始值，按选项名分开放；转成 `Options` 在 `optionsOf`。 */
interface Raw {
  readonly flags: Set<string>
  readonly singles: Map<string, string>
  readonly lists: Map<string, string[]>
}

/** `argv[at]` 之后的那个值；没有或是另一个选项就报缺值。 */
function valueAfter(argv: readonly string[], at: number, arg: string): string {
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} 要给值`)
  return value
}

/** `argv[at]` 之后到下一个选项之前的全部值，逗号分隔的拆开；`consumed` 是占了几个参数。 */
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

/** 按选项表把参数收成原始值：不在 `allowed` 里（或表里没有）的、缺值的、重复的单值参数抛错。 */
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

/** 原始值写进各自的字段；没给的单值字段不出现。 */
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

/** 解析参数；`allowed` 之外的参数、缺值或重复的单值参数抛错。pnpm 透传的单独 `--` 跳过。 */
export function parseOptions(argv: readonly string[], allowed: readonly string[]): Options {
  return optionsOf(collect(argv, allowed))
}
