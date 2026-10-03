# 回路传感器的金丝雀夹具

`repo/` 是一个最小的假仓库布局，每个传感器各种了一处已知违规；`tests/loop-canary.spec.ts`
把它拷进临时目录、建成 git 仓库、造出要 git 历史的那几项，再走与 `make loop-status STRICT=1`
相同的入口，逐项断言每个传感器都报出了种下的那一处。

| 传感器 | 种下的违规 | 在哪 |
| ---------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| 方向（硬线） | core 依赖了 infra | `packages/core/a/src/index.ts` 导入 `@omne-harness-lite/b` |
| 环（硬线） | 同组两个成员互相依赖 | `packages/session/p` ⇄ `packages/session/q` |
| 装配意图对照 | 插件 inject 未声明的 canaryUndeclared，provides 已声明 | `packages/core/a/src/plugin.ts` 与对应 realization bindings |
| 稳定依赖不稳定 | 被三个成员依赖的 m 依赖了不稳定的 n | `packages/model/m` → `packages/model/n` |
| 重复代码 | 两个成员里同一段函数 | `packages/model/m/src/copy.ts` 与 `packages/model/n/src/copy.ts` |
| 没有断言的测试 | 一条只调用不断言的用例 | `packages/core/a/tests/a.spec.ts`「不断言」 |
| 超 alert 的函数 | 十四个分支的函数，基线之后加入 | 测试里写入 `apps/cli/src/route.ts` |
| 新增跨成员依赖 | 基线之后 apps/cli 新依赖 core/a | 测试里写入 `apps/cli/src/extra.ts` |
| 一起改却分属两组 | core/a 与 infra/b 连着一起改四次 | 测试里造提交 |
| topic rev 翻动 | 一个 topic 两周内升了三次 rev | `.meta_harness/design/product/PF-001-canary/README.md`，测试里造提交 |
| 并行工作树 | 两棵工作树同时改 model/m | 测试里建工作树 |

假仓库里的 TypeScript 文件以 `.ts.txt` 存放，拷进临时目录时去掉 `.txt`：这样本包的类型检查、
vitest、格式检查都不把它们当本包的源码与用例。度量与回路状态只看仓库根的 `packages/`、`apps/`、
`examples/` 、`.meta_harness/design/product` 与配置指定的 realization 节点区，不会扫到这里。

`repository.ts` 是读 git 的测试共用的临时仓库工具，不属于假仓库。
