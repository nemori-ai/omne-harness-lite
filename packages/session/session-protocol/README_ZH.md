# @omne-harness/session-protocol

[English](README.md)

公开协议 `session/v1` 的协议契约：会话向客户端开放的七个操作和一个观察。服务端的接入插件和客户端核心用同一个值，一边得到处理函数的类型，一边得到每个操作一个方法。设计源是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#协议怎样划分)。

## 职责与状态

本包拥有 `session/v1` 的操作清单、每个操作的身份要求、效果、体上限、消息体与结果体的规则，以及观察 `observe-session` 的建立点、帧与结束原因。操作的业务含义归会话领域；消息外层、固定结果和规则叶子的转换归共同契约。

已实现：契约值 `sessionProtocol` 与类型。还没有真实消费者：接入插件 `session-access`、客户端核心对它的使用、会话观察的帧来源都在后面的程里做。状态：候选。

## 使用

```ts
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'

const { body } = sessionProtocol.operations['send-input']
const read = body.read(tree, limits) // { ok: true, value } 或 { ok: false }
```

接入插件把 `sessionProtocol` 交给 `AccessContribution<SessionProtocol>`，每个操作写一个处理函数，`observe-session` 写一个帧来源。客户端把它交给 `createClient`。本包只有根入口，没有初始化与释放责任，不导入 Cordis。

## 契约

七个操作的三栏、和旧家族 `session-public/1` 的四处差别、结果的体与观察的帧见 [SPEC.md](SPEC.md)。精确类型由 [src/session-protocol.ts](src/session-protocol.ts) 推出，导航在 [docs/public-api.md](docs/public-api.md)。

## 设计

一个文件声明全部规则，再用 `defineProtocol` 组装。规则写成 `as const` 字面量，类型由共同契约的 `RuleValue` 推出，不另写手工类型。规则文本从共同契约的 `session-rules.ts` 复制而来，见 [SPEC.md](SPEC.md#rule-texts)。

## 配置与运行

没有配置。体上限只写名字（`small`、`input`），数值是部署配置。

## 验证

`pnpm exec vitest run --mode fast`：操作表、类型断言、新旧读写等价、观察的帧。`--mode slow` 另跑浏览器夹具。每个用例对应的条款见 [SPEC.md](SPEC.md#组合与验证)。

## 维护

会话一个操作的形状变了，同步规则、`tests/wire.spec.ts` 的样本与 `tests/shapes.spec-d.ts` 的断言。共同契约里旧家族的规则删除之后，`tests/wire.spec.ts` 与 `tests/shapes.spec-d.ts` 的对照改成对照本包自己的样本。加操作在同一个主版本里加；改既有操作的形状要升主版本。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   类型以外的约定
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
src/                      契约值与推出的类型
tests/                    持续测试；fixtures/browser 是浏览器夹具
schema/、verification/、adr/、examples/、resources/、acceptance/   模板目录，现无内容
```

每个目录有说明职责的 README.md 与导航用的 index.md，阅读路径见 [index.md](index.md)。
