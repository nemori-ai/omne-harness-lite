# @omne-harness/assets-protocol

[English](README.md)

公开协议 `assets/v1` 的协议契约：资产与规则对客户端开放的四个设置操作（列出、查看、设置、清除）。服务端的接入插件与客户端核心用同一个值。设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#9-设置) 第 7、9 节。

## 职责与状态

本包拥有 `assets/v1` 的操作表：每个操作的身份要求、效果、体上限，消息体与各结果响应体的规则。操作的业务含义归 `@omne-harness/settings` 的租户层读写面。消息的外层、固定结果与规则叶子的读写归共同契约。

已实现：契约值 `assetsProtocol` 与类型 `SettingView`、`SettingInput`。消费者：接入插件 `@omne-harness/assets-access` 与设置的界面模块。状态：候选。

## 用法

```ts
import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'

const { body } = assetsProtocol.operations['set-setting']
const read = body.read(tree, limits) // { ok: true, value } 或 { ok: false }
```

接入插件把 `assetsProtocol` 交给 `AccessContribution<AssetsProtocol>`，每个操作写一个处理函数。客户端把它交给 `createClient`。本包只有根入口，没有初始化与释放责任，不导入 Cordis。

## 契约

[SPEC.md](SPEC.md) 给出四个操作的三栏、消息体、结果集与一项的视图。精确类型来自 [src/assets-protocol.ts](src/assets-protocol.ts)，[docs/public-api.md](docs/public-api.md) 是索引。

## 设计

一个文件声明全部规则，再用 `defineProtocol` 组装。规则是 `as const` 字面量，类型由共同契约的 `RuleValue` 推出，不手写。形状逐字段对着租户层读写面。

## 配置与运行

没有配置。体上限只是名字（`small`），数字是部署配置。

## 验证

`pnpm exec vitest run --mode fast` 跑操作表、消息体与答复的往返和公开入口。用例经 `dist` 导入本包，改了 `src` 先 `pnpm run build`。[SPEC.md](SPEC.md#组合与验证) 把用例对到条款。

## 维护

租户层读写面的字段变了，同步改规则、接入插件的映射与 `tests/operations.spec.ts`。在同一个主版本里只能加操作；改已有操作的形状要新的主版本。

## 目录与文档角色

```text
README.md, README_ZH.md   入口：用途、状态与这张地图
index.md                  本包的阅读路径
SPEC.md                   公开类型以外的约定
documentation.json        文档登记
docs/                     内部设计、公开用法与集成
src/                      契约值与类型
tests/                    持续用例
schema/, verification/, adr/, examples/, resources/, acceptance/   模板目录，暂空
```

每个目录有说明角色的 README.md 与导航用的 index.md。阅读路径见 [index.md](index.md)。
