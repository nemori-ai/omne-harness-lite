import { existsSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rerunIn, shellRunner, type Runner } from '../../../src/rows/goal-session/rerun.ts'

function workspace(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rerun-spec-')))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text)
  return root
}
const ACCEPT = `
const { writeFileSync } = require('node:fs')
writeFileSync('ran.txt', 'ran in ' + process.cwd())
const { turn } = require('./snake.js')
if (turn('up', 'right') !== 'right') { console.error('turn(up, right) did not turn right'); process.exit(1) }
console.log('accept: ok')
`
const RIGHT = 'exports.turn = (from, to) => to\n'
const HOLLOW = 'exports.turn = (from, to) => from\n'
const run = (
  where: string,
  commands: readonly string[],
  timeoutMs = 20_000,
  runner = shellRunner,
) =>
  rerunIn(
    { runner, timeoutMs },
    where,
    commands.map((command, at) => ({ criterion: `A${String(at + 1)}`, command })),
  )

describe('a command run again in a clean copy of the working directory', () => {
  it('reads exit 0 when the work passes the command, and says what the command printed last', async () => {
    const where = workspace({ 'accept.js': ACCEPT, 'snake.js': RIGHT })
    expect(await run(where, ['node accept.js'])).toEqual([
      { criterion: 'A1', exit: 0, note: 'exit 0: accept: ok' },
    ])
  })

  it('reads the exit code of a command the work does not pass, with what it printed', async () => {
    const where = workspace({ 'accept.js': ACCEPT, 'snake.js': HOLLOW })
    expect(await run(where, ['node accept.js'])).toEqual([
      { criterion: 'A1', exit: 1, note: 'exit 1: turn(up, right) did not turn right' },
    ])
  })

  it('says the last line a command printed, not the first, and gives the command none of the server environment but where programs are found', async () => {
    const where = workspace({})
    const name = 'OMNE_RERUN_SPEC_SECRET'
    process.env[name] = 'kept-from-the-command'
    try {
      const said = await run(where, [
        `printf 'first\\nlast\\n'; exit 3`,
        `echo "secret=\${${name}:-absent} ci=$CI"`,
      ])
      expect(said).toEqual([
        { criterion: 'A1', exit: 3, note: 'exit 3: last' },
        { criterion: 'A2', exit: 0, note: 'exit 0: secret=absent ci=1' },
      ])
    } finally {
      delete process.env[name]
    }
  })

  it('writes nothing in the working directory: what the command writes lands in the copy, which is gone afterwards', async () => {
    const where = workspace({ 'accept.js': ACCEPT, 'snake.js': RIGHT })
    const before = readdirSync(where).sort()
    const copies: string[] = []
    const watching: Runner = (command, options) => {
      copies.push(options.cwd)
      return shellRunner(command, options)
    }
    await run(where, ['node accept.js'], 20_000, watching)
    expect(readdirSync(where).sort()).toEqual(before)
    expect(existsSync(join(where, 'ran.txt'))).toBe(false)
    expect(copies).toHaveLength(1)
    expect(copies[0]).not.toBe(where)
    expect(existsSync(copies[0]!)).toBe(false)
  })

  it('gives each command its own copy: what one wrote is not there for the next', async () => {
    const where = workspace({ 'snake.js': RIGHT })
    const results = await run(where, ['echo first > made.txt', 'test ! -e made.txt'])
    expect(results.map(result => result.exit)).toEqual([0, 0])
  })

  it('a command that runs past its time is stopped and cannot be told', async () => {
    const where = workspace({})
    const [late] = await run(where, ['sleep 30'], 300)
    expect(late).toEqual({
      criterion: 'A1',
      exit: null,
      note: 'not finished within 300 ms; stopped',
    })
  })

  it('cannot be told when there is no working directory to copy, or the copy cannot be made', async () => {
    expect(await run(join(tmpdir(), 'no-such-directory-of-rerun'), ['true'])).toEqual([
      {
        criterion: 'A1',
        exit: null,
        note: expect.stringMatching(/^the working directory could not be copied/u),
      },
    ])
    const nowhere = await rerunIn({ runner: shellRunner, timeoutMs: 1000 }, null, [
      { criterion: 'A1', command: 'true' },
    ])
    expect(nowhere).toEqual([
      { criterion: 'A1', exit: null, note: 'the session has no working directory to run it in' },
    ])
  })

  it('keeps the note within what a reading holds: the end of a long output', async () => {
    const where = workspace({})
    const [long] = await run(where, ["node -e \"console.log('x'.repeat(5000) + 'END')\""])
    expect(long!.note.length).toBeLessThanOrEqual(400)
    expect(long!.note.endsWith('END')).toBe(true)
  })
})
