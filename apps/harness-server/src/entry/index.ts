// 入口对象清单（DP1-C11）。每个入口对象一个文件 `src/entry/<对象>.ts`，这里只汇总。
// 本文件由线负责人单写（L1-06）：新增入口对象时加一条导入与一项清单元素。
// 名字取定义包的键常量；受信与否由受信表（`src/s0/aa-rows.json`）决定，模块不自报。
import type { EntryObjectModule } from '../types.ts'
import { agentClock } from './agent-clock.ts'
import { identityClock } from './identity-clock.ts'
import { principalIssuer, principalVerifier, sessionPrincipals } from './principals.ts'
import { requestContextTrust } from './request-context-trust.ts'
import { sessionClock } from './session-clock.ts'
import { sessionWorkPrincipals } from './session-work-principals.ts'

export const entryObjects: readonly EntryObjectModule[] = [
  principalVerifier,
  principalIssuer,
  sessionPrincipals,
  sessionWorkPrincipals,
  requestContextTrust,
  sessionClock,
  agentClock,
  identityClock,
]
