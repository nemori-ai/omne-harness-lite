import type { ChildProcess } from 'node:child_process'
import { Transform } from 'node:stream'

export function holdNativeInput(
  child: ChildProcess,
  control: { marker: string; entered(): void; released(): Promise<void> },
): void {
  const input = child.stdin
  if (process.platform !== 'win32' || input === null) return
  const gate = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      if (!chunk.toString('utf8').includes(control.marker)) return done(null, chunk)
      control.entered()
      done()
      void control.released().then(
        () => gate.push(chunk),
        error => gate.destroy(new Error('native input barrier failed', { cause: error })),
      )
    },
  })
  input.on('error', error => gate.destroy(error))
  gate.pipe(input)
  child.stdin = gate
}
