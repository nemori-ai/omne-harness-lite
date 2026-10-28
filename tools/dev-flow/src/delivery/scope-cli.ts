#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileTree, listWorkspaceMembers } from '@omne-harness/repo-toolchain/core/workspace'
import { git } from '../integration/git.ts'
import { IntegrationError, json } from '../integration/parse.ts'
import { runGhCommand } from './github-read.ts'
import { LINES_PATH, parseDeliveryLines } from './lines.ts'
import { InputError, issueNumberArgument, parseConfig } from './protocol.ts'
import {
  assignReadSets,
  classifyReadConflicts,
  parseReadSetFile,
  readOverlap,
  readSets,
  REGISTERED_READ_PATTERNS,
  registeredReadPatterns,
  type ReadBasis,
  type ReadSetFile,
} from './read-set.ts'
import { readJson, repositoryFile } from './repository-files.ts'
import { fileScope, issueScope, scopeOverlap, type ScopeCard } from './scope-overlap.ts'

const usage =
  'Usage: scope-cli.ts <Issue number | binding file | read-set file>... [--include-closed] [--config <file>] [--lines <file>]'

type Input = { kind: 'issue'; number: number } | { kind: 'file'; path: string }
function options(args: string[]): {
  inputs: Input[]
  config: string
  lines: string
  includeClosed: boolean
} {
  const values = new Map<string, string>(),
    inputs: Input[] = []
  let includeClosed = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg === '--include-closed' && !includeClosed) includeClosed = true
    else if (arg === '--config' || arg === '--lines') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || values.has(arg))
        throw new InputError(usage)
      values.set(arg, value)
      index += 1
    } else if (arg.startsWith('--') || arg === '') throw new InputError(usage)
    else if (/^#?[1-9]\d*$/.test(arg)) {
      const number = issueNumberArgument(arg)
      if (number === undefined) throw new InputError(usage)
      inputs.push({ kind: 'issue', number })
    } else inputs.push({ kind: 'file', path: arg })
  }
  if (inputs.length === 0) throw new InputError(usage)
  return {
    inputs,
    config: values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json'),
    lines: values.get('--lines') ?? repositoryFile(LINES_PATH),
    includeClosed,
  }
}
/**
 * Reads the registered patterns and the tracked files at `HEAD` of this checkout, which the
 * dispatcher runs on the freeze point. A failure gives the reason, and every conflict stops.
 */
function readBasis(root: string): ReadBasis {
  try {
    const config = git(root, ['show', `HEAD:${REGISTERED_READ_PATTERNS.config}`])
    return {
      registered: registeredReadPatterns(
        json(config, REGISTERED_READ_PATTERNS.config),
        REGISTERED_READ_PATTERNS.config,
      ),
      tracked: git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD'])
        .split('\0')
        .filter(file => file !== ''),
    }
  } catch (error) {
    return {
      unknown: `cannot read ${REGISTERED_READ_PATTERNS.config} or the tracked files at HEAD: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}
try {
  const args = options(process.argv.slice(2)),
    repository = parseConfig(readJson(args.config)).repository,
    table = parseDeliveryLines(readJson(args.lines))
  const cards: ScopeCard[] = [],
    files: ReadSetFile[] = []
  for (const input of args.inputs) {
    if (input.kind === 'issue') {
      cards.push(issueScope(repository, input.number, runGhCommand))
      continue
    }
    const content = readFileSync(input.path, 'utf8'),
      file = parseReadSetFile(input.path, content)
    if (file === undefined) cards.push(fileScope(input.path, content))
    else files.push(file)
  }
  const pages = assignReadSets(
    cards.map(card => card.source),
    files,
    process.cwd(),
  )
  const overlap = scopeOverlap(cards, table, { includeClosed: args.includeClosed }),
    members = listWorkspaceMembers(fileTree(repositoryFile('')), []),
    sets = readSets(
      overlap.cards.map(card => ({ ...card, pages: pages.get(card.source) ?? [] })),
      members,
    ),
    crossings = readOverlap(overlap.cards, sets),
    { stopping: readConflicts, frozen: frozenReadConflicts } = classifyReadConflicts(
      crossings,
      crossings.length === 0 ? { registered: [], tracked: [] } : readBasis(repositoryFile('')),
    )
  const result = { ...overlap, readSets: sets, readConflicts, frozenReadConflicts }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  for (const conflict of result.conflicts)
    process.stderr.write(
      `scope-overlap: ${conflict.first} ${conflict.firstPath} <-> ${conflict.second} ${conflict.secondPath}\n`,
    )
  for (const conflict of readConflicts)
    process.stderr.write(
      `read-overlap: ${conflict.writer} ${conflict.writePath} -> ${conflict.reader} ${conflict.readPath} (${conflict.reason})\n`,
    )
  for (const conflict of frozenReadConflicts)
    process.stderr.write(
      `read-overlap-frozen: ${conflict.writer} ${conflict.writePath} -> ${conflict.reader} ${conflict.readPath}\n`,
    )
  if (result.conflicts.length > 0 || readConflicts.length > 0) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read a card, a binding or read-set file, the line table, the workspace members or GitHub. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'scope-error', message })}\n`)
  process.exitCode = 2
}
