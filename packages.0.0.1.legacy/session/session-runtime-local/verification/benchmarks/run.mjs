import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { spawnSync, execFileSync } from 'node:child_process'
import { cpus, loadavg } from 'node:os'
import { createHash } from 'node:crypto'
import { runSample } from './sample.mjs'

const { values } = parseArgs({
  options: {
    candidate: { type: 'string' },
    baseline: { type: 'string' },
    output: { type: 'string' },
    sizes: { type: 'string', default: '20,200,2000' },
    'sqlite-sizes': { type: 'string', default: '20,200' },
    'history-max-entries': { type: 'string', default: '16384' },
    'history-max-bytes': { type: 'string', default: '8388608' },
    'history-max-index-references': { type: 'string', default: '262144' },
    iterations: { type: 'string', default: '10' },
    pairs: { type: 'string', default: '5' },
    'timeout-ms': { type: 'string', default: '120000' },
    smoke: { type: 'boolean', default: false },
    profile: { type: 'boolean', default: false },
    worker: { type: 'string' },
  },
})

if (values.worker) {
  const options = JSON.parse(await readFile(values.worker, 'utf8'))
  try {
    const result = await runSample(options)
    await writeFile(options.result, JSON.stringify(result, null, 2))
  } catch (error) {
    await writeFile(
      options.result,
      JSON.stringify(
        { unexpectedErrors: 1, error: error.stack ?? String(error), options },
        null,
        2,
      ),
    )
    throw error
  }
} else {
  await run()
}

function positiveInteger(value, name) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(`${name} must be a positive integer`)
  return number
}

function revision(root) {
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  return {
    head: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    status: git(['status', '--short']),
    diffSha256: createHash('sha256')
      .update(git(['diff', '--binary', 'HEAD']))
      .digest('hex'),
  }
}

async function harnessHash() {
  const hash = createHash('sha256')
  for (const name of ['artifacts.mjs', 'data.mjs', 'run.mjs', 'sample.mjs', 'sqlite.mjs']) {
    hash.update(name).update(await readFile(new URL(name, import.meta.url)))
  }
  return hash.digest('hex')
}

