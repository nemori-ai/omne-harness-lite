import { join } from 'node:path'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'
import { LEGACY_CASES, type FixtureCase } from './legacy-cases.ts'
import { recordNamed, requestJson } from './openai.ts'

export const FIXTURES_ROOT = new URL('../fixtures/', import.meta.url)
export const RECORDS_DIRECTORY = 'records'
export const CASES_DIRECTORY = 'cases'
export const CAPTURED_DIRECTORY = 'captured'

export type RenderedCase = Readonly<{
  case: FixtureCase
  root: string
  directory: string
  files: Readonly<Record<'request.json' | 'stream.sse' | 'facts.json', string>>
}>

export function renderCase(item: FixtureCase): RenderedCase {
  const record = recordNamed(item.record)
  const root = item.slot === 'record' ? RECORDS_DIRECTORY : join(CASES_DIRECTORY, item.id)
  return {
    case: item,
    root,
    directory: join(root, fixtureDirectory(record)),
    files: {
      'request.json': `${JSON.stringify({ request: requestJson(record, item.request), body: item.body }, null, 2)}\n`,
      'stream.sse': item.stream,
      'facts.json': `${JSON.stringify(item.facts, null, 2)}\n`,
    },
  }
}

export function renderedCases(): readonly RenderedCase[] {
  return LEGACY_CASES.map(renderCase)
}
