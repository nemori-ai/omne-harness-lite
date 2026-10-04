import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { judgeDefinition, judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import { checkAppendInput } from '@omne-harness-lite/session-log-jsonl'
import { passKeys, runPass } from '@omne-harness-lite/loop-extension-runner'

function accepted(result) {
  if (!('ok' in result)) throw new Error('Example input is invalid')
  return result.ok
}

const at = '2026-09-29T00:00:00Z'
const session = accepted(parseOpaqueIdentifier('example-session', 'SessionRef'))
const tenant = accepted(parseTenantId({ organization: 'example-org', account: 'example-account' }))
const logHandle = accepted(parseOpaqueIdentifier('example-log', 'LogHandle'))
const environment = accepted(parseOpaqueIdentifier('example-environment', 'EnvironmentHandle'))
const initial = accepted(
  judgePositionedSubject({
    position: 'after_persist_message',
    subject: { message: { id: 'example-message', type: 'user', blocks: [], createdAt: at } },
  }),
)
const definition = accepted(
  judgeDefinition({
    name: 'example-extension',
    position: 'after_persist_message',
    power: 'veto',
    implementation: { kind: 'builtin', builtinName: 'example-extension' },
  }),
)
const pass = {
  initial,
  anchor: 'example-message',
  execution: { kind: 'withRun', run: 'example-run', attempt: 1 },
}
const chain = [{ definition, power: 'veto' }]
const entries = []
let readiness = 'pending'
let presence = 'present'
let calls = 0
const ports = {
  binding: { session, tenant, logGeneration: 'example-generation' },
  readConclusions: async current => {
    const keys = passKeys({ position: current.initial.position, anchor: current.anchor })
    if ('invalidInput' in keys) return { failure: 'invalidInput' }
    return {
      entries: entries.filter(entry => entry.readKeys.includes(keys.pass)),
      tail: entries.length,
    }
  },
  readAskState: async association =>
    readiness === 'pending'
      ? { kind: 'pending', association }
      : {
          kind: 'ready',
          binding: {
            association,
            cardId: 'example-card',
            batchId: 'example-batch',
            answerId: 'example-answer',
            control: () => 'valid',
            release: () => {},
          },
        },
  presence: async () => presence,
  openHandles: async () => ({ log: logHandle, environment, release: () => {} }),
  invoke: async (_piece, _input, _signal, mode) => {
    calls++
    return mode.kind === 'fresh'
      ? {
          kind: 'output',
          value: {
            kind: 'ask',
            card: {
              explanation: 'Continue?',
              options: [{ id: 'yes', label: 'Yes' }],
              about: { position: 'after_persist_message' },
            },
          },
        }
      : { kind: 'output', value: { kind: 'observed' } }
  },
  verifyFailure: async () => ({ kind: 'unavailable' }),
  judgeCapabilities: async () => ({ kind: 'accepted' }),
  record: async entry => {
    const checked = checkAppendInput(
      session,
      [entry],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if (!('ok' in checked)) return { kind: 'invalidInput' }
    const existing = entries.find(previous => previous.dedupeKey === entry.dedupeKey)
    if (existing) return { kind: 'alreadyRecorded', entry: existing }
    const stored = { ...checked.ok.entries[0], session, position: entries.length + 1 }
    entries.push(stored)
    return { kind: 'confirmed', entry: stored }
  },
  now: () => at,
  mintReminder: () => 'example-reminder',
  isActive: () => true,
  fallbackNeedsProjection: async () => false,
  reminders: {
    inspect: async () => ({ kind: 'absent' }),
    nestedChain: async () => [],
    append: async () => ({ kind: 'confirmed' }),
  },
}

const signal = new AbortController().signal
const fresh = await runPass(pass, chain, ports, signal)
const pending = await runPass(pass, chain, ports, signal)
readiness = 'ready'
const replay = await runPass(pass, chain, ports, signal)
const final = await runPass(pass, chain, ports, signal)
presence = 'unavailable'
const unavailable = await runPass({ ...pass, anchor: 'another-anchor' }, chain, ports, signal)
console.log({
  fresh: 'effect' in fresh ? fresh.effect.kind : fresh.failure,
  pending: 'effect' in pending ? pending.effect.kind : pending.failure,
  replay: 'effect' in replay ? replay.effect.kind : replay.failure,
  final: 'effect' in final ? final.effect.kind : final.failure,
  unavailable: 'effect' in unavailable ? unavailable.effect.kind : unavailable.failure,
  calls,
})
