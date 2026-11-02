// Model 的三个权威入口对象（AA 运行时对象表「Model 与 Tool 的原事实、权威与时钟适配对象」、Model 装配设计的三个插件 inject）：
// `modelHostAuthority` 给 `model-host`，`modelPublicationAuthority` 给 `model-instances`，`modelConverterAuthority` 给
// `model-converters`，都在根上 provide。M2 的最小诚实实现：入口没有预约表与调用记录来源，所以登记核验对任何请求
// 答 `denied`（不认识即拒绝），调用解析答 `unavailable`（没有来源可查）。没有一条放行路径；E7（J19）的资格语义
// 到时替换这里的判定，不在本文件预埋。
import type { Context } from '@deepseek-ai/cordis'
import type { ModelHostAuthority } from '@omne-harness/model-contract/provider'
import {
  ModelConverterAuthorityService,
  ModelHostAuthorityService,
  ModelPublicationAuthorityService,
  modelConverterAuthorityKey,
  modelHostAuthorityKey,
  modelPublicationAuthorityKey,
  type ModelConverterAuthority,
  type ModelPublicationAuthority,
  type ModelRegistrationFailure,
} from '@omne-harness/model-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import type { EntryObjectModule } from '../types.ts'

const DENIED: ModelRegistrationFailure = Object.freeze({ kind: 'denied' })

/** 发布权威：入口没有宿主预约表，没有一次登记是它认识的。 */
export function createModelPublicationAuthority(): ModelPublicationAuthority<unknown> {
  return Object.freeze({ check: () => fail(DENIED) })
}

/** 转换器权威：入口没有转换器采用表，没有一次登记是它认识的。 */
export function createModelConverterAuthority(): ModelConverterAuthority<unknown> {
  return Object.freeze({ check: () => fail(DENIED) })
}

/** 宿主权威：入口没有调用记录来源，解析不出任何调用的驱动输入。诊断不回显调用身份。 */
export function createModelHostAuthority(): ModelHostAuthority<unknown> {
  const resolve: ModelHostAuthority<unknown>['resolve'] = () =>
    Promise.resolve(
      fail({
        kind: 'unavailable',
        dependency: modelHostAuthorityKey,
        diagnostic: 'the assembly entry has no call record source; no model call can be resolved',
      }),
    )
  return Object.freeze({ resolve })
}

class EntryModelPublicationAuthority extends ModelPublicationAuthorityService<unknown> {
  readonly check: ModelPublicationAuthority<unknown>['check']
  constructor(ctx: Context, authority: ModelPublicationAuthority<unknown>) {
    super(ctx)
    this.check = input => authority.check(input)
  }
}

class EntryModelConverterAuthority extends ModelConverterAuthorityService<unknown> {
  readonly check: ModelConverterAuthority<unknown>['check']
  constructor(ctx: Context, authority: ModelConverterAuthority<unknown>) {
    super(ctx)
    this.check = input => authority.check(input)
  }
}

class EntryModelHostAuthority extends ModelHostAuthorityService<unknown> {
  readonly resolve: ModelHostAuthority<unknown>['resolve']
  constructor(ctx: Context, authority: ModelHostAuthority<unknown>) {
    super(ctx)
    this.resolve = input => authority.resolve(input)
  }
}

export const modelPublicationAuthority: EntryObjectModule = {
  name: modelPublicationAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelPublicationAuthority(scope, createModelPublicationAuthority())
  },
}

export const modelConverterAuthority: EntryObjectModule = {
  name: modelConverterAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelConverterAuthority(scope, createModelConverterAuthority())
  },
}

export const modelHostAuthority: EntryObjectModule = {
  name: modelHostAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelHostAuthority(scope, createModelHostAuthority())
  },
}
