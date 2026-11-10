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

const FLAGS = new Set(['--full', '--plan-only'])
const SINGLE = new Set(['--base', '--out', '--workers', '--max-lines'])
const MULTI = new Set(['--scope', '--files'])

function positive(flag: string, text: string): number {
  const value = Number(text)
  if (!Number.isInteger(value) || value < 1)
    throw new UsageError(`${flag} 要正整数，给的是 ${text}`)
  return value
}

/** 解析参数；`allowed` 之外的参数、缺值或重复的单值参数抛错。pnpm 透传的单独 `--` 跳过。 */
export function parseOptions(argv: readonly string[], allowed: readonly string[]): Options {
  const single = new Map<string, string>()
  const multi = new Map<string, string[]>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (arg === '--') continue
    if (!allowed.includes(arg)) throw new UsageError(`认不出的参数：${arg}`)
    if (FLAGS.has(arg)) flags.add(arg)
    else if (SINGLE.has(arg)) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} 要给值`)
      if (single.has(arg)) throw new UsageError(`${arg} 只能给一次`)
      single.set(arg, value)
      i += 1
    } else if (MULTI.has(arg)) {
      const values: string[] = []
      while (argv[i + 1] !== undefined && !(argv[i + 1] ?? '').startsWith('--')) {
        values.push(...(argv[i + 1] ?? '').split(',').filter(value => value !== ''))
        i += 1
      }
      if (values.length === 0) throw new UsageError(`${arg} 要给值`)
      multi.set(arg, [...(multi.get(arg) ?? []), ...values])
    }
  }
  const workers = single.get('--workers')
  const maxLines = single.get('--max-lines')
  const base = single.get('--base')
  const out = single.get('--out')
  return {
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
    ...(workers === undefined ? {} : { workers: positive('--workers', workers) }),
    ...(maxLines === undefined ? {} : { maxLines: positive('--max-lines', maxLines) }),
    scopes: multi.get('--scope') ?? [],
    files: multi.get('--files') ?? [],
    full: flags.has('--full'),
    planOnly: flags.has('--plan-only'),
  }
}
