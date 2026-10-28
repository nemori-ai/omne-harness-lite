import fs from 'node:fs'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
const [root, mode, indexText] = process.argv.slice(2)
const index = Number(indexText)
const { proofs, paths } = JSON.parse(fs.readFileSync(join(root, 'input.json'), 'utf8'))
const opened = new Map()
const open = fs.openSync,
  close = fs.closeSync,
  sync = fs.fsyncSync
fs.openSync = (...args) => {
  const fd = open(...args)
  opened.set(fd, String(args[0]))
  return fd
}
fs.closeSync = fd => {
  opened.delete(fd)
  return close(fd)
}
fs.fsyncSync = fd => {
  const path = opened.get(fd) ?? ''
  if (mode === 'copy-crash' && path.startsWith(join(paths[index], '.omne-facts-'))) {
    const value = JSON.parse(fs.readFileSync(path, 'utf8'))
    if (value.generation === 1) process.exit(23)
  }
  if (
    mode === 'copy-directory-crash' &&
    path.includes('/omne-facts-preparation/') &&
    fs.existsSync(join(path, 'intent-1.json'))
  )
    process.exit(23)
  if (
    mode === 'retire-crash' &&
    path === paths[0] &&
    fs.existsSync(join(path, 'omne-facts-producer-retired.json'))
  )
    process.exit(23)
  if (
    mode === 'activate-crash' &&
    path === paths[index] &&
    fs.existsSync(join(path, 'omne-facts-producer.json'))
  )
    process.exit(23)
  return sync(fd)
}
syncBuiltinESMExports()
const { transferProducer } = await import('../../src/delivery/collaboration-producer-state.ts')
const { canonical } = await import('../../src/integration/parse.ts')
try {
  transferProducer({
    gitDir: paths[index],
    current: proofs[index],
    fromGitDir: paths[0],
    predecessor: proofs[0],
    assertCurrent() {},
    assertSource() {},
    resolveInstallation(record) {
      const found = proofs.find(p => canonical(p.record) === canonical(record))
      if (!found) throw new Error('unrecognized proof')
      return found
    },
  })
  process.stdout.write('activated\n')
} catch (error) {
  process.stderr.write(String(error))
  process.exitCode = 2
}
