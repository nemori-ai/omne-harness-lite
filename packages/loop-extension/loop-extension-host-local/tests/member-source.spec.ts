import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const own = join(import.meta.dirname, '..')
const group = join(own, '..')
// A mutation sandbox holds this member alone: there the check reads this member, and the whole group everywhere else.
const whole = existsSync(join(group, 'SPEC.md'))
const members = [
  'loop-extension-contract',
  'loop-extension',
  'loop-extension-cordis-contract',
  'loop-extension-host-local',
]

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const code = (whole ? members.map(member => join(group, member)) : [own])
  .flatMap(member => files(join(member, 'src')))
  .map(file => ({ file, text: readFileSync(file, 'utf8') }))

it('LX-6 no member of the group starts a process of its own: a child process starts only through the execution environment', () => {
  expect(code.length).toBeGreaterThan(whole ? 10 : 3)
  for (const { file, text } of code) {
    expect(text, file).not.toMatch(/['"](?:node:)?(?:child_process|worker_threads|cluster)['"]/u)
    expect(text, file).not.toMatch(/\b(?:spawn|execFile|fork)\s*\(/u)
  }
})

it('LX-6 no member of the group reads the environment of the server process: the child gets only what the assembly lists', () => {
  for (const { file, text } of code) expect(text, file).not.toMatch(/process\.env\b/u)
})
