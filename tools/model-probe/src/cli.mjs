import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { collectCatalog } from './catalog.mjs'
import { runProbes } from './run.mjs'

export async function main(args) {
  const [command, ...options] = args
  const values = new Map()
  for (let i = 0; i < options.length; i += 2) {
    if (!options[i]?.startsWith('--') || options[i + 1] === undefined || values.has(options[i]))
      throw new Error('Expected unique --option value pairs')
    values.set(options[i], options[i + 1])
  }
  const option = key => {
    if (!values.has(key)) throw new Error(`Required option ${key}`)
    return values.get(key)
  }
  if (command === 'catalog') {
    if ([...values.keys()].some(k => k !== '--output')) throw new Error('Unknown catalog option')
    const path = option('--output')
    const snapshot = await collectCatalog()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' })
    console.log(
      JSON.stringify({
        inspected: snapshot.cards.length,
        present: snapshot.cards.filter(c => c.state === 'directory_present').length,
        certification: 'unverified',
        output: path,
      }),
    )
  } else if (command === 'run') {
    const allowed = ['--config', '--snapshot', '--credential-file', '--ledger', '--output']
    if ([...values.keys()].some(k => !allowed.includes(k))) throw new Error('Unknown run option')
    const config = JSON.parse(await readFile(option('--config'), 'utf8'))
    const snapshot = JSON.parse(await readFile(option('--snapshot'), 'utf8'))
    const result = await runProbes(config, snapshot, {
      credentialFile: option('--credential-file'),
      ledgerPath: option('--ledger'),
      outputDirectory: option('--output'),
    })
    console.log(
      JSON.stringify({
        completedRequests: result.results.length,
        ledger: option('--ledger'),
        output: option('--output'),
      }),
    )
  } else throw new Error('Use catalog or run; paid requests require an explicit run configuration')
}
