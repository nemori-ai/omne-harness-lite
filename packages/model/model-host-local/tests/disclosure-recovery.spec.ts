// @module-tag slow
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it } from 'vitest'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import { createCertificate, startHttpsServer } from './support/https-server.ts'
import {
  ACCESS,
  CAPACITY,
  CONSUMER,
  REQUIRED,
  assembleLine,
  callOf,
  durableCommands,
  op,
  openFileStorage,
} from './support/line-assembly.ts'
import { decoded } from './support/local-host.ts'
import { RECORD_CASES, firstRoundRequest } from './support/recording-cases.ts'

it('checks a fixed request recovered from SQLite under the new send activation policy', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-disclosure-recovery-')))
  const certificate = createCertificate()
  const server = await startHttpsServer(certificate, response => response.writeHead(500).end())
  const storage = await openFileStorage(join(directory, 'model.sqlite'))
  const gateway = { url: server.url, ca: certificate.cert }
  let line = await assembleLine({ directory, storage, gateway, requestDisclosure: () => null })
  try {
    const recorded = firstRoundRequest(RECORD_CASES['openai-tool-call'])
    const messages = recorded.messages.map(message =>
      message.role === 'user'
        ? {
            ...message,
            blocks: [
              {
                kind: 'text' as const,
                id: message.blocks[0].id,
                visibility: { toHuman: true, toModel: true },
                text: 'x'.repeat(1536),
              },
            ] as const,
          }
        : message,
    )
    const request = decoded(
      await line.preparation.prepare({
        ...ACCESS,
        profile: line.profile,
        required: REQUIRED,
        assembled: {
          system: recorded.system,
          messages,
          tools: recorded.tools,
          toolChoice: recorded.toolChoice,
          parameters: recorded.parameters,
          representation: recorded.representation,
          source: recorded.source,
        },
      }),
    )
    const profile = line.profile
    await line.close()
    const first = durableCommands(storage.storage, profile).commands
    const call = callOf('disclosure-recovered')
    const input = {
      ...ACCESS,
      call,
      operation: op('admit-disclosure-recovered'),
      request,
      consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'line-e2e' },
      capacity: CAPACITY,
    }
    decoded(await first.admit(input))
    expect(decoded(await first.loadRecovery({ ...ACCESS, call })).state.phase).toBe('accepted')
    expect(server.requests).toHaveLength(0)
    storage.reopen()
    const fresh = durableCommands(storage.storage, profile).commands
    expect(decoded(await fresh.loadRecovery({ ...ACCESS, call })).request).toEqual(request)
    const checked: FixedModelRequest[] = []
    line = await assembleLine({
      directory,
      storage,
      gateway,
      requestDisclosure: value => {
        checked.push(value)
        let bytes = 0
        for (const message of value.messages)
          for (const block of message.blocks)
            if (block.kind === 'text' && block.visibility.toModel)
              bytes += Buffer.byteLength(block.text)
        return bytes > 512 ? { kind: 'denied', action: 'test-current-disclosure-limit' } : null
      },
    })
    decoded(await line.runtime.calls.admit(input))
    let state = await line.stateOf(call)
    for (
      const end = Date.now() + 10000;
      state.phase !== 'settled' && Date.now() < end;
      await sleep(20)
    )
      state = await line.stateOf(call)
    expect(state.phase).toBe('settled')
    expect(server.requests).toHaveLength(0)
    expect(checked).toEqual([request])
    const dispatches = await line.dispatchesOf(call)
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0]).toMatchObject({
      send: 'not-sent',
      terminal: { kind: 'failed', fault: { cause: 'excluded' } },
    })
    expect(decoded(await line.commands.loadRecovery({ ...ACCESS, call })).request).toEqual(request)
  } finally {
    await line.close()
    storage.close()
    await server.close()
    certificate.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
}, 30000)
