# D-038 · 公开 health 客户端的限定采用

- 状态：已接受，2026-09-24；主线实施负责人在用户“没问题，那开搞吧”及治理CLI/TUI范围授权内作出的技术采用。授权范围的长期记录见 [INT-001～007](../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-24-production-cli-intake.md)。不冒充用户点选了实现库。
- 对象：`packages/frontend/governance-center-client` provider r1；受评 design.md SHA-256 `f3ffdac0dcd00426b601fccf00bf1569527ccf8053689ad54ef2465de090ee4a`。后续源码引用与证据回填不改变本次范围。
- 来源：[CLI-TUI治理候选](../../proposals/cli-tui/governance-client.md)及[独立评审记录](../../proposals/cli-tui/review.md#公开-health-提供者节点评审--2026-09-24)。

## 选择与范围

采用 Node24既有工具链上的 `node:https` 成帧、逐调用独占连接、有界读取与明确关闭，公开唯一固定 health 操作。消费冻结 EC1 v1 S-18/S-27/S-36、HT1 v1 S-4/S-5/S-9/S-15/S-17/S-18；CA+主机名或已确认SPKI沿D-029，协议语义和Schema不改。

不采用本地SQLite状态候选，不开放登录/任意请求体或治理写，不定义CLI命令与退出码，不建Agent据点，不宣称生产恢复已闭合。本决定不接受新契约，catalog/frozen保持原版本。

## 理由与保留前提

与自写TLS成帧相比，复用标准HTTP解析器减少独立协议责任；与fetch/自有dispatcher相比，关键发送与信任时序已取得直接局部证据。原型10场景支持可行性，不能替代提供者测试。独立评审未见本切片必须等待完整CLI的缺失语义。

实施必须核验实际socket与ClientRequest关闭，不能拿IncomingMessage.close替代网络静止；DNS系统解析可能在取消后继续，本模块只保证已销毁请求不发送晚到连接。保持尺寸、总期限与取消分类的验证义务，不作硬实时承诺。

## 影响

新增同路径提供者及包；apps/cli未来通过公开入口消费。本次不取代D-022的完整交付形态、不取代D-029信任规则，也不接受旧CLI框架其余候选。包测试、真中心集成、绑定与源码修订随后按实际运行登记；采用不代表实现或发布完成。
