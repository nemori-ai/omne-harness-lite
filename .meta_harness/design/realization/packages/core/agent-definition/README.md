# agent-definition

> 历史路径提示：本页所称 `apps/model-request-acceptance`／`model-request-acceptance` 是 D-076 采用时的技术验收装配坐标；当前已退出 `apps/` 映射。现行归属与剩余责任以[实现映射入口](../../../README.md)为准。


- kind：`provider`

纯数据模块，候选节点 rev 1（2026-09-27）。
- 源码位置：`packages/core/agent-definition`，**尚未建包**。
- 契约：[`data.agent-definition/v1`](../../../../spec/data/agent-definition/v1/contract.md)，catalog 状态 `candidate`，S-1～S-10。
- 边界依据：[已提交求值的读取链候选](../../../../record/proposals/model-request-adaptation/read-projection.md)；PF-004 rev 12、PF-002 rev 20、PF-013 rev 13 的具体来源由契约入口维护。

## 分层状态

- **语义接受：无。** 本节点及 agent-definition/v1 均为候选；依赖 model-profile/v3 也未接受。其余精确依赖的状态见设计表，不以旧版本接受替代本次采用。
- **可实施范围：候选映射已写明，尚不可据此宣称交付。** 范围为完整 body 的窄校验、引用与声明集合提取、严格无损表示和固定 Schema 资源。S-2 的实际版本选择、授权与读取由根输入生产者承担；S-9 的通用资产校验必须先行。本节点不实现完整 Agent Definition、求值或运行时。
- **绑定与证据：0 条。** 尚无本节点实现测试；规格示例与已有 core 测试不能替代本节点证据。义务及 owner 见 [verification](verification.md)。
- **实际验证：尚无源码或真实消费者验证。** 设计检查结果另列于 verification，不作为实现符合性结果。

## 阅读入口

| 当前问题                       | 入口                          |
| ------------------------------ | ----------------------------- |
| 纯函数面、精确依赖与调用方责任 | [实现设计](design.md)         |
| 哪条已有可失败证据             | [绑定表](bindings.yaml)       |
| 应执行哪些反例与真实交接       | [验证与缺口](verification.md) |

接受与冻结归 [registry](../../../../registry/README.md)，不由本节点起草、文件齐全或检查通过推断。

## 2026-09-27 技术采用

[D-072](../../../../record/decisions/agent-definition-read-adoption/decision.md)已接受 AD1 及本纯模块设计。此事件不修改此前设计字节，不证明源码或真实IO。Profile3 依据 D070 已接受；当前源生产者为 evaluation-input-store，验收应用为 model-request-acceptance，其节点和实际结果分别核验。

## 2026-10-03 固定Schema技术采用

[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。
