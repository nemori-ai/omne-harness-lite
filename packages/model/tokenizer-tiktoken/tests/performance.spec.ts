// @module-tag slow — bounds synchronous counting with an externally killed Node process.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { o200kResources } from './support/resources.ts'

it('counts a 24 KiB space run within a bounded child process', () => {
  const resources = o200kResources()
  const entry = new URL('../dist/index.js', import.meta.url).href
  const ranksEntry = createRequire(import.meta.url).resolve('js-tiktoken/ranks/o200k_base')
  const script = `
    const { createTiktokenTokenizer } = await import(process.argv[1])
    const ranks = (await import(process.argv[2])).default
    const given = JSON.parse(process.argv[3])
    const created = createTiktokenTokenizer({ ...given, ranks: {
      patStr: ranks.pat_str, bpeRanks: ranks.bpe_ranks, specialTokens: ranks.special_tokens,
    } })
    if ('failure' in created) throw new Error(JSON.stringify(created.failure))
    process.stdout.write(JSON.stringify(created.ok.count([{kind:'text', text:' '.repeat(24 * 1024)}])))
  `
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      script,
      entry,
      ranksEntry,
      JSON.stringify({ definition: resources.definition, specialTokens: resources.specialTokens }),
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      timeout: 8_000,
      killSignal: 'SIGKILL',
    },
  )
  expect(JSON.parse(output)).toEqual({ ok: { tokens: '192' } })
}, 12_000)
