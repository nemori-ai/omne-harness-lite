import { createHash, randomUUID } from 'node:crypto'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SessionDriverIdentitySource } from '@omne-harness-lite/session-runtime-local'
import { toolJournalFormat } from '@omne-harness-lite/tool-execution-runtime'

export function createSessionDriverIdentities(): SessionDriverIdentitySource {
  const id = (kind: string, ...parts: unknown[]) =>
    kind + ':' + createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  const invocation = (...parts: unknown[]) => ({
    prepareKey: id('prepare', parts),
    originalPosition: id('origin', parts),
    resultKey: id('result', parts),
    adoptionKey: id('adopt', parts),
  })
  return {
    run: (...parts) => ({ startKey: id('start', parts), attemptKey: id('attempt', parts) }),
    model: (...parts) => {
      const key = parseOpaqueIdentifier(id('creation', parts), 'CreationKey')
      if (!isOk(key)) throw new Error('Generated CreationKey rejected')
      return { ...invocation(...parts), call: id('call', parts), creationKey: key.ok }
    },
    restoreModel(preparation) {
      const digest = preparation.call.slice('call:'.length)
      if (
        !/^[a-f0-9]{64}$/.test(digest) ||
        preparation.call !== `call:${digest}` ||
        preparation.stepKey !== `prepare:${digest}` ||
        preparation.originalPosition !== `origin:${digest}`
      )
        return { unavailable: true }
      const creationKey = parseOpaqueIdentifier(`creation:${digest}`, 'CreationKey')
      if (!isOk(creationKey)) return { unavailable: true }
      return {
        prepareKey: preparation.stepKey,
        call: preparation.call,
        originalPosition: preparation.originalPosition,
        creationKey: creationKey.ok,
        resultKey: `result:${digest}`,
        adoptionKey: `adopt:${digest}`,
      }
    },
    tool: (...parts) => ({
      ...invocation(...parts),
      originalPosition: toolJournalFormat + '/' + JSON.stringify(['execution_intended', parts[4]]),
    }),
    modelContent: {
      response: randomUUID,
      message() {
        const value = parseOpaqueIdentifier(randomUUID(), 'MessageId')
        if (!isOk(value)) throw new Error('Generated MessageId rejected')
        return value.ok
      },
    },
  }
}
