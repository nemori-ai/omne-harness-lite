#!/usr/bin/env node
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { InputError } from '../delivery/protocol.ts'
import { toCsv } from './csv.ts'
import {
  CARD_COLUMNS,
  deriveLedger,
  MILESTONE_COLUMNS,
  WAVE_COLUMNS,
  type LedgerInputs,
} from './derive.ts'
import { readAdmission, readBoard, readCapture, readSlots } from './sources.ts'

const usage =
  'Usage: ledger-cli.ts derive --capture <file> --out <directory> [--admission <test ledger root>] [--slots <ledger.jsonl>] [--board <board.json>] [--milestone <title>]'
const FLAGS = ['--capture', '--out', '--admission', '--slots', '--board', '--milestone'] as const
type Flag = (typeof FLAGS)[number]

function options(args: readonly string[]): Map<Flag, string> {
  const [command, ...rest] = args
  if (command !== 'derive') throw new InputError(usage)
  const values = new Map<Flag, string>()
  for (let index = 0; index < rest.length; index += 2) {
    const flag = FLAGS.find(item => item === rest[index]),
      value = rest[index + 1]
    if (flag === undefined || value === undefined || value.startsWith('--') || values.has(flag))
      throw new InputError(usage)
    values.set(flag, value)
  }
  return values
}
/**
 * A path argument as an absolute path. `pnpm --filter … run ledger` starts the script in the
 * member directory and sets INIT_CWD to the directory where pnpm ran, so relative paths resolve
 * against INIT_CWD when it is set and against the current directory otherwise.
 */
function argumentPath(path: string): string {
  return resolve(process.env['INIT_CWD'] ?? process.cwd(), path)
}
function hasErrorCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
}
/** Writes every file under a temporary name first, then renames them; the meta file is last. */
function writeAll(directory: string, files: readonly (readonly [string, string])[]): void {
  const temporary = (name: string) => join(directory, `.${name}.${process.pid}.tmp`)
  try {
    mkdirSync(directory, { recursive: true })
    for (const [name, text] of files) writeFileSync(temporary(name), text)
    for (const [name] of files) renameSync(temporary(name), join(directory, name))
  } catch (error) {
    for (const [name] of files) rmSync(temporary(name), { force: true })
    if (hasErrorCode(error))
      throw new InputError(`--out ${directory}: cannot write (${error.code})`)
    throw error
  }
}

try {
  const values = options(process.argv.slice(2))
  const capture = values.get('--capture'),
    out = values.get('--out')
  if (capture === undefined || out === undefined) throw new InputError(usage)
  const admission = values.get('--admission'),
    slots = values.get('--slots'),
    board = values.get('--board')
  const inputs: LedgerInputs = {
    capture: readCapture(argumentPath(capture)),
    milestone: values.get('--milestone'),
    admission: admission === undefined ? undefined : readAdmission(argumentPath(admission)),
    slots: slots === undefined ? undefined : readSlots(argumentPath(slots)),
    board: board === undefined ? undefined : readBoard(argumentPath(board)),
    files: {
      capture,
      ...(admission === undefined ? {} : { admission }),
      ...(slots === undefined ? {} : { slots }),
      ...(board === undefined ? {} : { board }),
    },
    generatedAt: new Date().toISOString(),
  }
  const ledger = deriveLedger(inputs)
  writeAll(argumentPath(out), [
    ['cards.csv', toCsv(CARD_COLUMNS, ledger.cards)],
    ['waves.csv', toCsv(WAVE_COLUMNS, ledger.waves)],
    ['milestone.csv', toCsv(MILESTONE_COLUMNS, [ledger.milestone])],
    ['ledger-meta.json', `${JSON.stringify(ledger.meta, null, 2)}\n`],
  ])
  process.stdout.write(
    `${JSON.stringify({
      kind: 'ledger-derived',
      version: ledger.meta.version,
      out,
      cards: ledger.cards.length,
      waves: ledger.waves.length,
      warnings: ledger.meta.warnings.length,
    })}\n`,
  )
} catch (error) {
  if (!(error instanceof InputError)) throw error
  process.stderr.write(`${JSON.stringify({ kind: 'ledger-error', message: error.message })}\n`)
  process.exitCode = 2
}
