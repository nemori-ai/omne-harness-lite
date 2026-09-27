import { readFileSync } from 'node:fs'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { expect } from 'vitest'
import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

export function json(text: string): JsonValue {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error(`invalid test JSON: ${parsed.failed}`)
  return parsed.ok
}

// Private wrapper fields are invisible to default deep equality. Numeric spelling is
// not semantic equality either: use the adopted exact comparator for every numeric leaf.
expect.addEqualityTesters([
  (left: unknown, right: unknown) => {
    const leftNumber = isJsonNumber(left),
      rightNumber = isJsonNumber(right)
    return leftNumber || rightNumber
      ? leftNumber && rightNumber && ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
      : undefined
  },
])

/** Project opaque transport values, preserving all exact numeric leaves for the tester above. */
export function canonical(value: unknown): unknown {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new Error('test comparison is not JSON')
  return copied.ok
}

export interface SourceArtifact {
  readonly path: string
  readonly sha256: string
  readonly line: number
  readonly section: string
  readonly row: string | null
  readonly kind: string
  readonly source: string
  readonly json: string
}
const fixtures: { readonly artifacts: readonly SourceArtifact[] } = JSON.parse(
  readFileSync(new URL('./fixtures/source-examples.json', import.meta.url), 'utf8'),
)
export function source(
  section: string,
  kind: string = 'inline',
  arrival = false,
): readonly SourceArtifact[] {
  return fixtures.artifacts.filter(
    artifact =>
      artifact.section.startsWith(section) &&
      artifact.kind === kind &&
      artifact.path.includes(arrival ? '/data/arrival-events/' : '/capabilities/stream-assembly/'),
  )
}
export function eventSources(section: string, arrival = false): readonly SourceArtifact[] {
  return source(section, 'inline', arrival).filter(artifact => {
    const value = json(artifact.json)
    return (
      artifact.row !== null &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !isJsonNumber(value) &&
      Object.hasOwn(value, 't')
    )
  })
}
export function expectedAt(line: number): JsonValue {
  const fixture = fixtures.artifacts.find(
    artifact =>
      artifact.line === line &&
      artifact.kind === 'json-block' &&
      artifact.path.includes('/capabilities/stream-assembly/'),
  )
  if (fixture === undefined) throw new Error(`missing expected source ${line}`)
  return json(fixture.json)
}
