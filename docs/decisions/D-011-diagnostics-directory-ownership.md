---
kind: decision
id: D-011
status: accepted
scope: P1 diagnostics 目录创建、共同容量、原生排他及关闭未知的提供者责任
date: 2026-09-14
sources:
  - ../proposals/core-capabilities/implementation/observability-directory.md
acceptance: ../proposals/core-capabilities/implementation/observability-directory.md#采用与验证
supersedes:
  - id: D-010
    scope: 独立来源 factory 的目录管理方式、八文件额度解释及关闭失败重试的实现前提
change_basis:
  observation: 两个真实来源可重复借用 pending 字节及创建 slot，目录出现 3356 大于 2400 字节和 2 大于 1 来源的反例；原 close 前注入失败不证明真实数字 fd 关闭未知后可安全重试。
  causal_explanation: 每来源扫描物理文件不拥有共同 pending 和并发创建责任；数字 fd 可在真实 close 错误后被复用，不能仅凭数字认回原资源。
  reproduction: ../proposals/core-capabilities/implementation/evidence/observability-directory/README.md#产品反例原件
  verification: ../proposals/core-capabilities/implementation/evidence/provider-design-hub/README.md
---

# D-011：诊断目录的共同所有权

采用 [diagnostics 当前设计](../../packages/observation/diagnostics/design.md)的显式
目录 owner：唯一 `createLocalDiagnosticsDirectory → owner.create` 创建来源，
在实际打开文件前预留 slot，在输出前同步借记编码字节。新旧来源和 pending
共用同一目录额度；已落盘文件保留其容量，不因来源关闭而重新借出。

使用已验证的 `fs-ext@2.1.1` 在固定零字节 `.diagnostics.lock` 上取得真实 flock，
独占目录初始化和来源管理。默认额度明确为 8 个来源文件加 1 个固定锁文件，
总字节仍为 64 MiB。适用范围是合作调用者、部署控制目录及已验证的本机
Linux/ext4 环境，原生构建与产物加载仍须产品验证。

最后锁 fd 只能在所有子来源、准备与扫描永久静止且资源核对完成后关闭。
最终释放未知保留 `release_unknown`，旧 owner 永久不能恢复写入；后继 owner
依据实际 flock 判断是否取得目录。真实 raw fd 关闭结果未知不可盲重试可能被
复用的数字；重试只针对能证实仍归原 handle 的未完成责任。测试在原 close 前
注入失败的证据不能推广成一般操作系统保证。

接受依据是 `d4cd27e` 的独立只读评审、真实 R1 RED、HUB 对四个目录机制案例的
复验，以及 `327735f` 迁移后接口块和九份原证据不变的实际核对。主调度在用户
授权范围内接受这项提供者修订；不是 R1 产品 GREEN，也不证明完整关闭/恢复。

本决定仅取代元数据所列的 D-010 实现前提。Pino/Sonic/OTel 选型、被动记录面、
短门外输出及业务审计边界继续沿 D-010；OB/CD/DR/CC v1 不变。
原实施者移除旧独立来源 factory，完成目录竞争、失败资源身份、真实 flock、
关闭及独立 tarball 验证后，才开放 JSONL/admission 消费。根锁和原生构建归
整合者，应用只持目录管理面并注入受限记录面。

本会话只推进 [最小运行基线](../proposals/core-capabilities/implementation/runtime-baseline.md)
所需共享设施。完整查询/导出、自动保留与模型链路留待后续安排。
