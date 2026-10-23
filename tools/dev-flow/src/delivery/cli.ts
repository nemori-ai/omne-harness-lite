#!/usr/bin/env node
import { lstatSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, sep } from 'node:path'
import { IntegrationError } from '../integration/parse.ts'
import { POLICY_PATH, parsePolicy } from '../integration/policy.ts'
import { collectDelivery } from './github-read.ts'
import { LINES_PATH, parseDeliveryLines } from './lines.ts'
import { readJson, repositoryFile } from './repository-files.ts'
import { observeDelivery } from './observe.ts'
import { InputError, parseBaseline, parseCapture, parseConfig } from './protocol.ts'

const usage =
  'Usage: omne-delivery --config <file> (--capture <file> | --live [--save-capture <file>]) [--baseline <report>] [--report <file>] [--lines <file>] [--registry <file>]'
function argumentsOf(args: string[]): {
  config: string
  source: { kind: 'capture'; path: string } | { kind: 'live'; save: string | null }
  baseline: string | null
  report: string | null
  lines: string
  registry: string
} {
  const values = new Map<string, string>(),
    flags = new Set<string>()
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--live' && !flags.has(flag)) {
      flags.add(flag)
      continue
    }
    const value = args[index + 1]
    if (
      flag === undefined ||
      ![
        '--config',
        '--capture',
        '--save-capture',
        '--baseline',
        '--report',
        '--lines',
        '--registry',
      ].includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      value === '' ||
      values.has(flag)
    )
      throw new InputError(usage)
    values.set(flag, value)
    index += 1
  }
  const config = values.get('--config'),
    capture = values.get('--capture'),
    live = flags.has('--live'),
    save = values.get('--save-capture') ?? null,
    baseline = values.get('--baseline') ?? null,
    report = values.get('--report') ?? null,
    lines = values.get('--lines') ?? repositoryFile(LINES_PATH),
    registry = values.get('--registry') ?? repositoryFile(POLICY_PATH)
  if (config === undefined || (capture !== undefined) === live || (save !== null && !live))
    throw new InputError(usage)
  const inputs = [config, capture, baseline, lines, registry]
    .filter((path): path is string => path !== undefined && path !== null)
    .map(fileIdentity)
  const outputs = [save, report].filter((path): path is string => path !== null).map(fileIdentity)
  const all = [...inputs, ...outputs]
  if (
    outputs.some(path => inputs.includes(path)) ||
    new Set(outputs).size !== outputs.length ||
    all.some((identity, index) => index >= inputs.length && all.slice(0, index).includes(identity))
  )
    throw new InputError('Output files must not overwrite inputs or one another')
  return {
    config,
    source: capture === undefined ? { kind: 'live', save } : { kind: 'capture', path: capture },
    baseline,
    report,
    lines,
    registry,
  }
}
function fileIdentity(path: string, links = 0): string {
  try {
    const stat = statSync(path)
    if (!stat.isFile()) throw new InputError('Input and output paths must refer to regular files')
    return `${stat.dev}:${stat.ino}`
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ELOOP')
      throw new InputError('Input or output symlink chain is cyclic or too long')
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  const parent = realpathSync.native(dirname(path))
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      if (links >= 40) throw new InputError('Input or output symlink chain is cyclic or too long')
      const target = readlinkSync(path)
      return fileIdentity(isAbsolute(target) ? target : `${parent}${sep}${target}`, links + 1)
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  return join(parent, basename(path))
}
try {
  const args = argumentsOf(process.argv.slice(2)),
    config = parseConfig(readJson(args.config))
  const capture =
    args.source.kind === 'live' ? collectDelivery(config) : parseCapture(readJson(args.source.path))
  const baseline = args.baseline === null ? undefined : parseBaseline(readJson(args.baseline))
  const report = observeDelivery(config, capture, baseline, {
    lines: parseDeliveryLines(readJson(args.lines)),
    registry: parsePolicy(readJson(args.registry)),
  })
  if (args.source.kind === 'live' && args.source.save !== null)
    writeFileSync(args.source.save, `${JSON.stringify(capture, null, 2)}\n`)
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (args.report === null) process.stdout.write(output)
  else writeFileSync(args.report, output)
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read, parse or write delivery input. No report was produced.'
  process.stderr.write(`${JSON.stringify({ kind: 'delivery-input-error', message })}\n`)
  process.exitCode = 2
}
