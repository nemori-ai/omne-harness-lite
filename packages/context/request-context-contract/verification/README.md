# Request Context 验证

## 验证责任

本目录记录本成员的验证边界。行为依据归 [SPEC](../SPEC.md)，结果与公开类型归 [src/index.ts](../src/index.ts)。

## 本包事实

公开入口与构建声明由 [导出清单测试](../tests/exports.spec.ts) 核对。纯行为由 [contract.spec.ts](../tests/contract.spec.ts) 与 [advanced.spec.ts](../tests/advanced.spec.ts) 验证。非耐久替身与好坏实现验证见 [conformance.spec.ts](../tests/conformance.spec.ts)。

[RQ-11 行到用例表](rq11.md) 区分进程内可验证结果与需要真实组合的保证。测试双声明 `durability: 'none'`。它们不证明身份服务、持久保存、断电恢复、模型发送、费用或遥测处置。

## 形式模型

[formal-mapping.md](formal-mapping.md) 记录固定请求恢复与压缩结局的性质、两个 TLA+ 模型、源码对应和机读守卫。它也记录 R2-D306 的结论：固定请求不可重放，恢复靠内容摘要比较与作废换身份。运行记录见 [formal-runs.md](formal-runs.md)，手写证明见 [proofs](proofs/README.md)。


[measurement-session-mapping.md](measurement-session-mapping.md)与[人工归纳证明](proofs/measurement-session.md)覆盖一次规划内的输入快照、精确key、有限租约复用和关闭。单次执行结果留任务tmp，没有TypeScript精化证明。

## 执行

在仓库根运行 `pnpm turbo run typecheck test --filter=@omne-harness/request-context-contract`。先构建依赖，再运行本包测试；共享导出清单工具读取构建声明。

## 未覆盖

真实来源的共同版本边界、最近一次固定请求的窗口占用生产、后台结果的原责任保管、取消与迟到的业务推进、持久性、实际规模性能及外传权限由生产实现和集成验证承担。
