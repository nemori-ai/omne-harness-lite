import type { CompactionInput } from './compaction.ts'
import { decodeProviderName, decodeRevision } from '@omne-harness/model-contract'
import { judgeMessage, parseMessageId, parseRecordEntryRef } from '@omne-harness/message'
function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error('invalid compaction fixture identity')
  return value.ok
}
const evidence = (record: string) => ({ owner: 'test', record, revision: '1', digest: record })

export const sampleCompactionAdoption = {
  owner: 'test',
  name: 'rules',
  revision: '1',
  digest: 'a'.repeat(64),
}
export function sampleCompactionInput(): CompactionInput {
  const ref = parseRecordEntryRef('visible-7')
  const id = parseMessageId('msg_bcdefghijklmnopqrstuvw')
  const original = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: 'original',
        visibility: { toHuman: true, toModel: true },
        text: 'Keep the unfinished work.',
      },
    ],
  })
  if (ref === null || !id.ok || !('ok' in original)) throw new Error('invalid compaction fixture')
  return {
    outputMessageId: id.value,
    history: {
      source: evidence('visible-history'),
      origin: ref,
      upper: ref,
      epoch: '7',
      base: { kind: 'initial', pairings: [] },
      entries: [{ ref, sequence: '7', message: original.ok, represented: [original.ok] }],
      logOrder: [ref],
      barriers: [],
      protected: [],
    },
    frame: { system: [], tools: [] },
    target: {
      profile: {
        kind: 'resolved',
        selectable: true,
        source: evidence('profile'),
        reasons: [],
        credential: 'available',
        shadowed: [],
        profile: {
          identity: { scope: { kind: 'factory' }, route: 'test' },
          adoption: sampleCompactionAdoption,
          revision: ok(decodeRevision('1')),
          updatedAt: '2026-11-16',
          availability: 'active',
          definition: {
            suppliers: [
              {
                adoption: sampleCompactionAdoption,
                provider: ok(decodeProviderName('test')),
                model: 'test',
              },
            ],
            fallback: false,
            input: ['text'],
            output: ['text'],
            context: {
              window: { provided: '1000', upstream: [] },
              input: null,
              output: { provided: '10', upstream: [] },
              compactionTriggerPercent: '80',
            },
            limits: [],
            parameters: [],
            representation: sampleCompactionAdoption,
            meter: sampleCompactionAdoption,
            retryPolicy: sampleCompactionAdoption,
          },
        },
      },
      parameters: [],
      representation: sampleCompactionAdoption,
      measurement: sampleCompactionAdoption,
      goals: [{ metric: 'context-tokens', relation: 'at-most', limit: '800' }],
    },
  }
}
