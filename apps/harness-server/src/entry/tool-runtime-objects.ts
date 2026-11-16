// `toolClock` 与 Tool 运行时组的 bundle 必须是同一个时钟实例：时钟铸的令牌只有铸它的实例认得，
// 所以不能各建一份。
import type { Context } from '@deepseek-ai/cordis'
import type {
  PrincipalVerifier,
  StandingReservations,
  TenantStandingSource,
} from '@omne-harness/identity'
import {
  principalVerifierKey,
  standingReservationsKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  ToolClockService,
  ToolPublicationAuthorityService,
  toolClockKey,
  toolPublicationAuthorityKey,
  type ToolPublicationAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import { sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import { toolHitlHolder } from '../rows/tool-hitl/holder.ts'
import { toolRuntimeHolder, witnessed } from '../rows/tool-runtime/holder.ts'
import { hitlCardAudience } from './hitl-entry-principals.ts'
import { toolDecisionsIssuerOf } from './principals.ts'
import type { EntryObjectModule } from '../types.ts'

class EntryToolClock extends ToolClockService {
  readonly now: ToolClockService['now']
  readonly begin: ToolClockService['begin']
  readonly elapsed: ToolClockService['elapsed']
  readonly waitUntil: ToolClockService['waitUntil']
  constructor(ctx: Context) {
    super(ctx)
    const clock = toolRuntimeHolder(ctx).clock
    this.now = clock.now
    this.begin = clock.begin
    this.elapsed = clock.elapsed
    this.waitUntil = clock.waitUntil
  }
}

type Check = ToolPublicationAuthority<unknown>['check']

export function publicationCheck(ctx: Context): Check {
  const holder = toolRuntimeHolder(ctx)
  return request => {
    try {
      const [execution, handle] = request.publication
      if (
        !tenantCodec.encode(execution.tenant).ok ||
        execution.instance !== handle.instance ||
        execution.generation !== handle.generation ||
        !witnessed(holder, execution, request.authority, [execution.tenant, execution.call])
      )
        return fail({ kind: 'denied' })
      return succeed(undefined)
    } catch {
      return fail({ kind: 'denied' })
    }
  }
}

class EntryToolPublicationAuthority extends ToolPublicationAuthorityService<unknown> {
  readonly check: Check
  constructor(ctx: Context) {
    super(ctx)
    this.check = publicationCheck(ctx)
  }
}

export const toolClock: EntryObjectModule = {
  name: toolClockKey,
  implementation: 'real',
  install(scope, env) {
    new EntryToolClock(scope)
    const holder = toolRuntimeHolder(scope)
    holder.workPrincipals = () => {
      const work: SessionWorkPrincipals<unknown> | undefined = env
        .readTrusted(sessionWorkPrincipalsKey)
        .get(sessionWorkPrincipalsKey)
      return work
    }
    holder.verifier = () => {
      const verifier: PrincipalVerifier | undefined = env
        .readTrusted(principalVerifierKey)
        .get(principalVerifierKey)
      return verifier
    }
    holder.standing = () => {
      const standing: TenantStandingSource | undefined = env
        .readTrusted(tenantStandingKey)
        .get(tenantStandingKey)
      return standing
    }
    const hitl = toolHitlHolder(scope)
    hitl.reservations = () => {
      const reservations: StandingReservations | undefined = env
        .readTrusted(standingReservationsKey)
        .get(standingReservationsKey)
      return reservations
    }
    hitl.registrar = toolDecisionsIssuerOf(env)
    hitl.audience = hitlCardAudience
  },
}

export const toolPublicationAuthority: EntryObjectModule = {
  name: toolPublicationAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryToolPublicationAuthority(scope)
  },
}
