#!/usr/bin/env node
// A stand-in for `systemctl` that answers as the test scripted it, for the fast-tier scope and
// recovery tests. Everything it reads and writes is in `SCRIPT_DIR` (the environment of the test):
//
// - `replies.json`: an array of `{ contains, code?, stdout? }`. The first rule whose `contains` text
//   occurs in the arguments joined by single spaces answers: it prints `stdout` and exits with
//   `code` (default 0). No rule matching answers exit 0 with no output, except for `--help`, which
//   names `--kill-whom` as the real tool does.
// - `calls.log`: one line per call, the arguments as a JSON array, so a test can read them exactly.
//
// Output is the `key=value` lines of `systemctl show`: the test writes them as the real tool would.
import { appendFileSync, readFileSync } from 'node:fs'

const directory = process.env['SCRIPT_DIR'] ?? ''
const args = process.argv.slice(2)

appendFileSync(`${directory}/calls.log`, `${JSON.stringify(args)}\n`)

let rules = []
try {
  rules = JSON.parse(readFileSync(`${directory}/replies.json`, 'utf8'))
} catch {
  /* No script: every call answers exit 0 with nothing. */
}

const text = args.join(' ')
const rule = rules.find(candidate => text.includes(candidate.contains))
if (rule !== undefined) {
  process.stdout.write(rule.stdout ?? '')
  process.exit(rule.code ?? 0)
}
if (args[0] === '--help') process.stdout.write('  --kill-whom=ROLE  Whom to send signal to\n')
process.exit(0)
