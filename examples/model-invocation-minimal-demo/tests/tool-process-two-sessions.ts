// Prepare a second owned session using the demo's actual public data owners.
import assert from 'node:assert/strict'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { captureSessionRecipe } from '@omne-harness-lite/evaluation-input-store/publication'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createDemoConfig, MODEL } from '@omne-harness-lite/model-invocation-minimal-demo'
import type { DemoConversation } from '@omne-harness-lite/model-invocation-minimal-demo'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Context } from '@deepseek-ai/cordis'
import { DEMO_ROOT } from '../dist/deployment.js'
import { createDemoCallHost } from '../dist/model-call-host.js'

export async function prepareSecondSession(
  demo: DemoConversation,
  storage: AtomicStorage,
  context: Context,
  input: { readonly data: string; readonly owner: string },
) {
  const session = 'second-owned-crash-session'
  const app = demo.application
  assert.equal((await app.createToolSession(demo.actor, session)).kind, 'bound')
  const prepared = await app.prepareSession(demo.actor, session)
  assert.ok('session' in prepared)
  assert.equal(prepared.session, session)
  const config = createDemoConfig(
    input.data,
    'two-session-crash',
    () => app.currentTime(),
    { multiplier: 1.1, reserveTokens: 256 },
    {
      waitMilliseconds: 30,
      force: false,
      schedule(milliseconds, callback) {
        const timer = setTimeout(callback, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    { current: input.owner, observeExit: async () => 'unknown' },
    true,
  )
  assert.ok(config.modelRequest)
  const captured = await captureSessionRecipe(
    {
      storage,
      memberships: context.memberships,
      sessionTenancy: context.sessionTenancy,
      storeKey: config.modelRequest.evaluationInputs.storeKey,
      deployedOfficial: config.modelRequest.evaluationInputs.deployedOfficial,
      diagnostics() {},
      onDiagnosticFailure() {},
      monotonicNow: () => process.hrtime.bigint(),
    },
    { session, tenant: demo.actor.tenant, rootDefinition: DEMO_ROOT },
  )
  assert.deepEqual(captured, { captured: true })
  const current = await context.currentEvaluationInputs.read(
    unwrap(parseOpaqueIdentifier(session, 'SessionRef')),
    demo.actor.tenant,
  )
  assert.ok('input' in current)
  const evaluated = evaluate(current.input)
  assert.ok('ok' in evaluated)
  const filled = await context.assetRegistry.fill(
    session,
    evaluated.ok,
    unwrap(parseOpaqueIdentifier('second-crash-evaluation', 'EvaluationRef')),
    evaluated.ok.composition,
  )
  assert.ok('snapshots' in filled)
  const selected = await app.selectModel(demo.actor, session, MODEL)
  assert.ok('selected' in selected)
  assert.equal(selected.selected, MODEL)
  const host = createDemoCallHost()
  assert.deepEqual(await app.attachModelCallHost(demo.actor, session, host), { attached: true })
  const user = judgeMessage({
    type: 'user',
    id: 'second-crash-user',
    createdAt: app.currentTime(),
    blocks: [
      {
        id: 'second-crash-text',
        kind: 'text',
        text: 'Generate another nonce.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  assert.ok('ok' in user && user.ok.type === 'user')
  const message = user.ok
  return {
    session,
    async send() {
      return app.runToolTurn(
        demo.actor,
        session,
        {
          user: message,
          parameters: { reasoningEffort: 'low', maxOutputTokens: 16384 },
          host: host.host,
        },
        new AbortController().signal,
      )
    },
  }
}
