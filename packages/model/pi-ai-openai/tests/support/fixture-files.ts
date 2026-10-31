// The files of the replay fixtures, rendered from the case table. The writer script and the
// fixture test share this rendering, so the files on disk are exactly the table.
import { join } from 'node:path'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'
import { LEGACY_CASES, type FixtureCase } from './legacy-cases.ts'
import { recordNamed, requestJson } from './openai.ts'

export const FIXTURES_ROOT = new URL('../fixtures/', import.meta.url)
/** The fixtures that `checkChatCompletionsFixtures` reads for the whole family: one per record. */
export const RECORDS_DIRECTORY = 'records'
/** The extra cases: each is a root with the fixture of one record. */
export const CASES_DIRECTORY = 'cases'
/**
 * The streams captured from the real gateway: a root with the fixture of one record. They are not
 * rendered from the case table; the stream is the response body byte for byte.
 */
export const CAPTURED_DIRECTORY = 'captured'

export type RenderedCase = Readonly<{
  case: FixtureCase
  /** The fixture root of the case, relative to the fixtures directory. */
  root: string
  /** The record directory below the root. */
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
