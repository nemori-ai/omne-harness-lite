import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cases = [
  ['driver-safe', 'EnvironmentDriver', 'EnvironmentDriver', null],
  [
    'negative-local-leak',
    'EnvironmentPreparation',
    'EnvironmentPreparation-leak',
    'LocalRefusalVacates',
  ],
  [
    'negative-inspect',
    'EnvironmentPreparation',
    'EnvironmentPreparation-inspect',
    'InspectNeverAdopts',
  ],
  ['negative-cold', 'EnvironmentPreparation', 'EnvironmentPreparation-cold', 'NoColdAdoption'],
  [
    'negative-retired',
    'EnvironmentPreparation',
    'EnvironmentPreparation-retired',
    'NoRetiredAdoption',
  ],
  [
    'current-source',
    'EnvironmentPreparation',
    'EnvironmentPreparation-current-source',
    'OriginalAdapterAtForward',
  ],
  [
    'witness-b',
    'EnvironmentPreparation',
    'EnvironmentPreparation-witness-b',
    'NeverBWhileADiagnosticWaits',
  ],
  [
    'witness-quota',
    'EnvironmentPreparation',
    'EnvironmentPreparation-witness-quota',
    'NeverTwoTenantsWithAQueued',
  ],
  ['negative-driver-loop', 'EnvironmentDriver', 'EnvironmentDriver-loop', 'OneExtraPreparePerStep'],
  ['negative-driver-cache', 'EnvironmentDriver', 'EnvironmentDriver-cache', 'OnlyPreparedCached'],
  ['host-one-slot', 'EnvironmentPreparation', 'EnvironmentPreparation-one-slot', null],
  ['host-safe', 'EnvironmentPreparation', 'EnvironmentPreparation', null],
]
const controlledEnvironment = {
  ...process.env,
  LC_ALL: 'C',
  LANG: 'C',
  TZ: 'UTC',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  TERM: 'dumb',
}
for (const key of ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS'])
  delete controlledEnvironment[key]

function reading(log, exitCode, signal, expected, timedOut = false) {
  const counts = [
    ...log.matchAll(
      /([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue\./g,
    ),
  ].at(-1)
  const number = text => Number(text.replaceAll(',', ''))
  const generated = counts ? number(counts[1]) : null
  const distinct = counts ? number(counts[2]) : null
  const queue = counts ? number(counts[3]) : null
  const violations = [...log.matchAll(/Invariant ([A-Za-z][A-Za-z0-9_]*) is violated\./g)].map(
    match => match[1],
  )
  const statesInTrace = [...log.matchAll(/^State \d+: /gm)].length
  const finished = /Finished in .* at /m.test(log)
  const errors = log.split('\n').filter(line => line.startsWith('Error:'))
  const onlyExpectedErrors = errors.every(
    line =>
      line === `Error: Invariant ${expected} is violated.` ||
      line === 'Error: The behavior up to this point is:',
  )
  const complete =
    exitCode === 0 &&
    signal === null &&
    !timedOut &&
    finished &&
    queue === 0 &&
    /Model checking completed\. No error has been found\./.test(log) &&
    !/^Error:/m.test(log) &&
    violations.length === 0
  const namedCounterexample =
    exitCode === 12 &&
    signal === null &&
    !timedOut &&
    finished &&
    expected !== null &&
    violations.length === 1 &&
    violations[0] === expected &&
    /The behavior up to this point is:/.test(log) &&
    statesInTrace >= 2 &&
    generated !== null &&
    distinct !== null &&
    onlyExpectedErrors
  return {
    accepted: expected === null ? complete : namedCounterexample,
    complete,
    expectedInvariant: expected,
    violations,
    statesInTrace,
    generated,
    distinct,
    queue,
    finished,
    timedOut,
  }
}

function selfTest() {
  const count = '123 states generated, 45 distinct states found, 0 states left on queue.\n'
  const end = 'Finished in 01s at (2026-10-29 00:00:00)\n'
  const positive = `Model checking completed. No error has been found.\n${count}${end}`
  const negative = `Error: Invariant LocalRefusalVacates is violated.\nError: The behavior up to this point is:\nState 1: <Initial predicate>\ns = []\nState 2: <RefuseDispatch>\ns = []\n${count}${end}`
  const checks = [
    ['complete search', reading(positive, 0, null, null).accepted],
    ['no completion marker', !reading(count + end, 0, null, null).accepted],
    [
      'unfinished queue',
      !reading(positive.replace('0 states left', '1 states left'), 0, null, null).accepted,
    ],
    [
      'error despite zero exit',
      !reading(`Error: Parse failed\n${positive}`, 0, null, null).accepted,
    ],
    ['missing state counts', !reading(positive.replace(count, ''), 0, null, null).accepted],
    ['nonzero positive', !reading(positive, 12, null, null).accepted],
    ['named counterexample', reading(negative, 12, null, 'LocalRefusalVacates').accepted],
    ['wrong invariant', !reading(negative, 12, null, 'NoColdAdoption').accepted],
    ['wrong exit', !reading(negative, 1, null, 'LocalRefusalVacates').accepted],
    [
      'extra error after named violation',
      !reading(`${negative}Error: unexpected exception\n`, 12, null, 'LocalRefusalVacates')
        .accepted,
    ],
    [
      'negative missing counts',
      !reading(negative.replace(count, ''), 12, null, 'LocalRefusalVacates').accepted,
    ],
    [
      'missing trace',
      !reading(negative.replace(/^State .+$/gm, ''), 12, null, 'LocalRefusalVacates').accepted,
    ],
    [
      'deadlock',
      !reading(`Error: Deadlock reached.\n${count}${end}`, 11, null, 'LocalRefusalVacates')
        .accepted,
    ],
    ['timeout', !reading(negative, 12, null, 'LocalRefusalVacates', true).accepted],
    ['signal', !reading(positive, 0, 'SIGTERM', null).accepted],
  ]
  for (const [name, passed] of checks) assert.ok(passed, name)
  return { cases: checks.map(([name]) => name), passed: checks.length }
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function command(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: controlledEnvironment })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function beneath(parent, path) {
  const part = relative(parent, path)
  return (
    part !== '' &&
    part !== '..' &&
    !part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(part)
  )
}

async function execute(command, args, logPath, timeoutMs) {
  const startedAt = new Date().toISOString()
  const log = openSync(logPath, 'wx')
  let timedOut = false
  let killTimer
  const child = spawn(command, args, { env: controlledEnvironment, stdio: ['ignore', log, log] })
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child.kill('SIGKILL'), 2000)
  }, timeoutMs)
  const outcome = await new Promise(resolveResult => {
    child.once('error', error =>
      resolveResult({ exitCode: null, signal: null, error: String(error) }),
    )
    child.once('close', (exitCode, signal) => resolveResult({ exitCode, signal, error: null }))
  })
  clearTimeout(timer)
  clearTimeout(killTimer)
  closeSync(log)
  return { startedAt, endedAt: new Date().toISOString(), ...outcome, timedOut }
}

