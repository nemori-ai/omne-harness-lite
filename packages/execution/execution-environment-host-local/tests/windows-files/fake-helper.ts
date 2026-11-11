/**
 * A stand-in for the files helper process that speaks its frames and misbehaves on request. Run as
 * `node fake-helper.ts <log> <start>`. It appends `pid <pid>` and one `request <id> <named> <path>`
 * line per request to `<log>` before it acts, so a test counts what reached a process.
 *
 * `<start>`: `ready` writes the ready frame, `silent` never does, `exit` exits at once.
 * `named` of a request selects the behaviour: `answer` replies, `hold` never replies, `emit` writes
 * `path` verbatim and `emitExit` writes it and exits. In `path`, `#self` is the request's number,
 * `#0` and `#1` the numbers of the held requests and `#ok` a valid reply body.
 */
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [log = '', start = 'ready'] = process.argv.slice(2)
const record = (text: string) => appendFileSync(log, `${text}\n`)
const ok = JSON.stringify({
  info: { token: '1:1', version: '0:0', size: 0, modified: 0, type: 'file', name: '' },
  bytes: '',
  entries: [],
  next: -1,
})

record(`pid ${process.pid}`)
if (start === 'exit') process.exit(1)
if (start === 'ready') process.stdout.write('{"v":1,"ready":true}\n')

const held: number[] = []
for await (const line of createInterface({ input: process.stdin })) {
  const request: unknown = JSON.parse(line)
  if (
    request === null ||
    typeof request !== 'object' ||
    !('id' in request) ||
    typeof request.id !== 'number' ||
    !('named' in request) ||
    typeof request.named !== 'string' ||
    !('path' in request) ||
    typeof request.path !== 'string'
  )
    process.exit(2)
  const id = request.id
  record(`request ${id} ${request.named} ${request.path}`)
  const expanded = request.path
    .replaceAll('#self', String(id))
    .replaceAll('#ok', ok)
    .replaceAll('#0', String(held[0]))
    .replaceAll('#1', String(held[1]))
  switch (request.named) {
    case 'answer':
      process.stdout.write(`{"v":1,"id":${id},"ok":${ok}}\n`)
      break
    case 'hold':
      held.push(id)
      break
    case 'emit':
      process.stdout.write(expanded)
      break
    case 'emitExit':
      process.stdout.write(expanded, () => process.exit(1))
      break
    default:
      process.exit(2)
  }
}
