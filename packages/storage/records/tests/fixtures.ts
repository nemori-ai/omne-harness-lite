import { readFileSync } from 'node:fs'
import type { CommitEnvelope, CodecLimits } from '../dist/index.js'

export const limits: CodecLimits = {
  maxBytes: 4_096,
  maxDepth: 32,
  maxNodes: 512,
  maxLineBytes: 8_192,
  maxPayloadBytes: 4_096,
}

export function fixture(name: 'g01' | 'g10'): Uint8Array {
  return readFileSync(new URL(`./fixtures/${name}.jsonl`, import.meta.url))
}

export function fixtureEnvelope(name: 'g01' | 'g10'): CommitEnvelope {
  const outer = JSON.parse(Buffer.from(fixture(name)).toString('utf8')) as { payload: string }
  return JSON.parse(outer.payload) as CommitEnvelope
}
