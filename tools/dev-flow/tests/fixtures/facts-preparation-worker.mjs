import fs from 'node:fs'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const directory = process.argv[2]
const mode = process.argv[3] ?? 'normal'
const data = JSON.parse(fs.readFileSync(join(directory, 'input.json'), 'utf8'))
const open = fs.openSync,
  close = fs.closeSync,
  sync = fs.fsyncSync
const paths = new Map()
fs.openSync = (...args) => {
  const fd = open(...args)
  paths.set(fd, String(args[0]))
  return fd
}
fs.closeSync = fd => {
  paths.delete(fd)
  return close(fd)
}
function pause() {
  fs.writeFileSync(join(directory, 'paused'), mode)
  const deadline = Date.now() + 10_000
  while (!fs.existsSync(join(directory, 'resume'))) {
    if (Date.now() > deadline) throw new Error('fixture-pause-timeout')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
}
fs.fsyncSync = fd => {
  const path = paths.get(fd) ?? ''
  if (mode === 'intent-fsync' && path.endsWith('/intent-1.json')) {
    pause()
    throw Object.assign(new Error('injected intent fsync'), { code: 'EIO' })
  }
  if (mode === 'directory-fsync' && fs.existsSync(join(path, 'intent-1.json'))) {
    throw Object.assign(new Error('injected directory fsync'), { code: 'EIO' })
  }
  return sync(fd)
}
syncBuiltinESMExports()
const { createFactsPreparation } = await import('../../src/integration/prepare-delivery-facts.ts')
const { factsRunName } = await import('../../src/integration/prepared-facts-run.ts')
const call = args => {
  const path = args.find(a => a.startsWith('repos/')) ?? ''
  if (args[2] === 'POST') {
    if (mode === 'before-post') pause()
    const input = Object.fromEntries(
      args
        .filter(a => a.startsWith('inputs['))
        .map(a => {
          const eq = a.indexOf(']=')
          return [a.slice(7, eq), a.slice(eq + 2)]
        }),
    )
    fs.appendFileSync(join(directory, 'posts.jsonl'), JSON.stringify(input) + '\n')
    const id =
      201 + fs.readFileSync(join(directory, 'posts.jsonl'), 'utf8').trim().split('\n').length
    const run = {
      ...data.run,
      id,
      workflow_id: data.deployment.workflow.id,
      path: data.deployment.workflow.path,
      head_branch: data.deployment.workflow.ref,
      head_sha: data.deployment.workflow.head,
      display_title: factsRunName(input),
    }
    fs.writeFileSync(join(directory, `remote-run-${id}.json`), JSON.stringify(run))
    return {
      workflow_run_id: id,
      run_url: `https://api.github.com/repos/owner/repo/actions/runs/${id}`,
      html_url: `https://github.com/owner/repo/actions/runs/${id}`,
    }
  }
  const runPath = /\/actions\/runs\/(\d+)(?:\/attempts\/1)?$/.exec(path)
  if (runPath !== null)
    return JSON.parse(fs.readFileSync(join(directory, `remote-run-${runPath[1]}.json`), 'utf8'))
  const workflow = /\/actions\/workflows\/(\d+)\/runs\?/.exec(path)
  if (workflow !== null) {
    const runs = fs
      .readdirSync(directory)
      .filter(name => /^remote-run-\d+\.json$/.test(name))
      .map(name => JSON.parse(fs.readFileSync(join(directory, name), 'utf8')))
      .filter(run => run.workflow_id === Number(workflow[1]))
    return { total_count: runs.length, workflow_runs: runs }
  }
  if (!(path in data.responses)) throw new Error('Unexpected fixture endpoint: ' + path)
  return data.responses[path]
}
const prepare = createFactsPreparation({
  deployment: data.deployment,
  installationDigest: data.installation,
  historicalWorkflows: data.historicalWorkflows ?? [],
  priorInstallations: data.priorInstallations ?? [],
  assertActive: () => {},
  journalRoot: join(directory, 'journal'),
  call,
})
process.stdout.write(
  JSON.stringify(prepare(data.dispatch, { retryFailed: mode === 'retry' })) + '\n',
)
