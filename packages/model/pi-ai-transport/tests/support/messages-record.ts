import { readFileSync } from 'node:fs'
import { readJsonText } from '@omne-harness/json-text'
import type { PiProtocolFrame } from '../../src/index.ts'
import type { MessagesRecord } from '../../src/messages/index.ts'
import { FORMAT, ROUTE } from './chat-record.ts'

export function messagesRecord(overrides: Partial<MessagesRecord> = {}): MessagesRecord {
  return {
    name: 'model-m',
    revision: '1',
    route: ROUTE,
    status: 'current',
    engine: 'messages',
    serving: { order: ['lab'], reports: ['Lab'] },
    wire: {
      cache: { kind: 'none' },
      image: { mediaTypes: ['image/png'] },
      thinking: { display: 'summarized' },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
    parameters: {
      temperature: { support: 'unsupported' },
      'top-p': { support: 'unsupported' },
      'max-output-tokens': {
        support: 'supported',
        default: { kind: 'absent' },
        accept: { max: '4096' },
        wire: { field: 'max_tokens' },
      },
      stop: {
        support: 'supported',
        default: { kind: 'absent' },
        accept: { maxItems: 2, maxLength: 8 },
        wire: { field: 'stop' },
      },
      'reasoning-effort': {
        support: 'supported',
        default: { kind: 'absent' },
        accept: {},
        wire: {
          none: 'unsupported',
          low: { field: 'reasoning.effort', value: 'low' },
          medium: { field: 'reasoning.effort', value: 'medium' },
          high: { field: 'reasoning.effort', value: 'high' },
          max: { field: 'reasoning.effort', value: 'max' },
        },
      },
      seed: { support: 'unsupported' },
      'frequency-penalty': { support: 'unsupported' },
      'presence-penalty': { support: 'unsupported' },
    },
    extensions: [],
    accepts: { forcedToolChoice: false, endsWithAssistant: false },
    replay: {
      declaration: {},
      formats: { produces: FORMAT, accepts: [FORMAT] },
      binding: 'prefix',
    },
    ...overrides,
  }
}

/** The data frames of a recorded event stream, in order. */
export function framesOf(fixture: string): readonly PiProtocolFrame[] {
  const text = readFileSync(new URL(`../fixtures/messages/${fixture}`, import.meta.url), 'utf8')
  return text
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => {
      const read = readJsonText(line.slice('data:'.length).trim(), {
        maxBytes: 1 << 20,
        maxDepth: 32,
        maxItems: 1024,
        maxMembers: 256,
        maxStringLength: 1 << 20,
        maxNumberLength: 64,
      })
      if (read.kind !== 'ok') throw new Error(`fixture ${fixture} has a frame that is not JSON`)
      return { kind: 'data', value: read.value } as const
    })
}

/** A data frame written as plain JSON. */
export function frame(value: unknown): PiProtocolFrame {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 1 << 20,
    maxDepth: 32,
    maxItems: 1024,
    maxMembers: 256,
    maxStringLength: 1 << 20,
    maxNumberLength: 64,
  })
  if (read.kind !== 'ok') throw new Error('frame is not JSON')
  return { kind: 'data', value: read.value }
}
