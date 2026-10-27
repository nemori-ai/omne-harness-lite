// @module-tag slow — starts a Node child process that loads the built dist output from a temporary directory.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { TokenizationSegment } from '@omne-harness/model-contract/provider'
import { createTiktokenTokenizer, type TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { afterAll, expect, it } from 'vitest'
import { o200kResources, syntheticResources } from './support/resources.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const builtEntry = join(packageDirectory, 'dist/index.js')
const o200kModule = createRequire(join(packageDirectory, 'package.json')).resolve(
  'js-tiktoken/ranks/o200k_base',
)
const syntheticFixture = fileURLToPath(new URL('fixtures/synthetic-ranks.json', import.meta.url))

const samples: readonly (readonly TokenizationSegment[])[] = [
  [],
  [{ kind: 'text', text: 'hello world' }],
  [{ kind: 'text', text: 'a<|endoftext|>b' }],
  [
    { kind: 'text', text: 'hel' },
    { kind: 'text', text: 'lo' },
  ],
  [
    { kind: 'text', text: '你好' },
    { kind: 'special-token', name: '<|endoftext|>' },
  ],
  [{ kind: 'special-token', name: '<|fim|>' }],
  [{ kind: 'text', text: 'abcde <|fim|>' }],
]

/** The child loads the ranks itself and gets the rest of the resources as JSON. */
const childScript = `
import { readFileSync } from 'node:fs'
const [input] = process.argv.slice(1)
const { entry, o200kModule, syntheticFixture, resources, samples } = JSON.parse(input)
const { createTiktokenTokenizer } = await import(entry)
const o200k = (await import(o200kModule)).default
const ranks = {
  o200k: { patStr: o200k.pat_str, specialTokens: o200k.special_tokens, bpeRanks: o200k.bpe_ranks },
  synthetic: JSON.parse(readFileSync(syntheticFixture, 'utf8')),
}
const result = {}
for (const [name, given] of Object.entries(resources)) {
  const created = createTiktokenTokenizer({ ...given, ranks: ranks[name] })
  const mismatch = createTiktokenTokenizer({
    ...given,
    ranks: ranks[name],
    definition: { ...given.definition, implementation: { ...given.definition.implementation, revision: '0.0.0' } },
  })
  result[name] = {
    counts: 'ok' in created ? samples.map(sample => created.ok.count(sample)) : created,
    mismatch: 'failure' in mismatch ? mismatch.failure.kind : 'ok',
  }
}
process.stdout.write(JSON.stringify(result))
`

const temporaryDirectories: string[] = []

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true })
})

function withoutRanks(resources: TiktokenResources): Omit<TiktokenResources, 'ranks'> {
  return { definition: resources.definition, specialTokens: resources.specialTokens }
}

function sourceCounts(resources: TiktokenResources): unknown {
  const created = createTiktokenTokenizer(resources)
  if ('failure' in created) return created
  return samples.map(sample => created.ok.count(sample))
}

it('the built output, loaded in another process from another directory, counts like the source', () => {
  expect(existsSync(builtEntry), 'build the package first: dist/index.js is missing').toBe(true)
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'tokenizer-tiktoken-published-')))
  temporaryDirectories.push(cwd)
  const input = JSON.stringify({
    entry: pathToFileURL(builtEntry).href,
    o200kModule: pathToFileURL(o200kModule).href,
    syntheticFixture,
    resources: {
      o200k: withoutRanks(o200kResources()),
      synthetic: withoutRanks(syntheticResources()),
    },
    samples,
  })
  // The child gets the inherited environment without the repository's BASELINE override.
  const { BASELINE: _inherited, ...env } = process.env
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', childScript, input], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  })
  expect(JSON.parse(output)).toEqual({
    o200k: { counts: sourceCounts(o200kResources()), mismatch: 'unavailable' },
    synthetic: { counts: sourceCounts(syntheticResources()), mismatch: 'unavailable' },
  })
})
