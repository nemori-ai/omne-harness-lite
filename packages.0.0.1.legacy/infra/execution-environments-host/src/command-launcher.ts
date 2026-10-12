import { spawn } from 'node:child_process'
import { readFileSync, openSync, closeSync, writeFileSync, constants } from 'node:fs'

/** Trusted launcher inherits the original PTY, not user output pipes or shell parsing. */
const request = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as {
  executable: string
  args: string[]
  cwd: string
  env: Record<string, string>
  input?: string
  receipt: string
}
const input =
  request.input === undefined
    ? 0
    : openSync(request.input, constants.O_RDONLY | constants.O_NOFOLLOW)
let settled = false
function receipt(value: unknown) {
  if (settled) return
  settled = true
  writeFileSync(request.receipt, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
}
const child = spawn(request.executable, request.args, {
  cwd: request.cwd,
  env: request.env,
  stdio: [input, 1, 2],
})
if (request.input !== undefined) closeSync(input)
child.once('error', () => receipt({ kind: 'failed' }))
child.once('close', (code, signal) => receipt({ kind: 'completed', code, signal }))
