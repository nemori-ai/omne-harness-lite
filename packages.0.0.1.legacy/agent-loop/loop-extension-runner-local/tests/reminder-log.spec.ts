import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeMessage,
  type LoggedMessage,
  type SystemReminderMessage,
} from '@omne-harness-lite/messages'
import { encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { createRunnerReminderLogAdapter } from '../src/reminder-log.ts'
import { createRunnerTaskOwner } from '../src/task-owner.ts'
import { type RunnerLogBinding } from '@omne-harness-lite/loop-extension-runner'

const tenant = parseTenantId({ organization: 'reminder-org', account: 'reminder-account' })
const session = parseOpaqueIdentifier('reminder-session', 'SessionRef')
if (!('ok' in tenant) || !('ok' in session)) throw new Error('reminder fixture rejected')
const acceptedSession = session.ok
const binding: RunnerLogBinding = {
  tenant: tenant.ok,
  session: acceptedSession,
  logGeneration: 'reminder-generation',
}

function reminder(text: string): SystemReminderMessage {
  const judged = judgeMessage({
    id: 'reminder-1',
    type: 'system_reminder',
    blocks: [
      {
        id: 'reminder-text',
        kind: 'text',
        text,
        visibility: { toHuman: true, toModel: true },
      },
    ],
    createdAt: '2026-09-29T00:00:00Z',
    nature: 'event',
    source: { kind: 'extension', extension: 'reminder-extension' },
  })
  if (!('ok' in judged) || judged.ok.type !== 'system_reminder')
    throw new Error('reminder value rejected')
  return judged.ok
}

describe('runner reminder uses the model message identity domain', () => {
  it('accepts its exact persisted value and rejects another value at the same MessageId', async () => {
    const root = resolve(process.cwd(), '../../../tmp/runner-public')
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'reminder-'))
    const log = await openSqlLogFixture({ dir: dir })
    try {
      const owner = createRunnerTaskOwner(binding)
      const prefix = async (): Promise<readonly LoggedMessage[] | { unavailable: true }> => {
        const read = await log.readSince(acceptedSession, 0)
        if (!('entries' in read)) return { unavailable: true }
        const messages: LoggedMessage[] = []
        for (const entry of read.entries) {
          const payload = entry.payload
          if (
            payload === null ||
            typeof payload !== 'object' ||
            Array.isArray(payload) ||
            isJsonNumber(payload)
          )
            continue
          if (!('category' in payload) || !('value' in payload)) continue
          if (payload.category !== 'message') continue
          const judged = judgeMessage(payload.value)
          if (!('ok' in judged) || judged.ok.type === 'system') return { unavailable: true }
          messages.push(judged.ok)
        }
        return messages
      }
      const adapter = createRunnerReminderLogAdapter({
        log,
        binding,
        owner,
        readMessagePrefix: prefix,
      })
      const original = reminder('first')
      const conflicting = reminder('different')
      expect(await adapter.inspect(original)).toEqual({ kind: 'absent' })
      expect(await adapter.append(original, { kind: 'noRun' })).toEqual({ kind: 'confirmed' })
      const key = encodeModelLogKey({ kind: 'message', message: original.id })
      if (!('ok' in key)) throw new Error('message key rejected')
      const persisted = await log.readByKey(acceptedSession, key.ok)
      expect(persisted).toMatchObject({ entries: [{ dedupeKey: key.ok }] })
      expect(await adapter.inspect(original)).toEqual({ kind: 'same' })
      expect(await adapter.inspect(conflicting)).toEqual({ kind: 'conflict' })
      expect(await adapter.append(conflicting, { kind: 'noRun' })).toEqual({
        kind: 'alreadyRecorded',
      })
      expect(await adapter.inspect(conflicting)).toEqual({ kind: 'conflict' })
    } finally {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
