// MCP 限界上下文：识别与资格关口（领域服务）。
// 「每个操作先经 AdoptionView 核采用，再经 UseEligibility 核资格」不靠纪律，靠类型：
// 读口、调用口、状态口里要动连接或清单的内部函数只收 AdmittedEndpoint，
// 而 AdmittedEndpoint 只能由 admit() 产出（能力令牌）。cancel 与 cancelTask 不经关口。

import { fail, succeed, type Access, type Outcome } from '../shared.ts'
import type { Refusal } from './outcomes.ts'
import type { AdoptedEndpoint, AdoptionView, UseEligibility } from './ports.ts'
import type { EndpointRef } from './values.ts'

declare const admitted: unique symbol
export type AdmittedEndpoint = AdoptedEndpoint & { readonly [admitted]: true }

export async function admit<P, S>(
  ports: Readonly<{ adoption: AdoptionView<P, S>; eligibility: UseEligibility<P> }>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, Refusal>> {
  const adopted = await ports.adoption.endpoint(access, ref)
  if ('failure' in adopted) return fail({ kind: 'unknown' })
  // 未采用时不再问 UseEligibility：未采用、无权、不存在对任一主体不可区分。
  if (adopted.ok === undefined) return fail({ kind: 'not-available-to-you' })
  const verdict = await ports.eligibility.check(access, ref)
  switch (verdict.kind) {
    case 'granted':
      return succeed(adopted.ok as AdmittedEndpoint) // 唯一授予处
    case 'unknown':
      return fail({ kind: 'unknown' })
    case 'refused':
      return verdict.reason === 'not-eligible'
        ? fail({ kind: 'not-available-to-you' })
        : fail({ kind: 'blocked', reason: verdict.reason })
  }
}
