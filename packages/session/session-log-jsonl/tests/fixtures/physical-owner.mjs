import { openJsonlSessionLog } from '../../dist/index.js'
import { openWithIo } from '../../dist/open.js'
import { fileIo, IoFailure } from '../../dist/file-io.js'
import { isOk, parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'

const dir = process.argv[2]
const mode = process.argv[3]
const current = process.argv[4]
if (current === undefined) throw new Error('physical identity missing')
const processOwnership = {
  current,
  async observeExit() {
    return 'unknown'
  },
}
if (dir === undefined) throw new Error('fixture dir missing')
const parsedSession = parseOpaqueIdentifier('session', 'SessionRef')
const parsedTenant = parseTenantId({ organization: 'organization', account: 'account' })
if (!isOk(parsedSession) || !isOk(parsedTenant)) throw new Error('fixture identity')
const session = parsedSession.ok
const entry = key => ({
  tenant: parsedTenant.ok,
  payload: { original: key },
  dedupeKey: key,
  readKeys: ['batch', key],
  ...(mode === 'untrusted' ? { run: 'run', attempt: 7 } : {}),
})
const unfenced = { kind: 'unfenced' }
const unconditional = { kind: 'unconditional' }
let release = () => {}
const barrier = new Promise(resolve => {
  release = resolve
})
let failClose = mode === 'close-failure'
let closing = false
let cleanMarkerWritten = false
const phase = mode?.split(':')
async function pauseStage(kind, stage) {
  if (phase?.[0] === kind && phase[1] === stage) {
    process.stdout.write(`${kind}-${stage}\n`)
    await barrier
  }
}
const io = {
  ...fileIo,
  async rename(from, to) {
    await fileIo.rename(from, to)
    if (to.endsWith('recovery.json')) await pauseStage(closing ? 'clean' : 'active', 'rename')
  },
  async open(path, flags) {
    const file = await fileIo.open(path, flags)
    if (path.endsWith('recovery.json.next')) {
      await pauseStage(closing ? 'clean' : 'active', 'open')
      return {
        ...file,
        async write(bytes) {
          const count = await file.write(bytes)
          if (closing) cleanMarkerWritten = true
          await pauseStage(closing ? 'clean' : 'active', 'write')
          return count
        },
        async datasync() {
          await file.datasync()
          await pauseStage(closing ? 'clean' : 'active', 'datasync')
        },
        async close() {
          await file.close()
          await pauseStage(closing ? 'clean' : 'active', 'close')
        },
      }
    }
    if (flags === 'r' && !path.endsWith('entries.jsonl'))
      return {
        ...file,
        async sync() {
          await file.sync()
          if (path !== dir && (!closing || cleanMarkerWritten))
            await pauseStage(closing ? 'clean' : 'active', 'sync')
        },
      }
    if (!path.endsWith('entries.jsonl')) return file
    return {
      ...file,
      async write(bytes) {
        const count = await file.write(
          mode === 'half' ? bytes.subarray(0, Math.floor(bytes.length / 2)) : bytes,
        )
        if (mode === 'half' || mode === 'full' || mode === 'close-blocked') {
          process.stdout.write(`${mode}-written\n`)
          await barrier
        }
        return count
      },
      async close() {
        if (failClose) {
          failClose = false
          throw new IoFailure('fixture-close')
        }
        await file.close()
      },
      async datasync() {
        await file.datasync()
        if (mode === 'ack-before-delivery') {
          process.stdout.write('batch-datasync-confirmed\n')
          await barrier
        }
        if (mode === 'untrusted') throw new IoFailure('fixture-uncertain-datasync')
      },
      async truncate(size) {
        if (mode === 'untrusted') throw new IoFailure('fixture-failed-rollback')
        await file.truncate(size)
      },
    }
  },
}
let owner = await ([
  'half',
  'full',
  'close-blocked',
  'close-failure',
  'untrusted',
  'ack-before-delivery',
].includes(mode) || phase?.length === 2
  ? openWithIo({ dir, processOwnership }, io)
  : openJsonlSessionLog({ dir, processOwnership }))
process.stdin.setEncoding('utf8')
process.stdin.resume()
let input = ''
process.stdin.on('data', chunk => {
  input += chunk
  const lines = input.split('\n')
  input = lines.pop() ?? ''
  for (const line of lines) {
    if (line === 'release') release()
    if (line === 'exit') {
      process.stdout.write('exit-request-received\n')
      process.stdin.destroy()
    }
    if (line === 'close' && owner !== undefined) {
      closing = true
      process.stdout.write('closing\n')
      owner.close().then(
        () => {
          process.stdout.write('closed\n')
          if (mode !== 'untrusted') process.stdin.pause()
        },
        () => process.stdout.write('close-failed-held\n'),
      )
    }
  }
})
if (mode === 'gc') {
  owner = undefined
  for (let index = 0; index < 8; index++) {
    globalThis.gc()
    await new Promise(resolve => setImmediate(resolve))
  }
  process.stdout.write('gc-complete-held\n')
} else if (mode === 'hold') process.stdout.write('acquired\n')
else {
  const batch =
    mode === 'ack-before-delivery'
      ? [entry('one'), entry('two'), entry('three')]
      : [entry('one'), entry('two')]
  const task = owner.append(session, batch, unfenced, unconditional)
  task.then(
    result => {
      if ('positions' in result) process.stdout.write('confirmed\n')
      else process.stdout.write(mode === 'untrusted' ? 'untrusted\n' : 'not-confirmed\n')
    },
    () => process.stdout.write('task-failed\n'),
  )
}
