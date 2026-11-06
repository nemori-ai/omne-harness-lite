# @omne-harness/tokenizer-tiktoken

[English](README.md)

## 职责与状态

本包在有界 worker 池中执行精确 tiktoken 计数。宿主提供固定家族资源和明确的 limits，家族计量器取得私有租约。本包不收录厂商词表，不判断请求权限，也不拥有完整输入预算。

| 能力                                    | 验证                                 |
| --------------------------------------- | ------------------------------------ |
| 异步 executor、私有租约与物理关闭       | 真实 worker 与受控生命周期故障       |
| 资源身份、Unicode、相邻文本与特殊 token | js-tiktoken 1.0.21、o200k 与合成词表 |
| 有界租约缓存中的精确 regex 片段复用     | 缓存隔离、淘汰与固定 oracle 差分     |
| 构建后的 worker 在外部进程与目录中运行  | 发布产物与有界回归测试               |

应用负载、家族集成和本地预发送时延目标需要独立的组合验证。本包单测不授予这些结论。

## 使用

宿主给出 `resources` 和全部 `limits` 字段。家族给出精确采用的 `definition`，controller 归租约拥有者：

```ts
import { createTiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'

const created = await createTiktokenExecutor({ resources, limits })
if ('failure' in created) throw new Error(created.failure.kind)
const executor = created.ok
try {
  const acquired = executor.acquire(definition, controller.signal)
  if ('failure' in acquired) throw new Error(acquired.failure.kind)
  try {
    const result = await acquired.ok.tokenizer.count([{ kind: 'text', text: 'hello world' }])
    if ('failure' in result) throw new Error(result.failure.kind)
    useCount(result.ok.tokens)
  } finally {
    await acquired.ok.release()
  }
} finally {
  await executor.close()
}
```

长期宿主向多个消费者借出同一 executor，只在宿主关闭时执行 close。家族只释放自身租约。Cordis 入口只暴露借用方法，见 [Cordis 集成](docs/cordis.md)。

## 契约

[SPEC](SPEC.md) 拥有资源核对、精确计数、准入限制、缓存所有权和物理清理。tokenizer 类型和共同计数规则归 [model-contract](../model-contract/SPEC.md#分词与完整请求计量)。[公开接口](docs/public-api.md) 导航源码定义。

## 设计

主线程拥有准入、截止和线程代际。worker 拥有词表解析、BPE 和私有租约缓存。租约固定在一个槽，防止每 lease 缓存上限乘以线程数。实现说明见[内部架构](docs/architecture.md)、[关键流程](docs/flows.md)和[对象模型](docs/object-model.md)。

## 配置与运行

`createTiktokenExecutor` 接受固定资源数组与明确的 limits，本包不提供默认值。限制覆盖线程、活跃租约、排队任务与字节、输入大小、缓存、截止时间、worker heap 和替换速率。

输入与缓存按保留的 UTF-16 和对象开销计费，不是 UTF-8 大小或 RSS。count 返回 Promise。取消可能先返回失败，release 仍须等待物理清理，close 须等待实际线程退出。运行需要 Node.js 24 或更高版本。

## 验证

先准备 workspace 依赖，再在本成员目录运行：

```sh
pnpm run build
pnpm run typecheck
pnpm exec vitest run --mode fast --maxWorkers=1
pnpm exec vitest run --mode slow --maxWorkers=1
```

[测试说明](tests/README.md) 列出真实依赖、故障 seam 与覆盖边界。每份 executor 测试至多创建两个 worker，不请求网络。

## 维护

升级引擎时同步资源摘要、固定版本采用、计数语义和真实家族消费者。改变限制或生命周期时同步 SPEC 与对应测试。根入口不导入 Cordis，独立 Cordis 入口拥有服务定义。Root 应用装配拥有线程关闭。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