async function run() {
  if (!values.candidate || !values.output)
    throw new Error('Required: --candidate <built-worktree> --output <new-evidence-directory>')
  if (values.profile && values.baseline)
    throw new Error('Profile one candidate separately from baseline measurements')
  const pairs = values.smoke || values.profile ? 1 : positiveInteger(values.pairs, 'pairs')
  if (values.baseline && pairs < 5 && !values.smoke)
    throw new Error('Baseline comparison requires at least five alternated pairs')
  const sizes = values.smoke
    ? [4]
    : values.sizes.split(',').map(value => positiveInteger(value, 'size'))
  const iterations = values.smoke ? 2 : positiveInteger(values.iterations, 'iterations')
  const sqliteSizes = values.smoke
    ? [4]
    : values['sqlite-sizes'].split(',').map(value => positiveInteger(value, 'sqlite size'))
  const historyPolicy = {
    maxEntries: positiveInteger(values['history-max-entries'], 'history-max-entries'),
    maxContentBytes: positiveInteger(values['history-max-bytes'], 'history-max-bytes'),
    maxIndexReferences: positiveInteger(
      values['history-max-index-references'],
      'history-max-index-references',
    ),
  }
  const timeoutMs = positiveInteger(values['timeout-ms'], 'timeout-ms')
  const output = resolve(values.output)
  await mkdir(output, { recursive: false })
  const sides = values.baseline
    ? [
        { name: 'baseline', adapter: 'raw', root: resolve(values.baseline) },
        { name: 'candidate', adapter: 'owned', root: resolve(values.candidate) },
      ]
    : [{ name: 'candidate', adapter: 'owned', root: resolve(values.candidate) }]
  const config = {
    version: 1,
    harnessSha256: await harnessHash(),
    runMode: values.profile ? 'profile-only' : values.smoke ? 'smoke-only' : 'measurement',
    sizesInFiveRowGroups: sizes,
    sqliteSizesInFiveRowGroups: sqliteSizes,
    historyPolicy,
    policyScope:
      Object.values(historyPolicy).join(',') === '16384,8388608,262144'
        ? 'explicit CLI history policy'
        : 'custom benchmark policy; not a CLI latency claim',
    iterations,
    timeoutMs,
    pairs,
    loadAverageBefore: loadavg(),
    logicalCpus: cpus().length,
    node: process.version,
    execPath: process.execPath,
    sides: sides.map(side => ({ ...side, revision: revision(side.root) })),
  }
  await writeFile(join(output, 'config.json'), JSON.stringify(config, null, 2))
  const seedDirectory = join(output, 'seed')
  const seedInput = join(output, 'seed.input.json')
  await writeFile(
    seedInput,
    JSON.stringify(
      {
        seedOnly: true,
        root: resolve(values.candidate),
        directory: output,
        seedDirectory,
        historyPolicy,
        result: join(output, 'seed.json'),
      },
      null,
      2,
    ),
  )
  const seedRun = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--worker', seedInput],
    {
      cwd: resolve(values.candidate),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: timeoutMs,
    },
  )
  await writeFile(join(output, 'seed.stdout.log'), seedRun.stdout ?? '')
  await writeFile(join(output, 'seed.stderr.log'), seedRun.stderr ?? '')
  if (seedRun.status !== 0) throw new Error(`Seed failed. See ${output}/seed.stderr.log`)
  const seedReport = JSON.parse(await readFile(join(output, 'seed.json'), 'utf8'))
  const expectedBySize = new Map()
  const samples = []
  for (const groups of sizes) {
    for (let pair = 0; pair < pairs; pair++) {
      for (const side of sides) {
        const name = `${side.name}-${groups}-${pair}`
        const options = {
          root: side.root,
          adapter: side.adapter,
          groups,
          iterations,
          directory: output,
          seedDirectory,
          historyPolicy,
          sqlite: sqliteSizes.includes(groups),
          result: join(output, `${name}.json`),
        }
        const input = join(output, `${name}.input.json`)
        await writeFile(input, JSON.stringify(options, null, 2))
        const flags = values.profile
          ? ['--cpu-prof', `--cpu-prof-dir=${output}`, `--cpu-prof-name=${name}.cpuprofile`]
          : []
        const child = spawnSync(
          process.execPath,
          [...flags, fileURLToPath(import.meta.url), '--worker', input],
          { cwd: side.root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs },
        )
        await writeFile(join(output, `${name}.stdout.log`), child.stdout ?? '')
        await writeFile(join(output, `${name}.stderr.log`), child.stderr ?? '')
        if (child.status !== 0) {
          await writeFile(
            join(output, 'failure.json'),
            JSON.stringify(
              {
                name,
                exitCode: child.status,
                signal: child.signal,
                error: child.error?.message,
                unexpectedErrors: 1,
              },
              null,
              2,
            ),
          )
          throw new Error(`${name} failed. See ${output}/${name}.stderr.log`)
        }
        const sample = JSON.parse(await readFile(options.result, 'utf8'))
        if (sample.unexpectedErrors !== 0 || sample.sink <= 0)
          throw new Error(`${name} did not complete all checked work`)
        if (sample.sqlite !== null && sample.seedDigest !== seedReport.initialDigest)
          throw new Error(`${name} did not use the same initial database`)
        const content = JSON.stringify({
          codec: {
            rows: sample.finalCodec.rows,
            bytes: sample.finalCodec.bytes,
            digest: sample.finalCodec.digest,
          },
          sqlite:
            sample.sqlite === null
              ? null
              : {
                  rows: sample.sqlite.rows,
                  bytes: sample.sqlite.bytes,
                  digest: sample.sqlite.digest,
                },
          policy: sample.historyPolicy,
        })
        if (expectedBySize.has(groups) && expectedBySize.get(groups) !== content)
          throw new Error(`${name} produced different final content or configuration`)
        expectedBySize.set(groups, content)
        samples.push({ name, side: side.name, groups, pair, sample })
        process.stdout.write(
          `${name}: ${sample.records.length} checked operations, ${sample.expectedRejections.length} expected rejections, 0 unexpected errors\n`,
        )
      }
    }
  }
  const summary = summarize(samples)
  await writeFile(
    join(output, 'summary.json'),
    JSON.stringify(
      {
        config,
        ...summary,
        loadAverageAfter: loadavg(),
        verdict: 'Measured component results only. No CLI speedup or identified-limiter claim.',
      },
      null,
      2,
    ),
  )
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\nEvidence: ${output}\n`)
}

function stats(values) {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return {
    count: ordered.length,
    median: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    min: ordered[0],
    max: ordered.at(-1),
  }
}

function fieldStats(records, field) {
  const values = records.map(record => record[field]).filter(Number.isFinite)
  return values.length === 0 ? null : stats(values)
}

function summarize(samples) {
  const groups = new Map()
  for (const { side, groups: size, sample } of samples) {
    const processTimes = new Map()
    for (const record of sample.records) {
      const key = `${side}/${size}/${record.name}`
      if (!groups.has(key)) groups.set(key, { records: [], medians: [] })
      groups.get(key).records.push(record)
      if (!processTimes.has(key)) processTimes.set(key, [])
      processTimes.get(key).push(record.elapsedMs)
    }
    for (const [key, times] of processTimes) groups.get(key).medians.push(stats(times).median)
  }
  return {
    cases: Object.fromEntries(
      [...groups].map(([key, { records, medians }]) => [
        key,
        {
          elapsedMs: stats(records.map(record => record.elapsedMs)),
          processMedianElapsedMs: stats(medians),
          cpuMs: stats(records.map(record => record.cpuUserMs + record.cpuSystemMs)),
          rows: stats(records.map(record => record.rows)),
          bytes: fieldStats(records, 'bytes'),
          rowsReturned: fieldStats(records, 'rowsReturned'),
          sourceReads: fieldStats(records, 'sourceReads'),
          prefixReads: fieldStats(records, 'prefixReads'),
          suffixReads: fieldStats(records, 'suffixReads'),
          heapUsedDelta: stats(records.map(record => record.heapUsedDelta)),
          rssAfter: stats(records.map(record => record.rssAfter)),
        },
      ]),
    ),
  }
}
