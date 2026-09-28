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
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import {
  createAcceptanceApplication,
  type AcceptanceApplication,
  type TextCallRequest,
} from './bootstrap.ts'
import type { AuthenticatedActor } from './types.ts'
import { createDemoConfig, MODEL } from './deployment.ts'

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
  readonly model: string
  readonly session: string
  readonly application: AcceptanceApplication
  readonly actor: AuthenticatedActor
  readonly send: (
    text: string,
    onAccepted: TextCallRequest['onAccepted'],
  ) => ReturnType<AcceptanceApplication['startTextCall']>
  readonly history: () => Promise<readonly { role: string; text: string }[]>
  readonly close: AcceptanceApplication['close']
}

/** Production is the default; controlled TLS is available only through the existing trusted test hook. */
export async function openDemo(
  dataDirectory: string,
  credential?: Uint8Array,
  testOptions?: Partial<Parameters<typeof createAcceptanceApplication>[1]>,
): Promise<DemoConversation> {
  if (
    credential !== undefined &&
    (!credential.length ||
      [...credential].some(byte => byte < 0x20 || byte > 0x7e) ||
      !credential.some(byte => byte !== 0x20))
  )
    throw new Error('credential must be nonblank printable ASCII bytes')
  const directory = resolve(dataDirectory),
    initialized = await initialize(directory)
  let app: AcceptanceApplication | undefined
  function now(): string {
    const value = app?.currentTime()
    if (value === undefined || value === 'unavailable') throw new Error('lease clock unavailable')
    return value
  }
  const config = createDemoConfig(directory, randomUUID(), now)
  app = createAcceptanceApplication(config, {
    ...testOptions,
    stage: 'modelRequest',
    diagnostics: testOptions?.diagnostics ?? { record() {} },
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
    const session = initialized.state.session
    const prepared = await app.prepareSession(actor, session)
    if (!('session' in prepared)) throw new Error('demo session preparation rejected')
    if (initialized.fresh) {
      if (!('prepared' in (await app.prepareModelInputs(actor, session))))
        throw new Error('demo input preparation rejected')
      const selected = await app.selectModel(actor, session, MODEL)
      if (!('selected' in selected)) throw new Error('explicit demo model selection rejected')
    }
    const effective = await app.effectiveModel(actor, session)
    if (!('ok' in effective) || effective.ok.profile.routeName !== MODEL)
      throw new Error('fixed demo model or current source is unavailable')
    if (credential !== undefined) {
      const ref = parseOpaqueIdentifier(`demo-credential-${randomUUID()}`, 'CredentialRef')
      if (!isOk(ref)) throw new Error('credential reference invalid')
      const published = await app.publishCredential(actor, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref.ok,
        body: credential,
      }))
      if (!('stored' in published) || !published.stored)
        throw new Error('credential publication rejected')
    }
    if (initialized.fresh) {
      const temporary = join(directory, `demo-state-${randomUUID()}.json`)
      await writeFile(temporary, JSON.stringify({ ...initialized.state, phase: 'ready' }) + '\n', {
        flag: 'wx',
        mode: 0o600,
      })
      await rename(temporary, join(directory, 'demo-state.json'))
    }
    return {
      model: MODEL,
      session,
      application: app,
      actor,
      send(text, onAccepted) {
        const id = randomUUID()
        return app.startTextCall(actor, session, {
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          noRun: true,
          tools: [],
          callId: `call-${id}`,
          responseId: `response-${id}`,
          replyId: `reply-${id}`,
          user: {
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
          },
          ...(onAccepted === undefined ? {} : { onAccepted }),
        })
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
      close: () => app.close(),
    }
  } catch (error) {
    const closed = await app.close()
    if (!closed.complete)
      throw new Error('demo startup failed; durable responsibility remains unfinished')
    throw error
  }
}
