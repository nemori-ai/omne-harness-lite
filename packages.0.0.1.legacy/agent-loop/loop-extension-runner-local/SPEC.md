# 本地 Runner 提供者

本包实现 [公共 Runner 行为](../../core/loop-extension-runner/SPEC.md)，独立 runPass、只读 readPassConclusions 和 registry 可单独消费显式 ports。公共业务规则不在本包重定义。纯 key、codec、效果和历史函数归公共包，本地提供者不拥有新的 Session／Run／卡片／环境产品。

## 日志与资源

SL3 适配绑定真实 session/tenant/logGeneration。subjectForCandidate 必须提供本次原 subject，适配器检查并保留供合法竞争 winner 恢复。task owner 在每次真实 read/write 之前登记，unknown 留在原物理 host；新实例空读不能证明旧写没有提交。恢复协议沿公共页的真实 writer 停止与 recovered-read 顺序。

提醒适配用模型 runtime 的 mrr/3 MessageId 键及全消息。readMessagePrefix 须是本次授权完整前缀，同 ID 异值是冲突。独立调用借宿主给的 nested chain；服务用同一捕获清单里的链。source/history/log/waiting 只借用，不因 instance.close 或 handle.release 关闭它们。

## Cordis 装配与贡献

./cordis 的 loop-extension-runner-local 插件 inject sessionLog、runnerHost、sessionAccess。配置是严格空对象，资源与回调经具名服务，不由配置夹带。装配提供公开 loopExtensionRunner／loopExtensionImplementations 及 tool-admission 的正式经过源。此插件不自造 production host，宿主须实现真实 scope、权限、failure 来源、等待与物理恢复。

贡献 registerBuiltin／registerAdmission 经调用方 this.ctx.effect 拥有，卸载撤自身代；同名／官方贡献误用按公共同步装配拒绝。插件先 closeAdmission，再 await 真实 drain。fiber 不活或 host/source 失效拒新 effect，但旧在途和 unknown 仍由其物理 owner 完成，不能把不可见当排空或转交新提供者。

Service 的 actual execution 在 await host scope 之前捕获，与 runPass、verifyFailure、input 和 log fence 同值。授权读及 scope 释放仍属真实借用责任，不用直接函数调用绕过来源核验或 grant identity。正式整批准入及登记停收沿公共 RA/RAC/RS 承诺。

## 验证范围

[verification](verification/README.md)列原输入、真实 SL3 适配、unknown/late 与贡献换代场景。[models](verification/models/README.md)仅为有限回放／历史模型。示例的内存等待和日志受控，不证明生产 card／Session 实现；只读 replay 的空历史例子不是授权或 Run 身份证据。当前实现不新增 paid 模型调用，也不声称完整运行时组合已交付。