async function main() {
  if (process.argv[2] === '--self-test') {
    process.stdout.write(`${JSON.stringify(selfTest())}\n`)
    return
  }
  const [outArgument, expectedHead, selection = 'all', timeoutArgument = '300000'] =
    process.argv.slice(2)
  assert.ok(
    outArgument && /^[a-f0-9]{40}$/.test(expectedHead ?? ''),
    'usage: check-models.mjs <new-task-tmp-directory> <expected-head> [case-name|all] [timeout-ms]',
  )
  assert.ok(process.env.OMNE_TEST_SLOT_HELD, 'run through scripts/with-test-slot.sh')
  const timeoutMs = Number(timeoutArgument)
  assert.ok(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0,
    'timeout-ms must be a positive integer',
  )
  const root = realpathSync(command('git', ['rev-parse', '--show-toplevel']))
  const sourceHead = command('git', ['rev-parse', 'HEAD'])
  assert.equal(sourceHead, expectedHead, 'source HEAD differs from the granted B-stage head')
  const out = resolve(outArgument)
  const temporaryRoot = realpathSync(join(root, 'tmp'))
  assert.ok(beneath(temporaryRoot, out), 'evidence must be under this checkout tmp')
  assert.ok(!existsSync(out), 'preserve old evidence: use a new output directory')
  let ancestor = dirname(out)
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  assert.ok(
    ancestor === temporaryRoot || beneath(temporaryRoot, realpathSync(ancestor)),
    'evidence parent must not escape through a symlink',
  )
  mkdirSync(out, { recursive: true })
  const modelRoot = dirname(fileURLToPath(import.meta.url))
  const java = process.env.JAVA_BIN
  const jar = process.env.TLA2TOOLS_JAR
  assert.ok(java && jar, 'JAVA_BIN and TLA2TOOLS_JAR must name the installed tools')
  const javaVersion = spawnSync(java, ['-version'], {
    encoding: 'utf8',
    env: controlledEnvironment,
  })
  assert.equal(javaVersion.status, 0, 'Java version check failed')
  const help = spawnSync(java, ['-cp', jar, 'tlc2.TLC', '-help'], {
    encoding: 'utf8',
    env: controlledEnvironment,
  })
  const toolHelp = help.stdout + help.stderr
  writeFileSync(join(out, 'tlc-help.log'), toolHelp)
  writeFileSync(
    join(out, 'tlc-help-result.json'),
    `${JSON.stringify({ exitCode: help.status, signal: help.signal })}\n`,
  )
  assert.ok(
    [0, 1].includes(help.status) && /Usage:|SYNOPSIS/.test(toolHelp),
    'TLC help check failed',
  )
  const traceArguments = toolHelp.includes('-noGenerateSpecTE') ? ['-noGenerateSpecTE'] : []
  assert.ok(
    traceArguments.length > 0 || toolHelp.includes('-generateSpecTE'),
    'unrecognized trace-generation options',
  )
  const selected = selection === 'all' ? cases : cases.filter(([name]) => name === selection)
  assert.ok(selected.length > 0, 'unknown case')
  const sourcePaths = [
    'packages/tool/tool-contract/SPEC.md',
    'packages/tool/tool-contract/src/records.ts',
    'packages/tool/tool-contract/src/ports.ts',
    'packages/tool/tool-host-local/SPEC.md',
    'packages/tool/tool-host-local/src/scheduled-environment.ts',
    'packages/tool/tool-host-local/src/environment-input.ts',
    'packages/tool/tool-host-local/src/environment-policy.ts',
    'packages/tool/tool/src/driver.ts',
  ]
  const summary = {
    sourceHead,
    root,
    startedAt: new Date().toISOString(),
    selection,
    timeoutMs,
    environment: Object.fromEntries(
      ['LC_ALL', 'LANG', 'TZ', 'NO_COLOR', 'FORCE_COLOR', 'TERM'].map(key => [
        key,
        controlledEnvironment[key],
      ]),
    ),
    runner: { path: fileURLToPath(import.meta.url), sha256: hash(fileURLToPath(import.meta.url)) },
    java: { path: realpathSync(java), sha256: hash(java), version: javaVersion.stderr.trim() },
    jar: { path: realpathSync(jar), sha256: hash(jar) },
    traceGeneration:
      traceArguments.length > 0 ? 'explicitly disabled' : 'opt-in generation not enabled',
    toolHelp: { exitCode: help.status, sha256: hash(join(out, 'tlc-help.log')) },
    sources: sourcePaths.map(path => ({ path, sha256: hash(join(root, path)) })),
    finiteBounds: {
      tenants: ['A', 'B'],
      operations: { A: ['a1', 'a2'], B: ['b1'] },
      focus: ['a1', 'a2', 'b1'],
      globalSlots: [
        ...new Set(
          selected
            .filter(([, model]) => model === 'EnvironmentPreparation')
            .map(([, , config]) => (config.endsWith('-one-slot') ? 1 : 2)),
        ),
      ],
      perTenantSlots: 1,
      driverSteps: 2,
      livenessChecked: false,
      stateConstraints: 'none; StateView omits only the unobserved returned result label',
    },
    selfTest: selfTest(),
    runs: [],
  }
  const save = () =>
    writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  copyFileSync(fileURLToPath(import.meta.url), join(out, 'runner-snapshot.mjs'))
  save()
  for (const [name, model, config, expected] of selected) {
    const modelPath = join(modelRoot, `${model}.tla`)
    const configPath = join(modelRoot, `${config}.cfg`)
    const inputDirectory = join(out, `${name}-input`)
    mkdirSync(inputDirectory)
    const isolatedModel = join(inputDirectory, `${model}.tla`)
    const isolatedConfig = join(inputDirectory, `${config}.cfg`)
    copyFileSync(modelPath, isolatedModel)
    copyFileSync(configPath, isolatedConfig)
    assert.equal(hash(modelPath), hash(isolatedModel))
    assert.equal(hash(configPath), hash(isolatedConfig))
    const logPath = join(out, `${name}.log`)
    const args = [
      '-Xmx1536m',
      '-XX:+UseParallelGC',
      '-cp',
      jar,
      'tlc2.TLC',
      '-workers',
      '1',
      ...traceArguments,
      '-metadir',
      join(out, `${name}-states`),
      '-config',
      isolatedConfig,
      isolatedModel,
    ]
    const run = await execute(java, args, logPath, timeoutMs)
    const log = readFileSync(logPath, 'utf8')
    summary.runs.push({
      name,
      category:
        name === 'current-source'
          ? 'source-counterexample'
          : name.startsWith('witness-')
            ? 'reachability'
            : expected
              ? 'negative-control'
              : 'safety',
      command: [java, ...args],
      model: { path: modelPath, sha256: hash(modelPath) },
      config: { path: configPath, sha256: hash(configPath) },
      finiteBounds:
        model === 'EnvironmentPreparation'
          ? {
              tenants: 2,
              operations: 3,
              globalSlots: config.endsWith('-one-slot') ? 1 : 2,
              perTenantSlots: 1,
              focusChoices: 3,
            }
          : { driverSteps: 2, replies: 6, extraCallCounter: [0, 1, 2] },
      ...run,
      ...reading(log, run.exitCode, run.signal, expected, run.timedOut),
      log: { path: logPath, sha256: hash(logPath) },
    })
    save()
    process.stdout.write(
      `${name}: ${summary.runs.at(-1).accepted ? 'expected result' : 'FAILED'}\n`,
    )
    if (!summary.runs.at(-1).accepted) break
  }
  summary.endedAt = new Date().toISOString()
  summary.allExpectedResults =
    summary.runs.length === selected.length && summary.runs.every(run => run.accepted)
  summary.implementationConformance = summary.runs.some(
    run => run.category === 'source-counterexample' && run.accepted,
  )
    ? 'counterexample-found'
    : 'not-established-by-this-run'
  save()
  if (!summary.allExpectedResults) process.exitCode = 1
}

await main()
