import { judgeInput } from '../../packages/core/loop-extension/dist/index.js'
import { validate, judgeMessage } from '../../packages/core/messages/dist/index.js'
const message = { id: 'msg_2', type: 'assistant', response: 'rsp_01', ending: 'complete', createdAt: '2026-09-23T10:00:00Z', blocks: [{ id: 'b', kind: 'voice', mediaType: 'audio/wav', data: { storage: 's', key: 'k', mediaType: 'audio/ogg' }, visibility: { toHuman: true, toModel: true } }] }
const input = { position: 'before_persist_message', subject: { producer: 'model', message }, earlier: [], log: 'log_1', environment: 'env_1' }
console.log(JSON.stringify({ schema: validate('Message', message), message: judgeMessage(message), loop: judgeInput(input) }, null, 2))
