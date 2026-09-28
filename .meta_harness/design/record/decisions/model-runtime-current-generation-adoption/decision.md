# D-100：模型纵线当前代际直接替换的技术接受

2026-09-28，主调度在用户持续实施与技术验收委托内接受本记录精确资源。来源沿[既有适配提案](../../proposals/model-request-adaptation/design.md)、[D-097](../model-profile-v4-limit-contract-adoption/decision.md)、[D-099](../model-input-limit-consumer-contract-adoption/decision.md)。用户进一步明确：“当前的开发阶段不是允许而是就是要求破坏性重构，不给旧版实现留兼容过渡”；根约定与研发品味已在 `11c6c5b0` 落实，首版正式发布时重新制定政策。

## 接受与取代

接受 MP5、Directory5、MS6、MR7、LC6、RT7、Runner5 的全部规范资源，精确82项摘要见 acceptance。它们取代本纵线当前消费者的旧格式读取、旧codec结算、旧版兼容过渡义务；旧规范与冻结摘要不原地修改，其他消费者不因版本推荐自动变更。字段、数值约束、失败枚举、十三操作及当前代际恢复责任保持。

采用七节点：model-profile 当前增补、messages6、model-response7、loop-extension6、directory当前增补、transport当前增补及runtime当前共享面。它们替代 D-098 的旧端口、分段 definitions/v4、旧实现继续发送与旧数据升级器安排。当前消费者必须同步迁移；目录、模型调用与demo不得补缺字段、猜版本、静默清空或转换用户数据。必要的现行规范精确 Schema 资源保留原字节，不恢复旧运行codec；不借此重构资产平台。

## 独立审查与范围

独立 spec-reviewer 核对最终82资源清单（清单SHA256 `41edd169c5846f5e93e8c28f1f7e4e1d15b518a9dc0776b6598876fd2f050cc4`），版本/产品来源/前驱执行声明残留已修正，最终无阻断或未解决非阻断。四份Schema除坐标与说明外结构同构，584份原冻结资源保持，58份形式源/配置逐字继承；不声称新版本已重跑TLC或Alloy。

独立 architecture-reviewer 对六节点及LC→AE修正复核，最终无阻断。原唯一发现是“资源文件存在”不等于 AM 私有编译实例获得 LC3；现明确 AE defaults 供给原LC3 Schema、复用当前未变七项声明行为并经既有resources入口装配，附缺/错资源必失败的真实组合验收，不新建resolver或保留旧模型codec。

runtime 共享面经独立架构审查，另以精确摘要 `283558cbfba060f45b443c5eb71e4e748ae64d442c3e9d5be8f40e5d2d07000f` 完成 DispatchSuccess/settleReply 表达定点复核，四个结果分支及 persisted 拒绝均无阻断。实施必须展开精确联合，不用任意 ModelResponse 充当 settled，也不让 dispatchAgain 进入零历史 undispatched。

HUB 中央候选登记与 internal/formal=registered 检查通过；实现验证另计。当前37定义代码已合HUB，core280与纯定义23测试仅证明各自范围，不能代替本次全部消费者迁移或实际发送。

## 实施门与责任不变

本记录采用runtime当前共享面，允许先做当前纯数据及消费者迁移、公共接口与noRun施工。生产Run事实G28只挡依赖它的withRun分支；runner真实结论来源挡失败主体和默认重试闭环；S74计量依据挡实际发送，不挡独立状态/耐久构件实施。成功门不能由固定unavailable、布尔Run替身或旧demo旁路代替。

旧数据无法消费不等于其中事实已完成；不改写它。当前代际已受理的unknown提交、原批认回、停止、恢复与结算责任完整保留，不因换ID或重构而丢弃。十三操作与37双路径认证、包双语文档和真实组合验收仍按原计划逐项交付。
