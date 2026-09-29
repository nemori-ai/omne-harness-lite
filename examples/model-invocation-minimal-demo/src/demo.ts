import { randomBytes, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, lstat, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  generateHandoffKeyPair,
  isOk,
  parseOpaqueIdentifier,
} from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  ExactDecimal,
  summarizeUsage,
  type Summary,
  type UsageSummary,
} from '@omne-harness-lite/call-accounts'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { decodeModelLogKey, type TokenMargin } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication, type AcceptanceApplication } from './bootstrap.ts'
import {
  DemoDiagnosticStartupFailure,
  openDemoDiagnosticAssembly,
  type DemoDiagnosticAssembly,
  type DemoDiagnosticConfig,
} from './diagnostic-assembly.ts'
import { createDemoCallHost } from './model-call-host.ts'
import type { AuthenticatedActor } from './types.ts'
import { createDemoConfig, MODEL } from './deployment.ts'
import type { RetirementPolicy } from '@omne-harness-lite/pi-ai-transport'
import type { ProcessOwnership } from '@omne-harness-lite/session-log-jsonl'
import type { TenantId } from '@omne-harness-lite/identity-values'
import { systemTimeSources } from '@omne-harness-lite/clock'

interface LocalState {
  readonly version: 1
  readonly phase: 'created' | 'ready'
  readonly identifier: string
  readonly password: string
  readonly session: string
}
function localState(value: unknown): value is LocalState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'phase' in value &&
    (value.phase === 'created' || value.phase === 'ready') &&
    'identifier' in value &&
    typeof value.identifier === 'string' &&
    value.identifier.length > 0 &&
    'password' in value &&
    typeof value.password === 'string' &&
    value.password.length >= 8 &&
    'session' in value &&
    typeof value.session === 'string' &&
    value.session.length > 0
  )
}

/** Owner-only regular file, never a symlink. The returned bytes belong to the caller. */
export async function readPrivateFile(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error('private file must be owned by the current user with mode 0600')
    return await file.readFile()
  } finally {
    await file.close()
  }
}

async function initialize(directory: string): Promise<{ state: LocalState; fresh: boolean }> {
  let fresh = false
  try {
    await mkdir(directory, { mode: 0o700 })
    fresh = true
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const stat = await lstat(directory)
  if (
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error('data directory must be an owned private directory (0700)')
  const marker = join(directory, 'demo-state.json')
  if (!fresh) {
    const bytes = await readPrivateFile(marker)
    try {
      const value: unknown = JSON.parse(bytes.toString('utf8'))
      if (!localState(value) || value.phase !== 'ready')
        throw new Error('demo setup is incomplete; no automatic replay or reset was attempted')
      return { state: value, fresh: false }
    } finally {
      bytes.fill(0)
    }
  }
  const state: LocalState = {
    version: 1,
    phase: 'created',
    identifier: `demo-${randomUUID()}`,
    password: randomBytes(32).toString('hex'),
    session: `demo-${randomUUID()}`,
  }
  // Write a marker before any providers run; a partial setup never masquerades as a fresh deployment.
  await writeFile(marker, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 })
  await mkdir(join(directory, 'session-logs'), { mode: 0o700 })
  const activation = generateHandoffKeyPair(),
    purge = generateHandoffKeyPair()
  for (const [name, bytes] of [
    ['activation-private.pem', activation.privateKeyPem],
    ['activation-public.pem', activation.publicKeyPem],
    ['purge-private.pem', purge.privateKeyPem],
    ['purge-public.pem', purge.publicKeyPem],
    ['model-key', randomBytes(32)],
  ] as const)
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 })
  return { state, fresh: true }
}

