import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readJsonStrict,
  SCHEMA_DEF_NAMES,
  type JsonValue,
  type SchemaDefName,
} from '../src/index.ts'

export const FIXTURE_DIR = resolve(import.meta.dirname, 'fixtures')
export interface ExampleRow {
  readonly section: number
  readonly line: number
  readonly defName: SchemaDefName
  readonly text: string
  readonly value: JsonValue
  readonly valid: boolean
  readonly rejection: string | undefined
}
function definition(name: string): SchemaDefName {
  const found = SCHEMA_DEF_NAMES.find(item => item === name)
  if (found === undefined) throw new Error(`unknown example definition: ${name}`)
  return found
}
export function exampleRows(): readonly ExampleRow[] {
  const lines = readFileSync(resolve(FIXTURE_DIR, 'content-examples.md'), 'utf8').split('\n')
  let section = 0
  let defName: SchemaDefName = 'ContentBlock'
  const rows: ExampleRow[] = []
  for (const [index, line] of lines.entries()) {
    const heading = /^## (\d+)\./u.exec(line)
    if (heading?.[1] !== undefined) section = Number(heading[1])
    if (section < 1 || section > 13) continue
    const target = /校验对象.*`\$defs\/([A-Za-z]+)`/u.exec(line)
    if (target?.[1] !== undefined) defName = definition(target[1])
    const row = /^\| (?:`\$defs\/([A-Za-z]+)` \| )?`(.+)` \| (通过|拒绝) \| (—|`[a-z_]+`) \|/u.exec(
      line,
    )
    if (row === null || row[2] === undefined) continue
    const result = readJsonStrict(row[2])
    if ('failed' in result) throw new Error(`invalid normative JSON at line ${index + 1}`)
    rows.push({
      section,
      line: index + 1,
      defName: row[1] === undefined ? defName : definition(row[1]),
      text: row[2],
      value: result.ok,
      valid: row[3] === '通过',
      rejection: row[4] === '—' ? undefined : row[4]?.replaceAll('`', ''),
    })
  }
  return rows
}
