# @omne-harness/identity-protocol

[English](README.md)

公开协议 `identity/v1` 的协议契约：客户端能调的 33 个身份操作，每个操作的消息体、可能的结果与各结果的体。纯数据，服务端的接入插件与客户端核心用同一个值。设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 7 节「协议怎样划分」。

## 职责与状态

本包拥有 `identity/v1` 的契约：操作清单、每个操作的身份要求、效果、消息体上限、消息体与结果。操作的业务含义归[身份规格](../identity/SPEC.md)。

已实现：契约本身，33 个操作，没有观察。规则文本从公开契约成员复制而来；公开契约里的旧家族 `governance-public/1` 仍在用，由接入插件那一程删除。现在还没有消费者：接入插件 `identity-access` 与客户端都还没建。

## 使用

```ts
import { identityProtocol } from '@omne-harness/identity-protocol'

const { body } = identityProtocol.operations['issue-login']
const read = body.read(jsonValue, limits) // { ok: true, value: { loginIdentifier, credential } } 或 { ok: false }
```

接入插件把 `identityProtocol` 交给 `defineAccessPlugin`，每个操作写一个处理函数；客户端把它交给 `createClient`，每个操作得到一个方法。本包不依赖 Cordis，不需要初始化与释放。

## 契约

- 操作清单、三栏、结果、和旧家族的三处差别：见 [SPEC.md](SPEC.md)。
- 公开定义的导航：[docs/public-api.md](docs/public-api.md)。

## 设计

`src/rules.ts` 放每个操作的规则文本（消息体、成功体、`no-change` 体、`need-decision` 体）；`src/identity-protocol.ts` 用 `defineProtocol` 把它们写成契约。

## 配置与运行

本包没有配置。消息体上限的名字是 `small`，数值是部署配置。

## 验证

在成员目录跑 `pnpm exec vitest run --mode fast`（全表、形状、读写等价、结果集合）与 `--mode slow`（浏览器夹具）。覆盖的义务见 [SPEC.md](SPEC.md#组合与验证)。

## 维护

改契约前先看[公开契约规格](../../access/public-contract/SPEC.md#共同契约)。契约成员登记在 [`docs/engineering/delivery-lines.json`](../../../docs/engineering/delivery-lines.json)，公开面改动要重写 `api/` 下的快照（`pnpm run contract:api --write`）。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
src/                      契约与规则文本
tests/                    持续测试；fixtures/browser 是浏览器夹具
```

其余模板目录（`schema/`、`verification/`、`adr/`、`examples/`、`resources/`、`acceptance/`）现在没有内容。
