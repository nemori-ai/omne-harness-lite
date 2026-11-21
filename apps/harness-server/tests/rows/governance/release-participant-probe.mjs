import { registerHooks } from 'node:module'
import { parentPort, workerData } from 'node:worker_threads'

const resolved = []
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context)
    resolved.push(result.url)
    return result
  },
})

const { default: participant } = await import(workerData.href)
const provided = []
const outcome = participant.execute(
  {},
  {
    provideFact(key, value) {
      provided.push({ key, value: JSON.stringify(value) })
    },
    requireFact() {
      throw new Error('the release participant requires no fact')
    },
    execute() {
      throw new Error('the release participant runs no statement')
    },
  },
)
parentPort.postMessage({ outcome, provided, resolved })
