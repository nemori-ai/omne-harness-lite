import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  readSettlementPrefix,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime-local'
import { readDemoCalibrationHistory } from '../src/model-request-text.ts'

test('the default no-Run calibration reader refuses an unproved Run source', async () => {
  const session = unwrap(parseOpaqueIdentifier('runner-calibration-session', 'SessionRef'))
  const tenant = unwrap(
    parseTenantId({
      organization: 'runner-calibration-org',
      account: 'runner-calibration-account',
    }),
  )
  const generation = {}
  const registration: SettlementRegistration = {
    start(_kind, operation) {
      const completion = operation(new AbortController().signal)
      return {
        completion,
        stopped: completion.then(
          () => undefined,
          () => undefined,
        ),
        requestStop() {},
      }
    },
    release() {},
  }
  const read = await readSettlementPrefix({
    registration,
    binding: {
      session,
      tenant,
      generation,
      currentGeneration: () => generation,
      log: {
        readSince: async () => ({ entries: [], tail: 0 }),
        readByKey: async () => ({ entries: [], tail: 0 }),
        append: async () => ({ failure: 'unavailable' as const }),
      },
    },
  })
  if ('unavailable' in read) throw Error('controlled owned prefix unavailable')
  const target = {
    callId: unwrap(parseOpaqueIdentifier('runner-calibration-call', 'ModelCallId')),
    dispatch: 1,
    run: 'runner-calibration-run',
    attempt: 1,
  }
  expect(readDemoCalibrationHistory(read.prefix, [], target)).toEqual({ sourceUnavailable: true })
})
