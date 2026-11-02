import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeArchive, readArchive, compareArchives } from './archive.mjs'
import { runProcess } from './driver.mjs'
import { syntheticRounds, thresholdValue, unmeasured } from './metrics.mjs'
import { probeProduct } from './product.mjs'

const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parse(args) {
  const [command, ...rest] = args
  const permitted = {
    run: ['root', 'out', 'threshold'],
    compare: ['before', 'after'],
    selftest: ['out'],
  }[command]
  if (!permitted) throw new Error('expected run, compare, or selftest')
  const options = {}
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index].replace(/^--/, '')
    if (
      !rest[index].startsWith('--') ||
      !permitted.includes(name) ||
      options[name] !== undefined ||
      !rest[index + 1]
    )
      throw new Error(`invalid option ${rest[index]}`)
    options[name] = rest[index + 1]
  }
  for (const name of permitted.filter(name => name !== 'threshold'))
    if (!options[name]) throw new Error(`missing --${name}`)
  if (command === 'run')
    options.threshold = thresholdValue(
      options.threshold === undefined ? 1.5 : Number(options.threshold),
    )
  return { command, options }
}

async function metadata(root, kind) {
  const sha = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root })
  if (sha.exitCode !== 0) throw new Error(`cannot read target SHA: ${sha.stderr}`)
  const status = await runProcess('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: root,
  })
  if (status.exitCode !== 0) throw new Error('cannot read target worktree status')
  const held = process.env.OMNE_TEST_SLOT_HELD
  let slot = { state: 'unheld', reason: 'synthetic selftest does not hold a load slot' }
  if (held) {
    if (!existsSync(held)) throw new Error('slot environment points to a missing lock file')
    slot = { state: 'held', lockFile: held, registration: readFileSync(held, 'utf8') }
  }
  return {
    sha: sha.stdout.trim(),
    workingTreeStatus: status.stdout,
    platform: process.platform,
    osVersion: `${os.type()} ${os.release()} ${os.version()}`,
    node: process.version,
    cores: os.cpus().length,
    startedAt: new Date().toISOString(),
    slot,
    workload: {
      kind,
      ...(kind === 'synthetic'
        ? { modelDelayMs: 10, toolDelayMs: 10 }
        : { externalDelay: 'unmeasured: no approved fixed-delay installation mapping' }),
    },
  }
}

async function main() {
  let parsed
  try {
    parsed = parse(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(error.message + '\n')
    return 2
  }
  const { command, options } = parsed
  if (command === 'compare') {
    const result = compareArchives(
      readArchive(resolve(options.before)),
      readArchive(resolve(options.after)),
    )
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return result.state === 'comparable' ? 0 : 3
  }
  const out = resolve(options.out)
  if (command === 'selftest') {
    const meta = await metadata(ownRoot, 'synthetic')
    for (const [kind, expected] of [
      ['steady', 'pass'],
      ['growth', 'fail'],
      ['missing', 'blocked'],
      ['short', 'blocked'],
    ]) {
      const rounds = syntheticRounds(kind === 'growth' ? 'growth' : 'steady')
      if (kind === 'missing')
        rounds[190].ownOverhead = unmeasured('synthetic missing negative control')
      if (kind === 'short') rounds.splice(180)
      const summary = writeArchive(join(out, kind), meta, rounds)
      assert.equal(summary.median.state, expected, `synthetic ${kind} control`)
    }
    process.stdout.write('synthetic selftest controls passed; this is not a product E9 result\n')
    return 0
  }
  const root = resolve(options.root)
  if (!process.env.OMNE_TEST_SLOT_HELD) {
    const slot = join(root, 'scripts/with-test-slot.mjs')
    if (!existsSync(slot)) throw new Error('target checkout has no with-test-slot entry')
    let forwarded = 0
    const result = await runProcess(
      process.execPath,
      [
        slot,
        process.execPath,
        fileURLToPath(import.meta.url),
        'run',
        '--root',
        root,
        '--out',
        out,
        '--threshold',
        String(options.threshold),
      ],
      {
        cwd: root,
        timeoutMs: 120000,
        onOutput: text => {
          process.stdout.write(text.slice(forwarded))
          forwarded = text.length
        },
      },
    )
    process.stderr.write(result.stderr)
    return result.exitCode
  }
  if (existsSync(out)) throw new Error('run output directory already exists; use a fresh path')
  const meta = await metadata(root, 'product')
  mkdirSync(out, { recursive: true })
  const result = await probeProduct(root, out)
  meta.endedAt = new Date().toISOString()
  writeFileSync(join(out, 'processes.json'), JSON.stringify(result.raw, null, 2) + '\n')
  const summary = writeArchive(out, meta, result.rounds, options.threshold, result.observations)
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
  return summary.state === 'fail' ? 1 : 3
}

try {
  process.exitCode = await main()
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
}
