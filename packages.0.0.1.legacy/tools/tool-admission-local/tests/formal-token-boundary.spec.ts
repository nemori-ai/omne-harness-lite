import { expect, test } from 'vitest'
import { createAdmissionJudgment } from '../src/index.ts'
import { decodeRunnerAdmissionToken as decodeFormalToken } from '@omne-harness-lite/loop-extension-runner'
import type { AdmissionInput, AuthorizationContext } from '@omne-harness-lite/tool-admission'
const invalid = { invalidInput: true }
function call(args: unknown = {}, callId = 'call/一') {
  return {
    kind: 'tool_call',
    id: 'block',
    callId,
    visibility: { toHuman: true, toModel: true },
    complete: true,
    tool: 'echo',
    arguments: args,
  }
}
test('the independently returned provisional token cannot enter formal verification', async () => {
  const input = {
    call: call(),
    definition: { name: 'echo' },
    grants: {} as AuthorizationContext,
    runMode: 'auto_permission',
    effectivePermission: { value: 'auto', from: 'tenant' },
    tenantAutoWritable: true,
  } as AdmissionInput
  const result = await createAdmissionJudgment().admit([input])
  if (result.kind !== 'decisions' || result.results[0].kind !== 'allow')
    throw new Error('expected allow fixture')
  expect(result.results[0].token.startsWith('admission.1.')).toBe(true)
  expect(decodeFormalToken(result.results[0].token)).toEqual(invalid)
})
