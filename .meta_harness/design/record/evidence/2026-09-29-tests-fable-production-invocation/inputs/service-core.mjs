import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  generateHandoffKeyPair,
  parseOpaqueIdentifier,
  unwrap,
} from '../../packages/core/identity-values/dist/index.js'
import {
  jsonNumberSource,
  writeJsonLossless,
} from '../../packages/core/content-blocks/dist/index.js'
import { decodeModelLogKey } from '../../packages/model/model-request-runtime/dist/index.js'
import { createAnthropicInputMeter } from '../../packages/model/pi-ai-transport/dist/index.js'
import { createAcceptanceApplication } from '../../examples/model-invocation-minimal-demo/dist/bootstrap.js'
import { createDemoConfig } from '../../examples/model-invocation-minimal-demo/dist/deployment.js'
import {
  createDemoDiagnosticConfig,
  ensureDemoDiagnosticParent,
} from '../../examples/model-invocation-minimal-demo/dist/demo.js'
import { openDemoDiagnosticAssembly } from '../../examples/model-invocation-minimal-demo/dist/diagnostic-assembly.js'
import { createDemoCallHost } from '../../examples/model-invocation-minimal-demo/dist/model-call-host.js'
import {
  paidInvocation,
  writePrivateEvidence,
} from '../../tools/model-probe/src/production-gate.mjs'
import {
  actualUsd,
  definition,
  judgedTextMessage,
  modelId,
  profileFor,
  transportPolicy,
  wholeContextReservation,
} from './paid-core.mjs'

async function initializeDataDirectory(outputDir) {
  const directory = join(outputDir, `service-data-${randomUUID()}`)
  await mkdir(directory, { mode: 0o700 })
  await mkdir(join(directory, 'session-logs'), { mode: 0o700 })
  const activation = generateHandoffKeyPair()
  const purge = generateHandoffKeyPair()
  const files = [
    ['activation-private.pem', activation.privateKeyPem],
    ['activation-public.pem', activation.publicKeyPem],
    ['purge-private.pem', purge.privateKeyPem],
    ['purge-public.pem', purge.publicKeyPem],
    ['model-key', randomBytes(32)],
  ]
  for (const [name, bytes] of files)
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 })
  return directory
}

function configFor(directory, scenario) {
  const retirement = {
    waitMilliseconds: 10_000,
    force: false,
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
  }
  const base = createDemoConfig(
    directory,
    `priority-${randomUUID()}`,
    () => new Date().toISOString(),
    { multiplier: 1.1, reserveTokens: 256 },
    retirement,
  )
  const profile = profileFor(scenario)
  return {
    ...base,
    officialManifest: { ordinal: 1, entries: [profile] },
    modelRequest: {
      ...base.modelRequest,
      transport: {
        definitions: [definition],
        inputMeters: [createAnthropicInputMeter(definition)],
        policy: transportPolicy(),
        retirement,
      },
    },
  }
}

function durableResponse(entries, responseId) {
  const matches = entries.filter(entry =>
    entry.readKeys.some(key => {
      const decoded = decodeModelLogKey(key)
      return 'ok' in decoded && decoded.ok.kind === 'response' && decoded.ok.response === responseId
    }),
  )
  assert.equal(matches.length, 1, 'one original SL3 response entry required')
  const payload = matches[0].payload
  assert.ok(payload && typeof payload === 'object' && 'value' in payload)
  assert.equal(payload.value.id, responseId)
  return payload.value
}

