// Test preload only: hold a real input FileHandle read until the parent releases it.
import { promises as fs } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { once } from 'node:events'

const original = fs.open
const source = process.env.OMNE_TEST_GATED_INPUT
fs.open = async (...args) => {
  const handle = await original(...args)
  if (String(args[0]) === source) {
    const read = handle.read.bind(handle)
    let first = true
    handle.read = (async (...readArgs: Parameters<typeof read>) => {
      if (first) {
        first = false
        const release = once(process, 'message')
        process.send?.({ stage: 'reading' })
        await release
        process.disconnect?.()
      }
      return read(...readArgs)
    }) as typeof handle.read
  }
  return handle
}
syncBuiltinESMExports()
