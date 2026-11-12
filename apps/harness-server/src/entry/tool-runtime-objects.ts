// Tool 运行时组的两个入口对象（B 段，装配页「运行时对象」表「Model 与 Tool 的原事实、权威与时钟适配对象」）：
// - `toolClock`：`createLocalToolClock` 构成，与 Tool 运行时组的 bundle 用同一个实例（按本次运行的根共享，
//   见 `rows/tool-runtime/holder.ts`）。时钟铸的令牌只有铸它的实例认得，所以不能各建一份。
//   安装时它还把入口自己的会话工作主体受信读口（`sessionWorkPrincipals`）交给共享状态，Tool 运行时组按调用现取，
//   在恢复与执行时为原调用的会话重签工作主体；读口缺席答 unavailable。同样交来 identity 的两个受信读口
//   `principalVerifier` 与 `tenantStanding`（R2-D203 P-9）。另交来 Ask 决策方（`rows/tool-hitl`）要的三样：
//   identity 的保留读口 `standingReservations`，只签决策方主体的窄签发，以及卡片的受众规则 `hitlCardAudience`。
//   行不因此看见受信名。
// - `toolPublicationAuthority`：实例发布的同步核验。只认这样的发布：执行的租户合法、实例与代次与句柄一致，
//   而且记录仓里确实读到过这个原调用的这次执行与这份来源证据（调用见证）。其余一律 denied。见证只在本进程内，
//   进程重启后先由记录仓读回再见证；见证不到就不发布，不默认放行。
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

/** 发布核验：执行与句柄一致，且调用见证里有这次执行与来源证据。 */
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
    // The entry reads its own trusted names per call; a root provider of the same name is not seen.
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
    // The decision owner of the Ask waits (`rows/tool-hitl`): Identity's reservations, which the HITL
    // writes reserve through, and the principal that registers the waits of a tenant.
    const hitl = toolHitlHolder(scope)
    hitl.reservations = () => {
      const reservations: StandingReservations | undefined = env
        .readTrusted(standingReservationsKey)
        .get(standingReservationsKey)
      return reservations
    }
    hitl.registrar = toolDecisionsIssuerOf(env)
    // 卡片的读者与答复者：该租户的入口主体（protocol「公开入口与受众」）。
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
