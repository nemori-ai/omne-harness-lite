// 会话工作主体 `sessionWorkPrincipals`（AA 运行时对象表、session-contract `SessionWorkPrincipals`、D-AUTH r4 4.1）。
// 每次 `forSession` 都经入口自己的受信上下文现读 `session-storage` 提供的归属读口 `sessionPrincipalBindings`：
// 读口缺席、`not-bound`、绑定指向别的租户或会话、读失败或签发失败，都不签发。签发经 `principals.ts` 的窄视图，
// 本模块拿不到签发者。受信与否由受信表决定：`sessionWorkPrincipals` 只有 `session-provider` 行看得见。
import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionFailure,
  SessionPrincipalBindingSource,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'
import {
  SessionWorkPrincipalsService,
  sessionPrincipalBindingsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { sessionWorkIssuerOf, type SessionWorkIssue } from './principals.ts'

type Unavailable = Extract<SessionFailure, { kind: 'unavailable' }>
type WorkFailure = Extract<SessionFailure, { kind: 'denied' | 'unavailable' | 'quarantined' }>
type ForSession = SessionWorkPrincipals<Principal>['forSession']
type ForSessionInput = Parameters<ForSession>[0]
type BindingReading = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>

export type SessionWorkPrincipalsOptions = Readonly<{
  issue: SessionWorkIssue
  /** 每次调用现读受信的归属读口。没有提供者时返回 `undefined`；抛出视为读口不可达。 */
  readBindings: () => SessionPrincipalBindingSource | undefined
}>

const BINDINGS = 'sessionPrincipalBindings'
const DENIED_ACTION = 'sessionWorkPrincipals.forSession'

const unavailable = (owner: string, diagnostic: string): Unavailable => ({
  kind: 'unavailable',
  owner,
  diagnostic,
})

function readSource(
  readBindings: SessionWorkPrincipalsOptions['readBindings'],
): Outcome<SessionPrincipalBindingSource, WorkFailure> {
  let source: SessionPrincipalBindingSource | undefined
  try {
    source = readBindings()
  } catch {
    return fail(unavailable(BINDINGS, 'the session principal bindings read port is not reachable'))
  }
  if (source === undefined)
    return fail(unavailable(BINDINGS, 'the session principal bindings read port is not provided'))
  return succeed(source)
}

async function readBinding(
  source: SessionPrincipalBindingSource,
  input: ForSessionInput,
): Promise<BindingReading> {
  try {
    return await source.read({ tenant: input.tenant, session: input.session })
  } catch {
    // 异常不透传：读口的消息可能带存储正文。
    return fail(
      unavailable(
        BINDINGS,
        'the session principal bindings read threw; its message is not reported',
      ),
    )
  }
}

/** 纯组合：归属读口与签发视图都由调用方给，便于不经 Cordis 检验行为。 */
export function createSessionWorkPrincipals(
  options: SessionWorkPrincipalsOptions,
): SessionWorkPrincipals<Principal> {
  const forSession: ForSession = async input => {
    const source = readSource(options.readBindings)
    if ('failure' in source) return source
    const reading = await readBinding(source.ok, input)
    if ('failure' in reading) return reading
    const binding = reading.ok
    if (binding.kind === 'not-bound') return fail({ kind: 'denied', action: DENIED_ACTION })
    if (!tenantEquals(binding.tenant, input.tenant) || binding.session !== input.session)
      return fail({
        kind: 'quarantined',
        diagnostic: 'the session principal binding names another tenant or session',
      })
    const issued = options.issue({ tenant: input.tenant, session: input.session })
    if ('failure' in issued)
      return fail(
        unavailable(
          'identity',
          `the principal issuer refused the work principal (${issued.failure.field}: ${issued.failure.reason})`,
        ),
      )
    return succeed(issued.ok)
  }
  return Object.freeze({ forSession })
}

class EntrySessionWorkPrincipals extends SessionWorkPrincipalsService<Principal> {
  readonly forSession: ForSession
  constructor(ctx: Context, work: SessionWorkPrincipals<Principal>) {
    super(ctx)
    this.forSession = input => work.forSession(input)
  }
}

function bindingsReader(env: EntryEnv): SessionWorkPrincipalsOptions['readBindings'] {
  return () => {
    // 入口自己按名读受信名的上下文：根标签上的同名提供者读不到。
    const source: SessionPrincipalBindingSource | undefined = env
      .readTrusted(sessionPrincipalBindingsKey)
      .get(sessionPrincipalBindingsKey)
    return source
  }
}

export const sessionWorkPrincipals: EntryObjectModule = {
  name: sessionWorkPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    const work = createSessionWorkPrincipals({
      issue: sessionWorkIssuerOf(env),
      readBindings: bindingsReader(env),
    })
    new EntrySessionWorkPrincipals(scope, work)
  },
}
