# 工具定义、调用、结果与控制验证范围

ToolCall safety/progress 两项任务覆盖调用的有限状态抽象；StopProgressUnknown 已显示业务 settled 与物理 exposure 可分离。模型不证明 exposure owner/generation、同代 quiescent/isolation、RN-05 barrier、真实执行、I/O、费用、人类批准或 frames 传输符合。

正文为条款级重基候选，旧执行结果、review、publication 与实现接受不进入新 baseline。
设计树 internal gate、来源哈希和依赖映射与下述有限形式检查分别报告；候选接受、真实组合测试、
全局形式任务登记重绑和 release evidence 仍是独立门。provider 事实见本主题入口所列映射。

TL-15 联合 DR-01 验证：同一 tools stream 一次 append 内多 facts 共享 revision、eventId 的 recordIndex 各异；按 eventId 逐事实去重，按 operationId 认回提交，按 `(call,attempt)` 去重结算 arrival，三者不可互换。

## 归档静止检查记录

2026-09-16：两份配置显式允许合法 archived quiescence，新增 `QuiescenceSafe` 检查
无后继状态不遗留业务责任；核心 `ToolCall.tla` 的转移与 `SpecFair` 保持原样。
实际运行范围、工具版本、状态数与 7 个定向负例见[形式工件说明](v1/formal/README.md)。
所有正例 exit 0、所有负例由目标性质检出；不改变候选接受状态。

| 工件 / 原始证据 | SHA-256 |
| --- | --- |
| `ToolCall.tla` | `d4533fc878d287a8583b0cddaa77427b32d54ccddfde23bd1d0f118cd0d9623b` |
| `ToolCallMC.tla` | `bf2e7ed783b04311d6b21a2f5ffbb0179941fb4539aa9d3b6857be8ea9b0c851` |
| `ToolCall.cfg` | `3d2c419e9ca9ca0831fffe0a8985b23ad4ea700c2957d39fc2cb08ca369f60cc` |
| `ToolCallProgress.cfg` | `64d6fff2c51f9187077f6febb0772a917fdc8d48b83ede5b28f22aca6b333961` |
| safety 原始日志 | `056667c87738436efffba031ab83bdb1199541c1a62eee56e8a5aaf578fece23` |
| progress 原始日志 | `763d7f3c0b0dcf40deaac5bc98712723da8547287f6c3c17e9d546fe4a903940` |
| mutation 结果（含每份原始日志和变异工件哈希） | `3dc957199843220c68ce37b1fa626ccbe5b2feb0306d2258adc984054567bd28` |

本次原始日志、命令、生成负例脚本保存在交付工作区
`tmp/docs-spec-v1/l-tools-formal/`；其保留与迁移由交付记录管理，以上哈希本身不承诺远端存档。
