// A browser consumer of session/v1. It imports only the root entry, so the `source` condition
// compiles the contract and its dependencies with the DOM library and without Node types
// (RFC-0015 I-18).
import { sessionProtocol, type ObserveSessionFrame } from '@omne-harness/session-protocol'

const limits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 8_192,
  maxNumberLength: 32,
}

/** Writes a `refreshing` frame, reads it back, and returns one line for each step. */
export function run(): readonly string[] {
  const { frame } = sessionProtocol.observations['observe-session']
  const refreshing: ObserveSessionFrame = { kind: 'refreshing' }
  const written = frame.write(refreshing, limits)
  if (!written.ok) return ['write: rejected']
  const read = frame.read(written.value, limits)
  return ['write: ok', `read: ${read.ok ? read.value.kind : 'rejected'}`]
}

for (const line of run()) console.log(line)
