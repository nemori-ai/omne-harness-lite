# @omne-harness-lite/model-profile

[English](README.md)

提供模型档案数据、精确范围引用与请求参数校验。描述路由、供应商与模态限制，不绑定凭据或模型客户端。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                    | 用途                               |
| --------------------------- | ---------------------------------- |
| `judgeModelProfileDocument` | 判定档案、建档内容、引用与参数     |
| `refMatches`                | 将引用与显式传入的一行及其范围比较 |
| `parameterNames`            | 列出统一参数名与 `extra` 中的键    |
| `ModelProfileSnapshot`      | 描述请求写入方捕获的档案事实       |
| `InputLimitFact`            | 区分未知、无限与有限的上游限制事实 |
| `UpstreamInputLimits`       | 记录所有适用指标的上游事实         |
| `InputConstraints`         | 声明本档案的项目有限输入上限       |
| `validate`                  | 校验公开 Schema 定义项             |

## 判定档案及其输出上限

完整判定器会检查单靠 Schema 形状无法保证的关系。

```ts
import {
  judgeModelProfileDocument,
  validate,
  parameterNames,
  type ModelProfile,
} from '@omne-harness-lite/model-profile'

const profile: ModelProfile = {
  routeName: 'vendor/chat',
  adaptation: {
    implementation: { name: 'example-family', revision: 'r1' },
    definition: { modelId: 'vendor/chat', revision: 'd1' },
    configuration: { revision: 'c1', values: {} },
  },
  origin: 'official',
  providers: ['provider-a'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 32000,
  maxOutputTokens: 8192,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  parameters: { maxOutputTokens: 4096, extra: { top_k: 40 } },
  registration: 'listed',
  updatedAt: '2026-09-26T10:00:00Z',
}
console.log(judgeModelProfileDocument('ModelProfile', profile)) // { ok: true }
if (profile.parameters === undefined) throw new Error('Parameters required')
console.log(parameterNames(profile.parameters)) // ['maxOutputTokens', 'top_k']
const oversized = { ...profile, parameters: { maxOutputTokens: 8193 } }
console.log(validate('ModelProfile', oversized).valid) // true
console.log(judgeModelProfileDocument('ModelProfile', oversized))
// { rejected: 'max_output_exceeds_profile' }
```

## 在精确范围内匹配自建引用

档案行没有 scope 字段；目录通过独立参数交出该行的范围。撤回状态不改变身份匹配。

```ts
import { parseScopeLayerIdentity, unwrap } from '@omne-harness-lite/identity-values'
import {
  refMatches,
  type ModelProfile,
  type ModelProfileRef,
} from '@omne-harness-lite/model-profile'

const alice = unwrap(
  parseScopeLayerIdentity({
    layer: 'tenant',
    tenant: { organization: 'org_acme', account: 'acc_alice' },
  }),
)
const bob = unwrap(
  parseScopeLayerIdentity({
    layer: 'tenant',
    tenant: { organization: 'org_acme', account: 'acc_bob' },
  }),
)
const profile: ModelProfile = {
  routeName: 'vendor/chat',
  adaptation: {
    implementation: { name: 'example-family', revision: 'r1' },
    definition: { modelId: 'vendor/chat', revision: 'd1' },
    configuration: { revision: 'c1', values: {} },
  },
  origin: 'custom',
  providers: ['provider-a'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 32000,
  maxOutputTokens: 8192,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  registration: 'withdrawn',
  updatedAt: '2026-09-26T10:00:00Z',
}
const ref: ModelProfileRef = { origin: 'custom', routeName: 'vendor/chat', scope: alice }
console.log(refMatches(ref, profile, alice)) // true
console.log(refMatches(ref, profile, bob)) // false
```

## 失败与边界

`judgeModelProfileDocument` 判定四类文档：`ModelProfile`、`ModelProfileContent`、`ModelProfileRef`、`ModelRequestParameters`。它按固定次序返回一个 `{ rejected }`，先检查形状不完整的情况。`validate` 检查 Schema 形状；`max_output_exceeds_profile` 等跨字段关系需要完整判定器。`ModelProfileSnapshot` 有类型与 Schema 入口，但没有文档判定入口。

引用精确比较来源、路由名；自建档案还比较显式传入的范围。名字区分大小写，不做 Unicode 规范化。不匹配只是对给定行的布尔答案，不是目录查找失败；匹配也不检查在册状态或授权。

数值字段接收 `JsonNumber`，包括 `LosslessNumber`；判定比较原表示的精确数值。缺席的请求参数不会被补上。本包不存储档案、不创建快照、不保证名字唯一、不管理凭据、不发送 OpenRouter 请求；请求路由与生命周期由消费者负责。

JSON Schema 通过 `@omne-harness-lite/model-profile/schema` 公开。参见[源码导出](src/index.ts)、[测试](tests/)与[模型响应](../model-response/README_ZH.md)。

默认入口与 Schema 采用 `data.model-profile/v4`；现有 `./v2` 与 `./schema/v2` 入口继续服务当前消费者；v4 输入必须提供全部必填事实。v4 必须明确填写上游输入 token 与完整请求体字节的事实；支持图片的档案即使本次只发文本，也必须提供项目 `maxImageBytes` 有限上限以及上游 `maxImageBytes`、`maxImages` 事实。上游为 `unknown` 或 `unbounded` 时，项目上限仍须有限。

```ts
const imageProfile: ModelProfile = {
  ...profile,
  inputModalities: ['text', 'image'],
  inputConstraints: { maxImageBytes: 4_000_000, maxImages: 4 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'limited', value: 8_000_000 },
    maxImages: { status: 'unknown' },
  },
}
console.log(judgeModelProfileDocument('ModelProfile', imageProfile)) // { ok: true }
```

`validate` 只检查 Schema 形状；完整判定还会对项目上限与已知有限上游事实逐项做精确比较。`ModelProfileSnapshot` 的类型与 Schema 保留两个输入限制对象，实际复制和历史保存由请求写入方负责。具体边界以已接受设计为准。
