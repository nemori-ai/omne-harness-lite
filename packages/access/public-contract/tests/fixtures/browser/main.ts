import { exampleLimits, notesProtocol } from './example-protocol.ts'

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
