import { createRequire } from 'node:module'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import os from 'node:os'
import { execute, pnpmCommand } from './process.mjs'
import { summarize, conclusion } from './results.mjs'

export function assertWslPath(root) {
  if (/^\/mnt\/[a-z](?:\/|$)/i.test(root) || /[\\/]mnt[\\/][a-z](?:[\\/]|$)/i.test(root))
    throw new Error('Checkout must be in the WSL filesystem, outside /mnt/<drive>')
  let current = resolve(root)
  while (!existsSync(current)) current = dirname(current)
  if (/^\/mnt\/[a-z](?:\/|$)/i.test(realpathSync(current)))
    throw new Error('Checkout must be in the WSL filesystem, outside /mnt/<drive>')
}

export async function verifyCheckout(root, sha, options) {
  const git = args => execute(['git', '-c', 'color.ui=false', ...args], { ...options, cwd: root })
  const head = await git(['rev-parse', 'HEAD'])
  const actualSha = head.stdout.trim()
  if (head.code !== 0 || actualSha !== sha)
    return {
      ok: false,
      actualSha,
      reason: `HEAD ${actualSha || '(unavailable)'} does not equal requested SHA ${sha}`,
      head,
      incomplete: Boolean(head.interrupted || head.spawnError || head.code === null),
    }
  const remote = await git(['ls-remote', '--heads', 'origin'])
  if (remote.code !== 0 || !remote.stdout.trim())
    return {
      ok: false,
      actualSha,
      reason: 'Cannot read origin branches',
      remote,
      incomplete: Boolean(remote.interrupted || remote.spawnError || remote.code === null),
    }
  for (const line of remote.stdout.trim().split(/\r?\n/)) {
    const [tip, branch] = line.split(/\s+/)
    if (tip === sha) return { ok: true, actualSha, branch, tip, remote }
    const ancestor = await git(['merge-base', '--is-ancestor', sha, tip])
    if (ancestor.code === 0) return { ok: true, actualSha, branch, tip, remote }
  }
  return {
    ok: false,
    actualSha,
    reason:
      'Cannot establish requested SHA is reachable from a current origin branch (remote tips may need fetching)',
    remote,
  }
}

function unobservedProbes(reason) {
  return {
    status: 'not-run',
    reason,
    node: process.version,
    pnpm: { version: null, reason },
    wsl: { distro: process.env.WSL_DISTRO_NAME ?? null, kernel: os.release(), reason },
    systemdUser: { required: process.platform === 'linux', available: null, reason },
    satisfied: false,
  }
}

async function probe(options) {
  const pnpm = await execute(pnpmCommand(['--version']), options)
  const linux = process.platform === 'linux'
  const systemd = linux
    ? await execute(['systemctl', '--user', 'show', '--property=Version', '--value'], options)
    : null
  const distro = existsSync('/etc/os-release') ? readFileSync('/etc/os-release', 'utf8') : null
  return {
    platform: process.platform,
    release: os.release(),
    version: os.version(),
    wsl: { distro: process.env.WSL_DISTRO_NAME ?? null, kernel: os.release(), osRelease: distro },
    node: process.version,
    pnpm: { version: pnpm.stdout.trim(), ...pnpm },
    systemdUser: { required: linux, available: systemd?.code === 0, result: systemd },
    satisfied: pnpm.code === 0 && (!linux || systemd?.code === 0),
  }
}

function contained(root, path) {
  const target = resolve(root, path)
  const checked = realpathSync(target)
  const difference = relative(realpathSync(root), checked)
  if (
    difference === '..' ||
    difference.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(difference)
  )
    throw new Error(`Path resolves outside its owner: ${path}`)
  return target
}

