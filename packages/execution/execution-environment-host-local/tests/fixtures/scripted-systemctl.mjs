#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'

const directory = process.env['SCRIPT_DIR'] ?? ''
const args = process.argv.slice(2)

appendFileSync(`${directory}/calls.log`, `${JSON.stringify(args)}\n`)

let rules = []
try {
  rules = JSON.parse(readFileSync(`${directory}/replies.json`, 'utf8'))
} catch {}

const text = args.join(' ')
const rule = rules.find(candidate => text.includes(candidate.contains))
if (rule !== undefined) {
  process.stdout.write(rule.stdout ?? '')
  process.exit(rule.code ?? 0)
}
if (args[0] === '--help') process.stdout.write('  --kill-whom=ROLE  Whom to send signal to\n')
process.exit(0)
