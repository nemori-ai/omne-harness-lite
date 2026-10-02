// 产品区的 topic 与验收场景行。格式契约在 `.meta_harness/design/product/conventions.md`「场景怎么编号」：
// 表格行的第一格是场景编号（1 到 3 个大写字母接数字，可再带一个小写字母；加粗、反引号都认）。
// 认行的规则与设计区对账器 `.meta_harness/tooling/src/stories.py` 的 `scenario_id` 是同一条——
// 两边各用自己的语言写，`tests/product-scenarios.spec.ts` 对着那份源码核这几个正则没有分叉。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** topic 目录名：`PF-<三位>` 开头，后面是 `-` 或什么都没有。第 1 组是三位编号。 */
export const TOPIC_DIR = /^PF-(\d{3})(?:-|$)/u
/** 场景编号；与 stories.py 的 `SCENARIO_RE` 相同。 */
export const SCENARIO_ID = /^[A-Z]{1,3}\d{1,3}[a-z]?$/u
/** 表格行里没被反斜杠转义的竖线；与 stories.py 的 `CELL_SPLIT_RE` 相同。 */
const CELL_SPLIT = /(?<!\\)\|/u

/** 去掉两端空白、`*` 与反引号：`**S1**`、`` `S4b` `` 都读成编号本身。 */
export function bareLabel(text: string): string {
  return text
    .trim()
    .replace(/^[*`]+|[*`]+$/gu, '')
    .trim()
}

/** 表格行第一格里的场景编号；不是带编号的场景行就返回 undefined。 */
export function scenarioId(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return undefined
  const first = bareLabel(trimmed.replace(/^\|+|\|+$/gu, '').split(CELL_SPLIT)[0] ?? '')
  return SCENARIO_ID.test(first) ? first : undefined
}

/** 一份 acceptance.md 里带编号的场景行：编号 → 出现的行号（1 起），按出现先后。 */
export function scenarioRows(text: string): Map<string, number[]> {
  const rows = new Map<string, number[]>()
  text.split('\n').forEach((line, index) => {
    const id = scenarioId(line)
    if (id !== undefined) rows.set(id, [...(rows.get(id) ?? []), index + 1])
  })
  return rows
}

export interface ProductTopic {
  /** 目录名，如 `PF-016-cli-tui-delivery-surface`。 */
  readonly dir: string
  /** `PF-016`。 */
  readonly topic: string
  /** 这个 topic 的 acceptance.md 里带编号的场景行；没有这份文件时为空。 */
  readonly scenarios: ReadonlyMap<string, readonly number[]>
}

const isDirectory = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory()
const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile() === true

/** 产品区下的每个 topic，按目录名排；产品区不存在返回 undefined。 */
export function readProductTopics(productRoot: string): ProductTopic[] | undefined {
  if (isDirectory(productRoot) !== true) return undefined
  return readdirSync(productRoot)
    .flatMap(dir => {
      const matched = TOPIC_DIR.exec(dir)
      if (matched === null || isDirectory(join(productRoot, dir)) !== true) return []
      const acceptance = join(productRoot, dir, 'acceptance.md')
      return [
        {
          dir,
          topic: `PF-${matched[1] ?? ''}`,
          scenarios: isFile(acceptance)
            ? scenarioRows(readFileSync(acceptance, 'utf8'))
            : new Map<string, number[]>(),
        },
      ]
    })
    .sort((a, b) => a.dir.localeCompare(b.dir))
}
