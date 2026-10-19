PACKAGE_TEMPLATE_DRAFT

# agent-contract

## 职责与状态

公共值、操作、结果、行为及可替换提供者端口。声明类型及 judgeAgentDefinition、judgeLoopExtensions 已有实现；运行接口仍是候选。

## 使用

```ts
import { judgeAgentDefinition } from '@omne-harness/agent-contract'
const result = await judgeAgentDefinition(raw)
```

raw 是调用方取得的未知声明数据。边界限额和拒绝分类见 [声明判断](SPEC.md#声明判断)。

## 契约

[SPEC](SPEC.md) 拥有行为，公开形状与现有导出见 [入口设计](docs/public-api/README.md)。

## 设计

[架构](docs/architecture.md) 拥有机制和依赖理由，其他主题从 [文档索引](docs/index.md) 进入。

## 配置与运行

不把业务身份放入配置。本包不依赖 Cordis 或具体宿主。

## 验证

`pnpm test` 与 `pnpm typecheck` 验证声明判断及实际包入口。运行候选的验证义务尚未兑现。

## 维护

修改公开承诺同步真实消费者、SPEC 和验证；实现机制不反向改变契约。组内责任见 [组入口](../README.md)。

## 目录结构与文档职责

完整骨架沿源码包模板；六个主题及其子页见 [docs](docs/README.md)。源码、测试、schema、verification、adr、examples、resources 与 acceptance 各有索引。空资源目录保留草稿说明，不授予模板采用或业务接受。
