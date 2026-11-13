# @omne-harness/assets-access

[English](README.md)

`assets/v1` 的接入插件：四个设置操作的处理函数。每个处理函数凭登录与消息体里的目标租户换主体，现取租户层设置读写面，把消息体交过去，再把读写面的结果映射成同名的线上结果。设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#9-设置) 第 5、7、9 节。

## 职责与状态

本包拥有处理函数，以及读写面结果到 `assets/v1` 结果的映射。业务规则（谁能读写、修订号、锁、权限的上界）归读写面；主体归身份；协议的形状归 `@omne-harness/assets-protocol`。

已实现：贡献 `createAssetsContribution`、它要的端口与 Cordis 插件 `createAssetsAccessPlugin`。消费者：`apps/harness-server` 的 `assets-access` 行。秘密项不在这一程：读写面对它答不可读、不可写，插件照实带出。状态：候选。

## 用法

```ts
import { createAssetsAccessPlugin } from '@omne-harness/assets-access/cordis'

const plugin = createAssetsAccessPlugin({
  principals: ctx => targetTenantPrincipals(ctx),
  settings: ctx => ctx.get('tenantSettings'),
})
```

装配把插件装在注入了 `accessRegistry` 的作用域下。装上即开放 `assets/v1`，卸下即撤下。根入口给出不依赖 Cordis 的贡献，供用例与别的宿主用。

## 契约

[SPEC.md](SPEC.md) 给出步骤的次序、读写面每个结果的映射表与步骤的全化表。端口在 [src/ports.ts](src/ports.ts)，[docs/public-api.md](docs/public-api.md) 是索引。

## 设计

插件用自己的词声明两个端口，不导入领域实现。设置端口的形状就是租户层读写面的形状，装配把读写面原样交过来。每个端口在调用时现取；不在时答 `basis-unavailable`，协议不撤下。

## 配置与运行

没有配置。装配给两个函数：一个在插件的上下文上构造主体端口，一个在每次调用时从树上取读写面。

## 验证

`pnpm exec vitest run --mode fast` 用读写面的替身与主体端口的替身跑处理函数，每个成功的答复都经契约的编解码写一遍。用例经 `dist` 导入 `@omne-harness/assets-protocol`。端到端（真登录设置一项再读回）是 `apps/harness-server` 的行用例。[SPEC.md](SPEC.md#组合与验证) 把用例对到条款。

## 维护

读写面加结果或字段时，端口、映射、SPEC 的表与 `tests/operations.spec.ts` 随协议契约一起改。

## 目录与文档角色

```text
README.md, README_ZH.md   入口：用途、状态与这张地图
index.md                  本包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开用法与集成
src/                      端口、贡献与 Cordis 绑定
tests/                    持续用例；fixtures/world.ts 是读写面的替身
schema/, verification/, adr/, examples/, resources/, acceptance/   模板目录，暂空
```

每个目录有说明角色的 README.md 与导航用的 index.md。阅读路径见 [index.md](index.md)。
