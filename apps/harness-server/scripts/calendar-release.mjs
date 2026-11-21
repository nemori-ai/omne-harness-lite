import { readFileSync } from 'node:fs'

const USAGE =
  'usage: calendar-release.mjs check [--at <YYYY-MM-DD>] [--accept-warnings <JSON path>]'

function parseArgs(argv) {
  const [command, ...given] = argv
  const rest = given[0] === '--' ? given.slice(1) : given
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i + 1] === undefined) throw new Error(USAGE)
    opts[rest[i]] = rest[i + 1]
  }
  const unknown = Object.keys(opts).filter(key => key !== '--at' && key !== '--accept-warnings')
  if (command !== 'check' || unknown.length > 0) throw new Error(USAGE)
  const at = opts['--at'] ?? new Date().toISOString().slice(0, 10)
  const parsed = new Date(`${at}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at) || parsed.toISOString().slice(0, 10) !== at)
    throw new Error(`--at is not a date: ${at}`)
  return { at, declarations: opts['--accept-warnings'] }
}

async function main(argv) {
  const { at, declarations } = parseArgs(argv)
  let declared
  if (declarations !== undefined) {
    try {
      declared = JSON.parse(readFileSync(declarations, 'utf8'))
    } catch (error) {
      throw new Error(`declaration file ${declarations} is not readable JSON: ${error.message}`)
    }
  }
  const gate = await import('../src/entry/calendar-release.ts')
  const decision = await gate.checkShippedCalendarRelease(at, declared)
  console.log(decision.lines.join('\n'))
  return decision.exitCode
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(`calendar-release: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
}