async function runMember(root, member, index, out, options) {
  const record = {
    member: member.member,
    requested: member.tests,
    files: member.tests.map(file => ({ file, pass: 0, fail: 0, skip: 0, skipped: [] })),
    issues: [],
    failed: false,
  }
  try {
    const cwd = contained(root, member.member)
    for (const file of member.tests) contained(cwd, file)
    const require = createRequire(join(cwd, 'package.json'))
    const entry = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
    const rawPath = join(out, `member-${index}.vitest.json`)
    const stdoutPath = join(out, `member-${index}.stdout.log`)
    const stderrPath = join(out, `member-${index}.stderr.log`)
    writeFileSync(stdoutPath, '')
    writeFileSync(stderrPath, '')
    const result = await execute(
      [
        process.execPath,
        entry,
        'run',
        ...member.tests,
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${rawPath}`,
      ],
      {
        ...options,
        cwd,
        env: { OMNE_HOST_COMMAND_LINUX: '1' },
        stdout: chunk => appendFileSync(stdoutPath, chunk),
        stderr: chunk => appendFileSync(stderrPath, chunk),
      },
    )
    record.process = result
    let raw = null
    try {
      raw = JSON.parse(readFileSync(rawPath, 'utf8'))
    } catch (error) {
      record.issues.push(`Cannot read raw Vitest report: ${error.message}`)
    }
    const summary = summarize(raw, cwd, member.tests, result)
    Object.assign(record, {
      ...summary,
      rawReport: rawPath,
      process: result,
      issues: [...record.issues, ...summary.issues],
    })
  } catch (error) {
    record.issues.push(error.message)
  }
  return record
}

export async function run(config, signal) {
  const { root, sha, out, members, timeoutMs } = config
  mkdirSync(out, { recursive: true })
  if (readdirSync(out).length)
    throw new Error(
      'Output directory must be empty; choose a new directory to prevent stale evidence',
    )
  const options = { timeoutMs, signal }
  const report = {
    schemaVersion: 1,
    requestedSha: sha,
    sha: null,
    checkout: root,
    startedAt: new Date().toISOString(),
    slotHeld: Boolean(process.env.OMNE_TEST_SLOT_HELD),
    probes: unobservedProbes('Checkout verification has not completed; probes have not run'),
    platform: {
      name: process.platform,
      release: os.release(),
      version: os.version(),
      node: process.version,
    },
    timeoutMs,
    members: [],
    issues: [],
  }
  try {
    if (process.platform === 'linux' && /microsoft/i.test(os.release())) assertWslPath(root)
    report.checkoutVerification = await verifyCheckout(root, sha, options)
    report.sha = report.checkoutVerification.actualSha
    if (!report.checkoutVerification.ok) {
      report.failed = !report.checkoutVerification.incomplete
      report.issues.push(report.checkoutVerification.reason)
    } else {
      report.probes = await probe(options)
      if (!report.probes.satisfied) report.issues.push('Platform prerequisites are not satisfied')
      for (const [index, member] of members.entries()) {
        if (signal.aborted) {
          report.issues.push('Run cancelled before all members ran')
          break
        }
        report.members.push(await runMember(root, member, index, out, options))
      }
    }
  } catch (error) {
    report.issues.push(error.message)
  }
  const status = conclusion(
    report.failed || report.members.some(member => member.failed),
    report.issues.length > 0 ||
      report.members.some(member => member.issues.length > 0) ||
      report.members.length !== members.length,
  )
  Object.assign(report, status, { finishedAt: new Date().toISOString() })
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${status.conclusion}: ${join(out, 'report.json')}\n`)
  return status.exitCode
}

export async function interruptedReport(config, result) {
  const path = join(config.out, 'report.json')
  mkdirSync(config.out, { recursive: true })
  let report
  try {
    report = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    const head = await execute(['git', 'rev-parse', 'HEAD'], {
      cwd: config.root,
      timeoutMs: 10_000,
    })
    report = {
      schemaVersion: 1,
      requestedSha: config.sha,
      sha: head.code === 0 ? head.stdout.trim() : null,
      checkout: config.root,
      startedAt: result.startedAt,
      slotHeld: result.code === 75 ? false : null,
      slotHeldReason:
        result.code === 75
          ? 'Slot wait expired before the command started'
          : 'No child report survived; historical slot ownership was not observed',
      probes: unobservedProbes('No child report survived; platform probes were not observed'),
      members: [],
      issues: [],
      platform: {
        name: process.platform,
        release: os.release(),
        version: os.version(),
        node: process.version,
      },
    }
  }
  report.wrapperProcess = result
  report.issues.push(
    `Slot wrapper did not finish: ${result.interrupted ?? result.spawnError ?? result.code}`,
  )
  Object.assign(report, conclusion(report.conclusion === 'failed', true), {
    finishedAt: new Date().toISOString(),
  })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
  return report.exitCode
}
