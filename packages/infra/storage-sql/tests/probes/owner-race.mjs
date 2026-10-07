import { DatabaseSync } from 'node:sqlite'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
if (process.argv[2] === 'child') {
  const [file, mode, timeout] = process.argv.slice(3)
  const db = new DatabaseSync(file, { timeout: Number(timeout) })
  process.send('ready')
  process.once('message', () => {
    let answer
    try {
      db.exec('PRAGMA journal_mode=MEMORY')
      db.exec('BEGIN ' + mode)
      answer = 'owned'
    } catch (e) {
      answer = e.errcode === 5 || e.errcode === 6 ? 'busy' : String(e)
    }
    process.send(answer)
    process.once('message', () => {
      db.close()
      process.exit(0)
    })
  })
} else {
  const root = await mkdtemp(join(tmpdir(), 'omne-owner-race-')),
    results = []
  try {
    for (const [mode, timeout] of [
      ['EXCLUSIVE', 0],
      ['IMMEDIATE', 0],
      ['EXCLUSIVE', 100],
    ]) {
      const counts = { one: 0, both: 0, none: 0, other: [] }
      for (let i = 0; i < 40; i++) {
        const children = [0, 1].map(() =>
          fork(
            new URL(import.meta.url),
            ['child', join(root, `${mode}-${timeout}-${i}`), mode, String(timeout)],
            { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
          ),
        )
        await Promise.all(children.map(c => once(c, 'message')))
        const replies = children.map(c => once(c, 'message'))
        for (const c of children) c.send('go')
        const values = (await Promise.all(replies)).map(x => x[0])
        const owned = values.filter(x => x === 'owned').length
        counts[owned === 1 ? 'one' : owned === 2 ? 'both' : 'none']++
        if (values.some(x => !['owned', 'busy'].includes(x))) counts.other.push(values)
        const exits = children.map(c => once(c, 'exit'))
        for (const c of children) c.send('release')
        await Promise.all(exits)
      }
      results.push({ mode, timeout, ...counts })
    }
    console.log(
      JSON.stringify({
        platform: process.platform,
        node: process.version,
        results,
        scope:
          '40 coordinated two-process races per primitive on private lock database; finite observation, no global progress proof',
      }),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
