import type { ChildProcess } from 'node:child_process'
import { Transform } from 'node:stream'

/** Delay the real bridge's request, leaving its process and file operations intact. */
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
      void control.released().then(
        () => done(null, chunk),
        error => done(new Error('native input barrier failed', { cause: error })),
      )
    },
  })
  input.on('error', error => gate.destroy(error))
  gate.pipe(input)
  child.stdin = gate
}
