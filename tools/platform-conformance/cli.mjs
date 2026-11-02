import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execute } from './process.mjs'
import { run, assertWslPath, interruptedReport } from './run.mjs'
import { prepare } from './prepare.mjs'

function relativePath(value) {
  if (
    !value ||
    isAbsolute(value) ||
    value.includes('\\') ||
    value.split('/').some(part => part === '..' || part === '.' || part === '')
  )
    throw new Error(`Expected a relative path without traversal: ${value}`)
  return value
}

export function parse(args) {
  const [command, ...rest] = args
  if (!['run', 'prepare-wsl'].includes(command)) throw new Error('Expected run or prepare-wsl')
  const values = {}
  const members = []
  let current
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]
    const value = rest[index + 1]
    if (
      ![
        '--root',
        '--sha',
        '--out',
        '--member',
        '--test',
        '--manifest',
        '--timeout-ms',
        '--remote',
        '--branch',
      ].includes(key) ||
      !value ||
      value.startsWith('--')
    )
      throw new Error(`Unknown option or missing value: ${key}`)
    if (key === '--member') {
      current = { member: relativePath(value), tests: [] }
      members.push(current)
    } else if (key === '--test') {
      if (!current) throw new Error('--test must follow --member')
      current.tests.push(relativePath(value))
    } else values[key.slice(2)] = value
  }
  if (!values.root || !/^[a-f0-9]{40}$/.test(values.sha ?? ''))
    throw new Error('--root and --sha with a full 40-character commit SHA are required')
  const timeoutMs = Number(values['timeout-ms'] ?? 900_000)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error('--timeout-ms must be a positive integer')
  const config = { command, root: resolve(values.root), sha: values.sha, timeoutMs }
  if (command === 'prepare-wsl') {
    if (!values.remote || !values.branch) throw new Error('--remote and --branch are required')
    return { ...config, remote: values.remote, branch: values.branch }
  }
  if (!values.out) throw new Error('--out is required')
  if (values.manifest) {
    if (members.length) throw new Error('Use either --manifest or --member/--test')
    const manifest = JSON.parse(readFileSync(resolve(values.manifest), 'utf8'))
    if (!Array.isArray(manifest)) throw new Error('Manifest must be an array of {member, tests}')
    members.push(...manifest)
  }
  if (!members.length) throw new Error('At least one member and test are required')
  const seen = new Set()
  for (const member of members) {
    relativePath(member.member)
    if (seen.has(member.member)) throw new Error(`Duplicate member: ${member.member}`)
    seen.add(member.member)
    if (!Array.isArray(member.tests) || !member.tests.length)
      throw new Error('Each member needs tests')
    for (const file of member.tests) relativePath(file)
    if (new Set(member.tests).size !== member.tests.length)
      throw new Error('Duplicate requested test')
  }
  return { ...config, out: resolve(values.out), members }
}

async function main() {
  const config = parse(process.argv.slice(2))
  if (config.command === 'prepare-wsl') assertWslPath(config.root)
  if (config.command === 'run' && existsSync(config.out) && readdirSync(config.out).length)
    throw new Error(
      'Output directory must be empty; choose a new directory to prevent stale evidence',
    )
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.on('SIGINT', cancel)
  process.on('SIGTERM', cancel)
  try {
    if (!process.env.OMNE_TEST_SLOT_HELD) {
      const slotRoot =
        config.command === 'run'
          ? config.root
          : resolve(dirname(fileURLToPath(import.meta.url)), '../..')
      const slot = resolve(slotRoot, 'scripts/with-test-slot.mjs')
      if (!existsSync(slot)) throw new Error(`Missing current checkout slot entry: ${slot}`)
      const result = await execute(
        [
          process.execPath,
          slot,
          process.execPath,
          fileURLToPath(import.meta.url),
          ...process.argv.slice(2),
        ],
        {
          cwd: slotRoot,
          timeoutMs: config.timeoutMs + 30_000,
          signal: controller.signal,
          stdout: chunk => process.stdout.write(chunk),
          stderr: chunk => process.stderr.write(chunk),
        },
      )
      if (config.command === 'run' && result.code !== 2) {
        let report
        try {
          report = JSON.parse(readFileSync(resolve(config.out, 'report.json'), 'utf8'))
        } catch {
          /* The wrapper can stop before the runner writes its report. */
        }
        if (
          result.interrupted ||
          result.spawnError ||
          ![0, 1, 3].includes(result.code) ||
          report?.exitCode !== result.code
        )
          return interruptedReport(config, result)
      }
      return result.interrupted ? 3 : (result.code ?? 3)
    }
    return config.command === 'run'
      ? await run(config, controller.signal)
      : await prepare(config, controller.signal)
  } finally {
    process.off('SIGINT', cancel)
    process.off('SIGTERM', cancel)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  }
}