export interface DemoConversation {
  readonly session: string
  readonly identity: { readonly account: string; readonly organization: string }
  readonly application: AcceptanceApplication
  readonly actor: AuthenticatedActor
  /** Trusted local engineering read handles; no tenant-facing query endpoint is implied. */
  readonly diagnostics: Pick<DemoDiagnosticAssembly, 'local' | 'tenant' | 'transports' | 'health'>
  readonly models: () => ReturnType<AcceptanceApplication['displayList']>
  readonly currentModel: () => ReturnType<AcceptanceApplication['effectiveModel']>
  readonly selectModel: (routeName: string) => ReturnType<AcceptanceApplication['selectModel']>
  readonly send: (
    text: string,
    onDelivery: (serialized: string, signal: AbortSignal) => Promise<void>,
  ) => Promise<DemoSendResult>
  readonly stopActive: () => void
  readonly history: () => Promise<readonly { role: string; text: string }[]>
  readonly totals: () => Promise<DemoTotals>
  readonly close: () => ReturnType<DemoDiagnosticAssembly['closeAfterBusiness']>
}

export type DemoSendResult =
  | { readonly kind: 'saved'; readonly response: ModelResponse; readonly released: boolean }
  | { readonly kind: 'failed'; readonly response: ModelResponse; readonly released: boolean }
  | { readonly kind: 'refused'; readonly reason: string; readonly released: boolean }
  | { readonly kind: 'unconfirmed'; readonly released: boolean }
type DemoSendOutcome =
  | { readonly kind: 'saved' | 'failed'; readonly response: ModelResponse }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'unconfirmed' }

export class DemoStartupFailure extends Error {
  constructor(
    readonly cleanupComplete: boolean,
    readonly retryCleanup?: () => Promise<{ readonly complete: boolean }>,
  ) {
    super('demo startup unavailable')
  }
}

function refusalReason(
  sent: Awaited<ReturnType<AcceptanceApplication['startServiceCall']>>,
): string {
  const value = 'result' in sent ? sent.result : sent
  if ('undispatched' in value) return value.undispatched
  if ('released' in value) return value.released.cause
  if ('retryRefused' in value) return value.retryRefused.why
  if ('wrongPhase' in value) return `wrongPhase:${value.wrongPhase.phase}`
  if ('invalidInput' in value) return 'invalidInput'
  if ('profileNotFound' in value) return 'profileNotFound'
  if ('runtimeStopped' in value) return 'runtimeStopped'
  if ('callNotFound' in value) return 'callNotFound'
  if ('alreadyEnded' in value) return 'alreadyEnded'
  if ('unavailable' in value) return 'unavailable'
  if ('failure' in value) return value.failure
  if ('step' in value) return `provider:${value.step}`
  return 'unavailable'
}

export interface DemoTotals {
  readonly responses: number
  readonly usage: UsageSummary
  readonly cost: Summary
}
export interface DemoObserverBounds {
  readonly events: number
  readonly bytes: number
}

/** Explicit example limits; each run opens distinct local and verified-tenant owners. */
export function createDemoDiagnosticConfig(
  directory: string,
  tenant: TenantId,
  retirement: RetirementPolicy,
): DemoDiagnosticConfig {
  const instance = randomUUID()
  return {
    local: { rootDir: join(directory, 'diagnostics', 'local'), collectorId: `local-${instance}` },
    tenant: {
      rootDir: join(directory, 'diagnostics', 'tenant'),
      collectorId: `tenant-${instance}`,
      tenant,
    },
    collector: {
      maxRecordBytes: 65_536,
      maxFieldBytes: 4_096,
      queueMaxRecords: 256,
      queueMaxBytes: 1_048_576,
      segmentMaxBytes: 1_048_576,
      retainedMaxBytes: 16_777_216,
      retainedMaxSegments: 16,
      retentionMs: 604_800_000,
      queryMaxRecords: 128,
      queryMaxBytes: 1_048_576,
      queryScanMaxBytes: 1_048_576,
      queryConcurrency: 2,
      queryMaxDurationMs: 5_000,
      exportMaxRecords: 128,
      exportMaxBytes: 1_048_576,
      closeWaitMs: 5_000,
      stderrMaxReports: 2,
      // Engineering readers outlive the application's leased business Clock.
      wallClock: () => new Date(systemTimeSources.wall()),
      monotonicClock: () => Number(process.hrtime.bigint() / 1_000_000n),
      schedule(milliseconds, callback) {
        const timer = setTimeout(callback, milliseconds)
        return { cancel: () => clearTimeout(timer) }
      },
    },
    transportRetainedInstancesMax: 4,
    transportRetirement: retirement,
  }
}

