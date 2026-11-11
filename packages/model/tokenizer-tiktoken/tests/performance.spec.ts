// @module-tag slow
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { limits } from './support/executor.ts'
import { o200kResources } from './support/resources.ts'

it('counts a 24 KiB space run within a bounded child process', () => {
  const resources = o200kResources()
  const entry = new URL('../dist/index.js', import.meta.url).href
  const ranksEntry = createRequire(import.meta.url).resolve('js-tiktoken/ranks/o200k_base')
  const script = `
    const { createTiktokenExecutor } = await import(process.argv[1])
    const ranks = (await import(process.argv[2])).default
    const given = JSON.parse(process.argv[3])
    const created = await createTiktokenExecutor({ resources: [{ ...given, ranks: {
      patStr: ranks.pat_str, bpeRanks: ranks.bpe_ranks, specialTokens: ranks.special_tokens,
    } }], limits: JSON.parse(process.argv[4]) })
    if ('failure' in created) throw new Error(JSON.stringify(created.failure))
    const lease = created.ok.acquire(given.definition, new AbortController().signal)
    if ('failure' in lease) throw new Error(JSON.stringify(lease.failure))
    process.stdout.write(JSON.stringify(await lease.ok.tokenizer.count([{kind:'text', text:' '.repeat(24 * 1024)}])))
    await lease.ok.release()
    await created.ok.close()
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
      JSON.stringify(limits),
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
