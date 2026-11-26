import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import { NO_RESEND_RETRY_POLICY, type SupplierPort } from '@omne-harness/model'
import {
  DECISION_REPRESENTATION,
  decisionAskOf,
  type DecisionAsk,
} from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { isDecisionSupplier } from '@omne-harness/pi-ai-transport/decisions'
import { describe, expect, it } from 'vitest'
import { createDecisionPreparation } from '../src/decision-preparation.ts'

const organization = organizationCodec.parse('org_00000000000000000000000001')
const account = accountCodec.parse('acc_00000000000000000000000001')
if (!organization.ok || !account.ok) throw new Error('no tenant for the tests')
const tenant = tenantOf(organization.value, account.value)
const MODEL = 'openai/gpt-6-luna-decisions'
const MESSAGE = `msg_${'d'.repeat(40)}`
const adoption = (name: string, digit: string) => ({
  owner: 'tests',
  name,
  revision: '1',
  digest: digit.repeat(64),
})
const SOURCE = adoption('goal-decisions', '2')
const ask: DecisionAsk = {
  state: { goal: 'faster home page' },
  questions: { A1: { type: 'choice', criteria: { holds: 'yes', fails: 'no' } } },
}

type Asked = Parameters<SupplierPort<string>>[0]
function scene(layer: 'tenant' | 'official' = 'official') {
  const asked: Asked[] = []
  const preparation = createDecisionPreparation<string>({
    supplierOf(input) {
      asked.push(input)
      const { adoption: chosen, provider, model } = input.supplier
      return { ok: { adoption: chosen, provider, model, credential: { layer } } }
    },
  })
  const prepare = (over: Partial<Parameters<typeof preparation.prepare>[0]> = {}) =>
    preparation.prepare({
      principal: 'alice',
      tenant,
      model: MODEL,
      message: MESSAGE,
      ask,
      source: SOURCE,
      ...over,
    })
  return { asked, prepare }
}

describe('the fixed request of a decision call', () => {
  it('is one decision message to the one supplier of the model, sent once, and a valid fixed request', async () => {
    const { prepare, asked } = scene('tenant')
    const prepared = await prepare()
    if (!('ok' in prepared)) throw new Error(JSON.stringify(prepared))
    const request = prepared.ok
    expect(judgeFixedModelRequest(request)).toEqual({ ok: request })
    expect(decisionAskOf(request)).toEqual(ask)
    const [supplier, ...more] = request.suppliers
    expect(more).toEqual([])
    expect(isDecisionSupplier(supplier)).toBe(true)
    expect(supplier.credential).toEqual({ layer: 'tenant' })
    expect(request).toMatchObject({
      profile: supplier.adoption,
      fallback: false,
      retryPolicy: NO_RESEND_RETRY_POLICY,
      parameters: [],
      toolChoice: 'none',
      representation: DECISION_REPRESENTATION,
      parameterAdoptions: [],
      source: SOURCE,
    })
    expect(request.declarations).toEqual([
      {
        produces: `openrouter/${MODEL}`,
        accepts: [`openrouter/${MODEL}`],
        foreignThinking: 'omit',
      },
    ])
    expect(asked.map(input => [input.principal, input.profile.identity.scope.kind])).toEqual([
      ['alice', 'factory'],
    ])
  })

  it('is refused for a model that is no decision model, before any credential is read', async () => {
    const { prepare, asked } = scene()
    expect(await prepare({ model: 'openai/gpt-6' })).toEqual({
      failure: { kind: 'invalid', field: 'model', reason: 'not-a-decision-model' },
    })
    expect(asked).toEqual([])
  })

  it('is refused under an id that is no message id', async () => {
    const { prepare } = scene()
    expect(await prepare({ message: '' })).toEqual({
      failure: { kind: 'invalid', field: 'message', reason: 'identity' },
    })
  })

  it('carries the failure of the credential layer as it was answered', async () => {
    const failure = { kind: 'unavailable', dependency: 'model-credential', diagnostic: 'away' }
    const preparation = createDecisionPreparation<string>({
      supplierOf: () => ({ failure }) as ReturnType<SupplierPort<string>>,
    })
    const answer = await preparation.prepare({
      principal: 'alice',
      tenant,
      model: MODEL,
      message: MESSAGE,
      ask,
      source: SOURCE,
    })
    expect(answer).toEqual({ failure })
  })
})
