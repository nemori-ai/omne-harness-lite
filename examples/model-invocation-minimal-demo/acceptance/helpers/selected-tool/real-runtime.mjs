import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { sdk } from './sdk.mjs'
import { createRealInputs } from './real-inputs.mjs'
import { createLiveAuthority } from './live-authority.mjs'
import { publishControlledModelSource } from './controlled-model-source.mjs'

if (!process.argv[2]) throw new Error('An exclusive evidence directory is required')
const directory = resolve(process.argv[2])
await mkdir(directory, { recursive: true, mode: 0o700 })
const host = await createRealInputs(directory)
const closers = []
let active = true
let failure
try {
  const [
    LOG,
    SQLLOG,
    RUN,
    RUNLOCAL,
    ADMIT,
    TOOL,
    TOOLDEF,
    RESULTS,
    ENV,
    CONTEXT,
    DEMO,
    DEMOCORDIS,
    LIFE,
    KB,
  ] = await Promise.all([
    sdk('packages/core/session-log'),
    sdk('packages/session/session-log-sql'),
    sdk('packages/core/loop-extension-runner'),
    sdk('packages/agent-loop/loop-extension-runner-local'),
    sdk('packages/tools/tool-admission-local'),
    sdk('packages/tools/tool-execution-local'),
    sdk('packages/core/tool-definition'),
    sdk('packages/tools/tool-result-files'),
    sdk('packages/infra/execution-environments-host'),
    sdk('packages/session/runtime-context-local'),
    sdk('examples/model-invocation-minimal-demo'),
    sdk('examples/model-invocation-minimal-demo', './cordis'),
    sdk('packages/core/assembly-lifecycle'),
    sdk('packages/core/kernel-basis', './testing'),
  ])
  const authority = createLiveAuthority(host)
  closers.push(() => authority.stop())
  const coordinator = await authority.issuer.issue('coordinator', [
    'run.advance',
    'session.log.coordinate',
    'context.read',
    'context.configure',
  ])
  const toolAccess = await authority.issuer.issue('tool', [
    'tool.submit',
    'tool.read',
    'tool.stop',
    'result.read',
    'context.read',
  ])
  const log = SQLLOG.openSqlSessionLog({
    storage: host.storage,
    authority: authority.logAuthority,
    operationLimit: 32,
  })
  closers.push(() => log.close())
  const held = await log.owner.borrow(coordinator, host.scope)
  assert.equal(held.kind, 'borrowed')
  closers.push(() => held.release())
  const context = CONTEXT.createRuntimeContext({
    storage: host.storage,
    log: held.log,
    access: authority.operations,
    now: () => new Date().toISOString(),
  })
  closers.push(async () => {
    context.closeAdmission()
    await context.drain()
  })
  assert.equal(
    (
      await context.initializer.initializeContextSession(host.scope, {
        required: [],
        initial: [],
        fixed: [],
      })
    ).kind,
    'applied',
  )
  const lifetime = LIFE.createAssemblyLifetime(['history'], () => {
    active = false
  })
  assert.equal(lifetime.tryClaim(), true)
  const historyReady = []
  const port = lifetime.port('history')
  const historyAssembly = await KB.bootAssembly({
    services: [
      { name: 'sessionLogOwner', value: log.owner },
      {
        name: 'assemblyLifetime',
        value: {
          ...port,
          register(work) {
            historyReady.push(work.ready)
            return port.register(work)
          },
        },
      },
    ],
    plugins: [{ plugin: DEMOCORDIS.managedToolOwnedInputs, config: {} }],
  })
  await Promise.all(historyReady)
  const history = historyAssembly.ctx.toolActionHistory
  assert.equal(typeof history?.inspect, 'function')
  closers.push(async () => {
    await historyAssembly.dispose()
    assert.equal((await lifetime.close()).complete, true)
  })
  const journal = await DEMO.createToolDriverJournal({
    owner: log.owner,
    access: coordinator,
    recovery: authority.recovery,
    scope: host.scope,
  })
  assert.equal(journal.kind, 'journal')
  closers.push(() => journal.close())
  const source = await publishControlledModelSource(host, held, journal)
  // No authorization expressions are evaluated. The immutable tool permission is actually auto.
  // This host-owned object is an empty grant context, never a synthetic allow decision.
  const grants = Object.freeze({})
  const actionAuthority = {
    scope: host.scope,
    coordinator,
    access: coordinator,
    policy: { grants, runMode: 'auto_permission' },
  }
  const binding = { ...host.scope, logGeneration: log.backing.ownerGeneration }
  const owner = RUNLOCAL.createRunnerTaskOwner(binding)
  closers.push(async () => {
    owner.closeAdmission()
    await owner.drain()
  })
  const base = async request => {
    const allowed = await authority.operations.authorize(coordinator, host.scope, 'run.advance')
    if (!active || request.manifest !== host.scope.session || allowed.kind !== 'authorized')
      return { failure: 'unavailable' }
    let released = false
    const isActive = () => active && !released
    return {
      binding,
      owner,
      sources: {
        sessionTenancy: host.sessionTenancy,
        manifest: host.manifest,
        history: host.history,
        isActive,
      },
      isActive,
      release() {
        released = true
      },
    }
  }
  const runnerHost = {
    acquireReplay: request => base(request),
    async acquireDispatch(request) {
      const scoped = await base(request)
      if ('failure' in scoped) return scoped
      const current =
        request.position === 'before_action'
          ? await DEMO.readToolActionSource({
              owner: log.owner,
              authorization: authority.operations,
              authority: actionAuthority,
              origin: source.origin,
            })
          : undefined
      if (current && 'failure' in current) {
        scoped.release()
        return current
      }
      const unavailablePort = async () => ({ kind: 'unavailable' })
      return {
        ...scoped,
        ...(current ? { action: current.source } : {}),
        ports: {
          readAskState: unavailablePort,
          async openHandles() {
            let released = false
            return {
              log: `selected-tool-log-${randomUUID()}`,
              environment: `selected-tool-env-${randomUUID()}`,
              release() {
                released = true
              },
              get released() {
                return released
              },
            }
          },
          verifyFailure: async () => ({ kind: 'invalidInput' }),
          async judgeCapabilities(input, output) {
            if (input.position !== 'before_action' || output.kind !== 'observed')
              return { kind: 'invalidInput' }
            const checked = await authority.operations.authorize(
              coordinator,
              host.scope,
              'run.advance',
            )
            return checked.kind === 'authorized' && scoped.isActive()
              ? { kind: 'accepted' }
              : { kind: 'unavailable' }
          },
          now: () => new Date().toISOString(),
          mintReminder: () => ({ unavailable: true }),
          fallbackNeedsProjection: async () => false,
          commandPresence: async () => 'absent',
          invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
        },
        subjectForCandidate(entry) {
          if (!scoped.isActive() || !current) return { unavailable: true }
          const checked = LOG.checkAppendInput(
            host.scope.session,
            [entry],
            { kind: 'unfenced' },
            { kind: 'unconditional' },
          )
          if (!('ok' in checked)) return { unavailable: true }
          const inspected = RUN.inspectRunnerConclusion({
            ...host.scope,
            entry: { ...checked.ok.entries[0], session: host.scope.session, position: 1 },
          })
          if (!('conclusion' in inspected) || inspected.conclusion.position !== 'before_action')
            return { unavailable: true }
          const subject = current.request.actions.find(
            item => item.call.callId === inspected.conclusion.callId,
          )
          return subject ? { position: 'before_action', subject } : { unavailable: true }
        },
        async readMessagePrefix() {
          if (!scoped.isActive()) return { unavailable: true }
          const read = await journal.read()
          return 'unavailable' in read
            ? read
            : read.models.entries.flatMap(item =>
                item.captured.message && item.captured.message.type !== 'system'
                  ? [item.captured.message]
                  : [],
              )
        },
      }
    },
  }
  const runner = RUNLOCAL.createLoopExtensionRunner({
    log: held.log,
    host: runnerHost,
    access: authority.operations,
    isActive: () => active,
  })
  closers.push(async () => {
    runner.closeAdmission()
    await runner.drain()
  })
  const admission = ADMIT.createToolAdmission({
    access: authority.operations,
    backing: log.backing,
    source: runner.admissionPassSource,
    history,
  })
  closers.push(() => admission.close())
  const withdrawAdmission = runner.implementations.registerAdmission(
    async (access, scope, pass, batch) => {
      const bound = await admission.forPass(access, scope, pass)
      return bound.kind === 'bound'
        ? bound.judgment.admit(batch)
        : { kind: 'failed', reason: 'unavailable' }
    },
  )
  closers.push(withdrawAdmission)
  const recoveryAuthority = {
    async authorizeRecovery(access, scope) {
      if (access !== authority.recovery) return 'notAuthorized'
      return (await log.owner.readPrefix(access, scope)).kind === 'prefix'
        ? 'authorized'
        : 'notAuthorized'
    },
  }
  const environments = ENV.createEnvironmentRegistry({
    access: authority.operations,
    recovery: recoveryAuthority,
  })
  closers.push(() => environments.close())
  const registry = TOOL.createToolImplementationRegistry()
  const calls = []
  const marker = id => async args => {
    calls.push({ asset: id, args })
    const nonce = `${id}:${randomUUID()}`
    await writeFile(join(directory, `${id}.marker`), nonce, { flag: 'wx', mode: 0o600 })
    return `${args.text}:${nonce}`
  }
  for (const item of host.definitions.filter(
    definition => definition.capability.category === 'tool',
  )) {
    const withdrawal = registry.register({
      capability: host.selected.capability,
      asset: item.id,
      version: '1',
      definition: item.versions[0].content.definition,
      executor: marker(item.id),
    })
    closers.push(withdrawal)
  }
  const results = await RESULTS.openToolResultStorage(
    { directory: join(directory, 'results'), storage: 'selected-tool-results' },
    { authorization: authority.operations, backing: log.backing, history, recoveryAuthority },
  )
  closers.push(() => results.close())
  const runtime = TOOL.createToolRuntime(
    {
      resultStorage: 'selected-tool-results',
      frameQueueBytes: 65536,
      tailRetry: { attempts: 3, minDelayMs: 0, maxDelayMs: 0 },
    },
    {
      recovery: authority.recovery,
      backing: log.backing,
      owner: log.owner,
      history,
      authorization: authority.operations,
      admission: () => admission,
      implementations: registry,
      context: context.operations,
      environments: { ...environments.operations, ...environments.registrations },
      results: results.operations,
      runnerHost,
      invoke: TOOL.createToolInvoker({
        parameters: TOOLDEF.createParameterJudge(),
        judgeResult(value) {
          return 'rejected' in TOOLDEF.judgeToolReturn(value)
            ? { kind: 'invalid' }
            : { kind: 'valid', result: value }
        },
      }),
      clock: host.clock,
    },
  )
  closers.push(() => runtime.close())
  await runtime.ready
  const driver = DEMO.createToolActionDriver({
    journal,
    owner: log.owner,
    authorization: authority.operations,
    authority: actionAuthority,
    runner: runner.runner,
  })
  const completed = await driver.dispatch(source.origin, new AbortController().signal)
  assert.equal(completed.kind, 'complete', host.JSON.writeJsonLossless(completed))
  assert.equal(completed.completion.gate.kind, 'available')
  assert.equal(completed.admissions.length, 1)
  const request = {
    access: toolAccess,
    scope: host.scope,
    origin: source.origin,
    adoption: source.adoption,
    call: source.call,
    admissionToken: completed.admissions[0].token,
  }
  const submitted = await runtime.operations.submit(request)
  assert.equal(submitted.kind, 'recorded', host.JSON.writeJsonLossless(submitted))
  const acquired = await runtime.operations.acquire(toolAccess, submitted.execution)
  assert.equal(acquired.kind, 'acquired')
  let ended
  try {
    ended = await acquired.observer.waitForEnd()
  } finally {
    acquired.observer.release()
  }
  assert.equal(ended.kind, 'found', host.JSON.writeJsonLossless(ended))
  assert.equal(
    ended.snapshot.state.terminal.outcome,
    'completed',
    host.JSON.writeJsonLossless(ended),
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { asset: 'selected-tool-tenant', args: source.call.arguments })
  const markerText = await readFile(join(directory, 'selected-tool-tenant.marker'), 'utf8')
  assert.equal(ended.snapshot.state.terminal.result, `${source.call.arguments.text}:${markerText}`)
  assert.deepEqual(
    (await readdir(directory)).filter(name => name.endsWith('.marker')),
    ['selected-tool-tenant.marker'],
  )
  const again = await runtime.operations.submit(request)
  assert.equal(again.kind, 'recorded')
  assert.deepEqual(again.execution, submitted.execution)
  await runtime.idle()
  assert.equal(calls.length, 1)
  const prefix = await log.owner.readPrefix(coordinator, host.scope)
  assert.equal(prefix.kind, 'prefix')
  const projected = (await sdk('packages/core/tool-execution-runtime')).projectToolJournal(
    host.scope,
    prefix.prefix.entries,
  )
  assert.ok(!('invalid' in projected))
  const execution = projected.executions.get(source.call.callId)
  assert.equal(execution.intent.value.selected.asset, 'selected-tool-tenant')
  assert.equal(execution.intent.value.selected.version, '1')
  assert.equal(execution.terminal.value.terminal.outcome, 'completed')
  const before = host.JSON.writeJsonLossless(prefix.prefix)
  for (const candidate of [
    { ...request, access: { ...toolAccess } },
    { ...request, scope: { ...host.scope, session: 'selected-tool-foreign-session' } },
  ]) {
    assert.equal((await runtime.operations.submit(candidate)).reason, 'notAuthorized')
  }
  authority.issuer.revoke(toolAccess)
  assert.equal((await runtime.operations.submit(request)).reason, 'notAuthorized')
  assert.equal(
    host.JSON.writeJsonLossless((await log.owner.readPrefix(coordinator, host.scope)).prefix),
    before,
  )
  assert.equal(calls.length, 1)
  await writeFile(
    join(directory, 'result.json'),
    host.JSON.writeJsonLossless({
      status: 'PASS',
      actualSql: true,
      actualIdentity: true,
      selected: host.selected,
      sourceBoundary: 'controlled model records through public codecs; no model request tested',
      completion: completed,
      submitted,
      again,
      ended,
      calls,
      prefix: prefix.prefix,
      paidRequests: 0,
    }) + '\n',
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      status: 'PASS',
      directory,
      selected: host.selected.asset,
      authorCalls: calls.length,
      officialAdmission: true,
      durableSubmit: true,
      repeatedSubmit: true,
      forgedRevokedDenied: true,
      modelRequests: 0,
    }),
  )
} catch (error) {
  failure = error
  console.error(error)
} finally {
  const errors = []
  for (const close of closers.reverse()) {
    try {
      await close()
    } catch (error) {
      errors.push(String(error))
    }
  }
  active = false
  try {
    await host.close()
  } catch (error) {
    errors.push(String(error))
  }
  await writeFile(
    join(directory, 'close.json'),
    JSON.stringify({ complete: !errors.length, errors }) + '\n',
  )
  if (errors.length) throw new AggregateError(errors, 'Real selected-tool assembly did not close')
}
if (failure) throw failure
