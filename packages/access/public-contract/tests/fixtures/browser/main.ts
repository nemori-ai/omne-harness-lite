// The browser consumer of the public contract. It imports only the root entry, so the
// `source` condition compiles the contract and its dependencies with the DOM library and
// without Node types. SPEC.md「浏览器夹具」 gives the bundle command and the browser run.
import { exampleLimits, notesProtocol } from './example-protocol.ts'

/** Writes a `save-note` body, reads it back, and returns one line for each step. */
export function run(): readonly string[] {
  const { body } = notesProtocol.operations['save-note']
  const written = body.write(
    { noteId: 'n-1', title: 'Plan', tags: ['draft'], revision: '7' },
    exampleLimits,
  )
  if (!written.ok) return ['write: rejected']
  const read = body.read(written.value, exampleLimits)
  return [`write: ok`, `read: ${read.ok ? JSON.stringify(read.value) : 'rejected'}`]
}

for (const line of run()) console.log(line)
