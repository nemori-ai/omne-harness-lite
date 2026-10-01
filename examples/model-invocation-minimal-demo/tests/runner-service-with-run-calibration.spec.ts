import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createOfficialProfileContent,
  type InputMeter,
} from '@omne-harness-lite/pi-ai-transport'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { ModelResponse } from '@omne-harness-lite/model-response'
import { createAcceptanceApplication, type ControlledRunFixturePort } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import {
  messagePrefixWithSources,
  readDemoCalibrationHistory,
  type ControlledSingleRunSelection,
} from '../src/model-request-text.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const RUN = 'controlled-calibration-run'
const definition = anthropicDefinitions[0]!
const usage = JSON.stringify({
  prompt_tokens: 10000,
  completion_tokens: 3,
  prompt_tokens_details: { cached_tokens: 2000, cache_write_tokens: 1000 },
  cost: 0.00001,
})

function user(turn: number) {
  const judged = judgeMessage({
    type: 'user',
    id: `with-run-user-${turn}`,
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: `with-run-text-${turn}`,
        kind: 'text',
        text: `controlled calibration ${turn}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw Error('invalid controlled user')
  return judged.ok
}

describe('actual withRun input calibration through the demo service', () => {
  it('retains the original Run-owned selected chain across three local TLS turns', async () => {
    const base = await callDeployment('runner-service-with-run-calibration')
    const profile = createOfficialProfileContent(definition, {
      providers: ['anthropic'],
      allowFallback: false,
      configuration: {
        revision: 'controlled-with-run-calibration',
        values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
      },
    })
    if ('rejected' in profile) throw Error('Anthropic profile invalid')
    const calls = { full: [] as string[], replay: [] as string[], fresh: [] as string[] }
    const original = createAnthropicInputMeter(definition)
    const meter: InputMeter = {
      ...original,
      measureFull(input) {
        calls.full.push(input.serialized)
        return original.measureFull(input)
      },
      measureReplay(input) {
        calls.replay.push(JSON.stringify(input.units))
        return original.measureReplay(input)
      },
      measureNew(input) {
        calls.fresh.push(JSON.stringify(input.units))
        return original.measureNew(input)
      },
    }
    const config = {
      ...base,
      officialManifest: { ordinal: 1, entries: [profile.ok] },
      modelRequest: {
        ...base.modelRequest,
        transport: {
          ...base.modelRequest.transport,
          definitions: [definition],
          inputMeters: [meter],
        },
      },
    }
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      definition.modelId,
      usage,
      'Anthropic',
    )
    let fixture: ControlledRunFixturePort | undefined
    let selected: ControlledSingleRunSelection | undefined
    const calibrationTrace: { result: string; messages: number; entries: number }[] = []
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      controlledRunFixture(port) {
        fixture = port
      },
      runHistory(prefix, run, attempt) {
        if (run !== selected?.run || attempt !== selected.attempt) return { unavailable: true }
        const history = messagePrefixWithSources(prefix, selected)
        if ('unavailable' in history) return { unavailable: true }
        const starts = history.messages.filter(
          message =>
            message.type === 'system_reminder' && message.source.kind === 'attempt_started',
        )
        if (starts.length !== 1) return { unavailable: true }
        // The fixture admits exactly one attempt and never writes a terminal Run fact.
        return {
          known: { run, originalAttempt: attempt, latestAttempt: attempt, terminal: 'open' },
        }
      },
      calibrationHistory(prefix, messages, target) {
        const result: ReturnType<typeof readDemoCalibrationHistory> =
          selected === undefined
            ? { sourceUnavailable: true }
            : readDemoCalibrationHistory(prefix, messages, target, selected)
        calibrationTrace.push({
          result:
            'sourceUnavailable' in result
              ? 'unavailable'
              : 'noObservation' in result
                ? 'none'
                : `${result.candidates.length} candidates`,
          messages: messages.length,
          entries: prefix.entries.length,
        })
        return result
      },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    let release: (() => void) | undefined
    const calibrations: ModelResponse['inputCalibration'][] = []
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'controlled-calibration-session')
      if (!('session' in prepared)) throw Error('controlled session unavailable')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, session, definition.modelId)).toEqual({
        selected: definition.modelId,
      })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('controlled-calibration-credential'),
          body: Buffer.from('controlled-calibration-key'),
        })),
      ).toEqual({ stored: true })
      if (fixture === undefined) throw Error('controlled Run fixture unavailable')
      const started = await fixture.startAttempt(who, session, RUN, 1)
      if (!('report' in started)) throw Error(`Run start unavailable: ${JSON.stringify(started)}`)
      release = started.release
      selected = { run: RUN, attempt: 1 }
      release()
      for (let turn = 0; turn < 3; turn++) {
        const before = { full: calls.full.length, fresh: calls.fresh.length }
        const sent = await app.startServiceCall(who, session, {
          user: user(turn),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
          run: RUN,
          attempt: 1,
          report: started.report,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw Error(`withRun turn ${turn} unavailable: ${JSON.stringify(sent)}`)
        const pending = sent.result.replyPending
        calibrations.push(pending.inputCalibration)
        expect(pending.inputCalibration.observedInput).toMatchObject({ kind: 'from_usage' })
        expect(pending.usage).toMatchObject({ cache_read_tokens: 2000, cache_write_tokens: 1000 })
        const persisted = await app.persistModelReply(who, session, pending)
        if (!('settled' in persisted))
          throw Error(`withRun turn ${turn} persistence unavailable: ${JSON.stringify(persisted)}`)
        expect(
          calls.full.length - before.full,
          JSON.stringify({
            calibrationTrace,
            full: calls.full.map(x => x.length),
            fresh: calls.fresh.length,
            replay: calls.replay.length,
          }),
        ).toBe(turn === 0 ? 2 : 0)
        expect(calls.fresh.length - before.fresh).toBe(turn === 0 ? 0 : 2)
      }
      expect(tls.requests).toHaveLength(3)
      const read = await app.readSessionLog(who, session)
      if (!('entries' in read)) throw Error('controlled response log unavailable')
      const responses = read.entries.filter(entry =>
        typeof entry.payload === 'object' &&
        entry.payload !== null &&
        !Array.isArray(entry.payload) &&
        'category' in entry.payload
          ? entry.payload.category === 'response'
          : false,
      )
      expect(responses).toHaveLength(3)
      expect(responses.every(entry => entry.run === RUN && entry.attempt === 1)).toBe(true)
      const sessionLog = config.sessionLog
      if (sessionLog === undefined) throw Error('physical session log unavailable')
      const logFiles = (await readdir(sessionLog.dir, { recursive: true })).filter(name =>
        name.endsWith('entries.jsonl'),
      )
      const batches = (
        await Promise.all(
          logFiles.map(async name =>
            (await readFile(join(sessionLog.dir, name), 'utf8'))
              .split('\n')
              .filter(Boolean)
              .map(
                line =>
                  JSON.parse(line) as {
                    entries: { payload: { category: string; value: ModelResponse } }[]
                  },
              ),
          ),
        )
      ).flat()
      const responseBatches = batches.filter(batch =>
        batch.entries.some(entry => entry.payload.category === 'response'),
      )
      expect(responseBatches).toHaveLength(3)
      for (const [index, batch] of responseBatches.entries()) {
        expect(batch.entries.map(entry => entry.payload.category)).toEqual(['message', 'response'])
        expect(batch.entries[1]!.payload.value.inputCalibration).toEqual(calibrations[index])
      }
    } finally {
      release?.()
      await host.stop()
      if (diagnostics) {
        const closed = await diagnostics.closeAfterBusiness(() => app.close())
        expect(closed.complete).toBe(true)
      } else expect((await app.close()).complete).toBe(true)
      await tls.close()
    }
  })
})