export async function servicePaidCase({
  scenario,
  pricing,
  ledger,
  outputDir,
  credentialBytes,
  developmentTransport,
}) {
  const dataDir = await initializeDataDirectory(outputDir)
  const config = configFor(dataDir, scenario)
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    ...(developmentTransport ? { developmentTransport } : {}),
    diagnostics: { record() {} },
  })
  const host = createDemoCallHost()
  let diagnostics
  let closeResult
  let hostReleasedAfterBusiness = false
  let caught
  const completed = []
  try {
    await app.ready
    const identifier = `priority-${randomUUID()}`
    const password = randomBytes(24).toString('hex')
    assert.equal(await app.register(identifier, password), 'registered')
    const actor = await app.authenticate(identifier, password)
    assert.ok('account' in actor, 'real authentication required')
    await ensureDemoDiagnosticParent(dataDir)
    diagnostics = await openDemoDiagnosticAssembly(
      createDemoDiagnosticConfig(dataDir, actor.tenant, config.modelRequest.transport.retirement),
    )
    const activated = await app.activateModelRequest(actor, diagnostics, diagnostics.transports)
    assert.ok('activated' in activated, 'diagnostic activation required before P2')
    const prepared = await app.prepareSession(actor, 'priority-service-session')
    assert.ok('session' in prepared, 'real session required')
    const session = prepared.session
    const reconciled = await app.reconcileModelRuntime(actor, session)
    assert.ok('calls' in reconciled)
    const bound = await app.bindModelRuntime(actor, session)
    assert.ok('service' in bound)
    assert.deepEqual(await app.prepareModelInputs(actor, session), { prepared: true })
    assert.deepEqual(await app.selectModel(actor, session, modelId), { selected: modelId })
    assert.deepEqual(await app.attachModelCallHost(actor, session, host), { attached: true })
    const published = await app.publishCredential(actor, async checked => ({
      account: checked.account,
      tenant: checked.tenant,
      sourceRef: unwrap(
        parseOpaqueIdentifier(`priority-credential-${randomUUID()}`, 'CredentialRef'),
      ),
      body: credentialBytes,
    }))
    assert.deepEqual(published, { stored: true })
    credentialBytes.fill(0)
    for (const [index, text] of scenario.turns.entries()) {
      const estimateUsd = wholeContextReservation(pricing, scenario)
      const paid = await paidInvocation(
        ledger,
        {
          model: modelId,
          provider: 'anthropic',
          stage: 'acceptance',
          estimateUsd,
        },
        async entryId => {
          const sent = await app.startServiceCall(actor, session, {
            user: judgedTextMessage('user', text, `priority-turn-${index + 1}`),
            parameters: {
              reasoningEffort: scenario.reasoningEffort,
              maxOutputTokens: scenario.maxOutputTokens,
            },
            host: host.host,
          })
          if (!('result' in sent) || !('replyPending' in sent.result))
            throw new Error(`service turn ${index + 1} did not reach replyPending`)
          const settled = await app.persistModelReply(actor, session, sent.result.replyPending)
          if (!('settled' in settled))
            throw new Error(`service turn ${index + 1} settlement unconfirmed`)
          const response = settled.settled.response.response
          const log = await app.readSessionLog(actor, session)
          assert.ok('entries' in log, 'SL3 read required')
          const durable = durableResponse(log.entries, response.id)
          assert.equal(writeJsonLossless(durable), writeJsonLossless(response))
          const safe = {
            case: 'service',
            turn: index + 1,
            entryId,
            modelId,
            responseId: response.id,
            estimateUsd,
            approvedLocalWireSha256: scenario.serviceWireSha256[index],
            liveWireSha256: 'unavailable',
            outcome: response.outcome,
            requestInput: response.inputCalibration?.requestInput?.kind ?? null,
            observedInput: response.inputCalibration?.observedInput?.kind ?? null,
            usage: JSON.parse(writeJsonLossless(response.usage)),
            cost: JSON.parse(writeJsonLossless(response.cost)),
            durable: true,
          }
          await writePrivateEvidence(
            `${outputDir}/service-${entryId}.json`,
            JSON.stringify(safe, null, 2) + '\n',
          )
          return { actualUsd: actualUsd(response.cost), safe }
        },
      )
      completed.push({ entryId: paid.id, ...paid.receipt.safe })
      assert.equal(paid.receipt.safe.outcome, 'complete', 'service outcome failed; stop next send')
    }
  } catch (error) {
    caught = error
  } finally {
    credentialBytes.fill(0)
    const stoppedBeforeBusiness = await host.stop()
    closeResult = diagnostics
      ? await diagnostics.closeAfterBusiness(() => app.close())
      : await app.close()
    const stoppedAfterBusiness = await host.stop()
    hostReleasedAfterBusiness = 'released' in stoppedAfterBusiness
    await writePrivateEvidence(
      `${outputDir}/service-close-${randomUUID()}.json`,
      JSON.stringify(
        {
          hostReleasedBeforeBusiness: 'released' in stoppedBeforeBusiness,
          hostReleasedAfterBusiness: 'released' in stoppedAfterBusiness,
          complete: closeResult.complete,
          businessComplete: closeResult.businessComplete ?? closeResult.complete,
          completedEntries: completed.map(value => value.entryId),
        },
        null,
        2,
      ) + '\n',
    )
  }
  if (caught) throw caught
  assert.equal(closeResult.complete, true, 'business and diagnostic owners must close')
  assert.equal(hostReleasedAfterBusiness, true, 'host owner must release after close')
  return completed
}
