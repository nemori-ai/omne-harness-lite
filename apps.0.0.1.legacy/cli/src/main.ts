#!/usr/bin/env node
import { runEntryCli } from './entry-application.ts'
import { entryProviders } from './entry-providers.ts'

const controller = new AbortController()
const stop = () => controller.abort()
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, stop)
// The single process entry owns these streams until process termination. A write
// callback rejection is handled by runEntryCli; emitted errors must not escape it.
process.stdout.on('error', () => {})
process.stderr.on('error', () => {})
const write = (stream: NodeJS.WriteStream, text: string) =>
  new Promise<void>((resolve, reject) => {
    stream.write(text, error => (error == null ? resolve() : reject(new Error('output-failed'))))
  })
try {
  const args = process.argv.slice(2)
  const io = {
    signal: controller.signal,
    stdout: (text: string) => write(process.stdout, text),
    stderr: (text: string) => write(process.stderr, text),
  }
  process.exitCode = await runEntryCli(args, {
    ...entryProviders(controller.signal),
    ...io,
    isTTY: process.stdout.isTTY === true && process.stdin.isTTY === true,
  })
} catch {
  process.exitCode = 70
  try {
    await write(process.stderr, 'omne: internal-defect\n')
  } catch {
    /* no recursive diagnostics */
  }
} finally {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.off(signal, stop)
}
