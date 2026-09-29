import { readFileSync } from 'node:fs'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { judgeAccountValue, validate, SCHEMA_DEF_NAMES, type SchemaDefName } from '../src/index.ts'

const spec = new URL(
  '../../../../.meta_harness/design/spec/data/call-accounts/v3/',
  import.meta.url,
)
const text = readFileSync(new URL('examples.md', spec), 'utf8')
export interface Example {
  readonly kind: SchemaDefName
  readonly line: number
  readonly source: string
  readonly schema: boolean
  readonly judgment: string
  readonly label?: string
}
export const examples: Example[] = []
let kind: SchemaDefName | undefined
for (const [offset, line] of text.split('\n').entries()) {
  const selected = /\*\*校验对象\*\*：`\$defs\/(\w+)`/.exec(line)?.[1]
  if (selected !== undefined) {
    kind = SCHEMA_DEF_NAMES.find(name => name === selected)
    if (kind === undefined) throw new Error(`unknown examples definition: ${selected}`)
  }
  if (line.startsWith('## 9.')) kind = undefined
  if (kind === undefined) continue
  const row = /^\| `(.+?)` \| (.+?) \| (.+?) \| (.+)\|$/.exec(line)
  if (row === null) continue
  const source = row[1]
  const shape = row[2]
  const judgment = row[3]
  if (source === undefined || shape === undefined || judgment === undefined)
    throw new Error('malformed examples table')
  const label = /\*\*([A-Z]-\d+)\*\*/.exec(row[4] ?? '')?.[1]
  examples.push({
    kind,
    line: offset + 1,
    source,
    schema: shape.includes('通过'),
    judgment: judgment.replaceAll('`', ''),
    ...(label === undefined ? {} : { label }),
  })
}
export function example(label: string) {
  const row = examples.find(row => row.label === label)
  if (row === undefined) throw new Error(`missing normative example ${label}`)
  const result = readJsonStrict(row.source)
  if ('failed' in result) throw new Error(`invalid normative JSON ${label}`)
  return result.ok
}