/** Verify the parent shared by the two journal roots before either writer starts. */
export async function ensureDemoDiagnosticParent(directory: string): Promise<void> {
  const parent = join(directory, 'diagnostics')
  try {
    await mkdir(parent, { mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const stat = await lstat(parent)
  if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.())
    throw new Error('diagnostic parent must be an owned private directory (0700)')
}

const defaultObserverBounds: DemoObserverBounds = Object.freeze({ events: 256, bytes: 262_144 })

/** Production is the default; controlled TLS is available only through the existing trusted test hook. */
export async function openDemo(
  dataDirectory: string,
  tokenMargin: TokenMargin,
  retirement: RetirementPolicy,
  maxOutputTokens: number,
  credential?: Uint8Array,
  testOptions?: Partial<Parameters<typeof createAcceptanceApplication>[1]>,
  observerBounds: DemoObserverBounds = defaultObserverBounds,
  host?: {
    readonly processOwnership: ProcessOwnership
    readonly covered: boolean
    /** A worker-local provider read only after old durable work is reconciled. */
    readonly readCredential?: () => Promise<Uint8Array | undefined>
  },
): Promise<DemoConversation> {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)
    throw new Error('max output tokens must be a positive safe integer')
  if (
    !Number.isSafeInteger(observerBounds.events) ||
    observerBounds.events <= 0 ||
    !Number.isSafeInteger(observerBounds.bytes) ||
    observerBounds.bytes <= 0
  )
    throw new Error('observer buffer bounds must be explicit positive safe integers')
  if (
    credential !== undefined &&
    (!credential.length ||
      [...credential].some(byte => byte < 0x20 || byte > 0x7e) ||
      !credential.some(byte => byte !== 0x20))
  )
    throw new Error('credential must be nonblank printable ASCII bytes')
  if (credential !== undefined && host?.readCredential !== undefined)
    throw new Error('choose one credential source')
  const directory = resolve(dataDirectory),
    initialized = await initialize(directory)
  let app: AcceptanceApplication | undefined
  let diagnosticAssembly: DemoDiagnosticAssembly | undefined
  function now(): string {
    const value = app?.currentTime()
    if (value === undefined || value === 'unavailable') throw new Error('lease clock unavailable')
    return value
  }
  const config = createDemoConfig(
    directory,
    randomUUID(),
    now,
    tokenMargin,
    retirement,
    host?.processOwnership,
  )
  app = createAcceptanceApplication(config, {
    ...testOptions,
    stage: 'modelRequest',
    diagnostics: testOptions?.diagnostics ?? { record() {} },
    coldRecovery: { covered: host?.covered ?? initialized.fresh },
  })
  try {
    await app.ready
    if (
      initialized.fresh &&
      (await app.register(initialized.state.identifier, initialized.state.password)) !==
        'registered'
    )
      throw new Error('local demo account registration rejected; setup remains incomplete')
    const actor = await app.authenticate(initialized.state.identifier, initialized.state.password)
    if (!('account' in actor)) throw new Error('demo authentication rejected')
    await ensureDemoDiagnosticParent(directory)
    diagnosticAssembly = await openDemoDiagnosticAssembly(
      createDemoDiagnosticConfig(directory, actor.tenant, retirement),
    )
    const activated = await app.activateModelRequest(
      actor,
      diagnosticAssembly,
      diagnosticAssembly.transports,
    )
    if (!('activated' in activated)) throw new Error('demo model stage unavailable')
    const openedDiagnostics = diagnosticAssembly
    const session = initialized.state.session
    if (!initialized.fresh) {
      const existing = await app.readSessionLog(actor, session)
      if (!('entries' in existing)) throw new Error('demo session ownership or log unavailable')
    }
    const prepared = await app.prepareSession(actor, session)
    if (!('session' in prepared)) throw new Error('demo session preparation rejected')
    const reconciled = await app.reconcileModelRuntime(actor, session)
    if (!('calls' in reconciled))
      throw new Error('demo recovery unavailable; no new request admitted')
    const bound = await app.bindModelRuntime(actor, session)
    if (!('service' in bound)) throw new Error('demo model runtime unavailable')
    if (initialized.fresh) {
      if (!('prepared' in (await app.prepareModelInputs(actor, session))))
        throw new Error('demo input preparation rejected')
      const selected = await app.selectModel(actor, session, MODEL)
      if (!('selected' in selected)) throw new Error('explicit demo model selection rejected')
    }
    const effective = await app.effectiveModel(actor, session)
    if (!('effectiveModel' in effective))
      throw new Error('demo selected model or current source is unavailable')
    const loadedCredential = await host?.readCredential?.()
    try {
      const suppliedCredential = loadedCredential ?? credential
      if (
        suppliedCredential !== undefined &&
        (!suppliedCredential.length ||
          [...suppliedCredential].some(byte => byte < 0x20 || byte > 0x7e) ||
          !suppliedCredential.some(byte => byte !== 0x20))
      )
        throw new Error('credential must be nonblank printable ASCII bytes')
      if (suppliedCredential !== undefined) {
        const ref = parseOpaqueIdentifier(`demo-credential-${randomUUID()}`, 'CredentialRef')
        if (!isOk(ref)) throw new Error('credential reference invalid')
        const published = await app.publishCredential(actor, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref.ok,
          body: suppliedCredential,
        }))
        if (!('stored' in published) || !published.stored)
          throw new Error('credential publication rejected')
      }
    } finally {
      loadedCredential?.fill(0)
    }
    if (initialized.fresh) {
      const temporary = join(directory, `demo-state-${randomUUID()}.json`)
      await writeFile(temporary, JSON.stringify({ ...initialized.state, phase: 'ready' }) + '\n', {
        flag: 'wx',
        mode: 0o600,
      })
      await rename(temporary, join(directory, 'demo-state.json'))
    }
    let activeHost: ReturnType<typeof createDemoCallHost> | undefined
    let stopped = false
    return {
      session,
      identity: { account: actor.account, organization: actor.tenant.organization },
      application: app,
      actor,
      diagnostics: openedDiagnostics,
      models: () => app.displayList(actor, session),
      currentModel: () => app.effectiveModel(actor, session),
      selectModel: routeName => app.selectModel(actor, session, routeName),
      async send(text, onDelivery) {
        if (stopped) return { kind: 'refused', reason: 'runtimeStopped', released: true }
        const id = randomUUID()
        const host = createDemoCallHost()
        activeHost = host
        let grant:
          | Extract<
              Awaited<ReturnType<typeof app.openModelObserver>>,
              { readonly endpoint: object }
            >
          | undefined
        let result: DemoSendOutcome = { kind: 'refused', reason: 'unavailable' }
        try {
          const attached = await app.attachModelCallHost(actor, session, host)
          if (!('attached' in attached)) {
            const stopped = await host.stop()
            if (activeHost === host) activeHost = undefined
            return {
              kind: 'refused',
              reason: 'failure' in attached ? attached.failure : 'unavailable',
              released: 'released' in stopped,
            }
          }
          const opened = await app.openModelObserver(actor, session, undefined, onDelivery)
          const parsedSession = parseOpaqueIdentifier(session, 'SessionRef')
          const user = judgeMessage({
            type: 'user',
            id: `user-${id}`,
            createdAt: now(),
            blocks: [
              {
                id: `text-${id}`,
                kind: 'text',
                text,
                visibility: { toHuman: true, toModel: true },
              },
            ],
          })
          if (
            'endpoint' in opened &&
            isOk(parsedSession) &&
            'ok' in user &&
            user.ok.type === 'user'
          ) {
            grant = opened
            const sent = await app.startServiceCall(actor, session, {
              parameters: { reasoningEffort: 'low', maxOutputTokens },
              host: host.host,
              observer: {
                session: parsedSession.ok,
                endpoint: grant.endpoint,
                observer_max_buffered_events: observerBounds.events,
                observer_max_buffered_bytes: observerBounds.bytes,
              },
              user: user.ok,
            })
            if ('result' in sent && 'replyPending' in sent.result) {
              const settled = await app.persistModelReply(actor, session, sent.result.replyPending)
              const response = 'settled' in settled ? settled.settled.response.response : null
              if (response === null || !('ok' in judgeModelResponse(response)))
                result = { kind: 'unconfirmed' }
              else result = { kind: 'saved', response: response as unknown as ModelResponse }
            } else if ('result' in sent && 'settled' in sent.result) {
              result = { kind: 'failed', response: sent.result.settled }
            } else result = { kind: 'refused', reason: refusalReason(sent) }
          } else result = { kind: 'refused', reason: 'observerUnavailable' }
        } catch {
          result = { kind: 'unconfirmed' }
        }
        const stopResult = await host.stop()
        const revoked = await grant?.revoke()
        if (activeHost === host) activeHost = undefined
        const released =
          'released' in stopResult && (revoked === undefined || 'released' in revoked)
        return 'response' in result
          ? { kind: result.kind, response: result.response, released }
          : result.kind === 'refused'
            ? { kind: 'refused', reason: result.reason, released }
            : { kind: 'unconfirmed', released }
      },
      stopActive() {
        stopped = true
        const host = activeHost
        if (host !== undefined) void host.stop().catch(() => undefined)
      },
      async history() {
        const read = await app.readSessionLog(actor, session)
        if (!('entries' in read)) throw new Error('durable history unavailable')
        const history: { role: string; text: string }[] = []
        for (const entry of read.entries) {
          const isMessage = entry.readKeys.some(key => {
            const decoded = decodeModelLogKey(key)
            return 'ok' in decoded && decoded.ok.kind === 'messages'
          })
          if (!isMessage) continue
          // Whole-pair validation is performed by the production prefix reader on each send.
          const payload: unknown = entry.payload
          if (typeof payload !== 'object' || payload === null || !('value' in payload))
            throw new Error('history value unavailable')
          const message = judgeMessage(payload.value)
          if (!('ok' in message)) throw new Error('history message unavailable')
          history.push({
            role: message.ok.type,
            text: message.ok.blocks
              .map(block => (block.kind === 'text' && block.visibility.toHuman ? block.text : ''))
              .join(''),
          })
        }
        return history
      },
      async totals() {
        const read = await app.readSessionLog(actor, session)
        if (!('entries' in read)) throw new Error('durable response history unavailable')
        const responses: ModelResponse[] = []
        for (const entry of read.entries) {
          const responseKeys = entry.readKeys.flatMap(key => {
            const decoded = decodeModelLogKey(key)
            return 'ok' in decoded && decoded.ok.kind === 'response' ? [decoded.ok.response] : []
          })
          if (!responseKeys.length) continue
          if (responseKeys.length !== 1) throw new Error('response identity ambiguous')
          const payload: unknown = entry.payload
          if (typeof payload !== 'object' || payload === null || !('value' in payload))
            throw new Error('durable response value unavailable')
          if (!('ok' in judgeModelResponse(payload.value)))
            throw new Error('durable response invalid')
          // The public judge validated the complete MR5 value before narrowing.
          const response = payload.value as ModelResponse
          if (response.id !== responseKeys[0]) throw new Error('durable response key mismatch')
          responses.push(response)
        }
        const usage = summarizeUsage(
          responses.map(response => ({ responseId: response.id, usage: response.usage })),
        )
        if ('rejected' in usage || 'failed' in usage)
          throw new Error('durable usage summary unavailable')
        let knownSum = ExactDecimal.from(0),
          unknownCount = 0
        for (const response of responses) {
          if (response.cost.cost_usd === 'unknown') unknownCount++
          else knownSum = knownSum.add(ExactDecimal.from(response.cost.cost_usd))
        }
        return { responses: responses.length, usage, cost: { knownSum, unknownCount } }
      },
      close: () => openedDiagnostics.closeAfterBusiness(() => app.close()),
    }
  } catch (error) {
    const closed = diagnosticAssembly
      ? await diagnosticAssembly.closeAfterBusiness(() => app.close())
      : await app.close()
    if (!closed.complete)
      throw new DemoStartupFailure(false, async () => {
        const business = diagnosticAssembly
          ? await diagnosticAssembly.closeAfterBusiness(() => app.close())
          : await app.close()
        const partial =
          error instanceof DemoDiagnosticStartupFailure
            ? await error.retryCleanup()
            : { complete: true }
        return { complete: business.complete && partial.complete }
      })
    throw error
  }
}
