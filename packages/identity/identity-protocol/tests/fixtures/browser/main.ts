// The browser consumer of identity/v1. It imports only the root entry, so the `source` condition
// compiles the contract and its dependencies with the DOM library and without Node types (I-18).
import { identityProtocol } from '@omne-harness/identity-protocol'

const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}

/** Writes an `issue-login` body, reads it back, and returns one line for each step. */
export function run(): readonly string[] {
  const { body } = identityProtocol.operations['issue-login']
  const written = body.write({ loginIdentifier: 'someone', credential: 'secret' }, limits)
  if (!written.ok) return ['write: rejected']
  const read = body.read(written.value, limits)
  return ['write: ok', `read: ${read.ok ? read.value.loginIdentifier : 'rejected'}`]
}

for (const line of run()) console.log(line)
