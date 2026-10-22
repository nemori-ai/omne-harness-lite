import { createExecutionCoordinator } from '../../src/loop/coordinator.ts'
import { agentEvaluator } from '../../dist/index.js'
import { tenantCodec } from '@omne-harness/legal-identity'

const pending = new Map()
let sequence = 0
let coordinator

function remote(path) {
  return (...args) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      const encoded = args.map(input => {
        if (input === null || typeof input !== 'object' || !('tenant' in input)) return input
        const tenant = tenantCodec.encode(input.tenant)
        if (!tenant.ok) throw new Error('Cannot encode IPC tenant')
        return { ...input, tenant: tenant.value }
      })
      process.send({ kind: 'call', id, path, args: encoded })
    })
}

const group = (prefix, methods) =>
  Object.fromEntries(methods.map(method => [method, remote([...prefix, method])]))

process.on('message', async message => {
  if (message === null || typeof message !== 'object') throw new Error('Invalid IPC envelope')
  if (message.kind === 'reply') {
    if (!Number.isSafeInteger(message.id) || !pending.has(message.id))
      throw new Error('Unexpected IPC receipt')
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (message.error === undefined) call.resolve(message.value)
    else call.reject(new Error(message.error))
    return
  }
  if (message.kind !== 'drive') throw new Error('Unexpected IPC command')
  try {
    if (coordinator === undefined) {
      const tenant = tenantCodec.parse(message.tenant)
      if (!tenant.ok) throw new Error('Invalid IPC tenant')
      coordinator = createExecutionCoordinator({
        ...message.entry,
        access: { ...message.entry.access, tenant: tenant.value },
        binding: { ...message.entry.binding, tenant: tenant.value },
        evaluator: agentEvaluator,
        idle: () => process.send({ kind: 'idle' }),
        ports: {
          journal: group(
            ['journal'],
            [
              'open',
              'load',
              'inputs',
              'readReplyAdmissions',
              'commit',
              'query',
              'recordResult',
              'tryFinish',
            ],
          ),
          models: {
            calls: group(['models', 'calls'], ['inspect', 'admit', 'dispatches']),
            consumption: group(
              ['models', 'consumption'],
              ['beginRead', 'readNext', 'closeRead', 'acknowledge'],
            ),
          },
          conditions: group(['conditions'], ['read']),
          selection: group(['selection'], ['select']),
          requests: group(['requests'], ['prepare']),
          modelContext: group(['modelContext'], ['read']),
          handoff: group(['handoff'], ['accept']),
          materials: group(['materials'], ['preserve', 'read']),
          clock: group(['clock'], ['now']),
        },
      })
    }
    let result
    if (message.mode === 'accept') {
      const accepted = await coordinator.accept()
      process.send({ kind: 'accepted', value: accepted })
      result = 'failure' in accepted ? accepted : await coordinator.runExecution()
    } else if (message.mode === 'continue') {
      result = await coordinator.continueExecution(message.authority)
    } else if (message.mode === 'run') {
      result = await coordinator.runExecution()
    } else throw new Error('Invalid drive mode')
    process.send({ kind: 'done', value: result })
  } catch (error) {
    process.send({ kind: 'crash', error: String(error) })
  }
})

process.send({ kind: 'ready', pid: process.pid })
