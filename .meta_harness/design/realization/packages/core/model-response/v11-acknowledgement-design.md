# ACK 保留例外与完整响应值的接续

2026-09-29，revision1，candidate，未接受/未实施，新增binding0。输入为MR11 S49及RT12/MS8/CA4同批候选、PF013rev17§6.19；前驱D110的v10。完整PendingModelResponse和ModelResponse字段形状不因ACK改变，变化是合法确认后模型副本保管责任结束，以及后继真实处分的来源核验承接。

本节点仍纯数据包，没有Cordis plugin/service/fiber、Storage/权限或删除任务。共同D025 Cordis4.0.4不由本包直接消费；运行行为由现model-request-runtime承担。

| 契约责任 | 候选兑现点 | 边界/缺口 |
| --- | --- | --- |
| MR11完整ready/final形状 | 当前root与Schema入口统一MR11，现judgeModelResponse/judgePendingModelResponse及owned/无损文本接收保持 | 不添ACK处分类别，不接受不完整final |
| MR11 S47/S49原事实相等 | 原同响应关系检查仍仅允许真实disposition/提交点late及原既定消息派生关系；原reply/inputCalibration/route/usage/cost不改 | 输入来自ACK后consumer自持原值时，由runtime先核MS8语义摘要/原来源与当前权限，不把纯judge成功当锚定权 |
| 精确依赖 | MR11新Schema直接引用MS8/CA4，既有MP5/CB等保持各自精确版本 | 最终defs可达图重算；不将完整依赖包所有defs都编译 |
| 持有/删除 | 本包不读取模型内容，也不将合法ACK之后缺payload判为损坏 | runtime根据合法ACK及精确清单分支；没有ACK的缺源义务仍保持 |

不增加新恢复值或部分ModelResponse，不从ACK witness重构reply、route/profileSnapshot、raw/inputCalibration；摘要只能验证consumer持有的完整原值。若以后需要形成final仍由合法写方拿完整值走现关系判定。字段结构不变不等于旧MR10保留条款可继续作为当前保证；版本需要明确切换。

固定资源预期为MR11、MS8、CA4、CB3、CB2、IV1、MP5、OE1、LC6九个规范资源及现有两个private判定入口自有派生资源。每份规范Schema完整且原$id不替换；只编译25公开defs及既有private入口所达defs。最终图以实际新Schema闭包/缺URI负控为准，不把数量写成无条件证明。LC6内部未被所选defs触达的旧资源不因整包存在而新增；其真实其他consumer迁移不在此节点。

装载只建固定判定器；撤除无持久资源。缺规范资源在构建/初始化失败，坏值沿既有ModelResponseRejection；runtime来源/授权不可判的unavailable不塞本包纯值失败。Storage要求无。

迁移包括当前Schema/类型引用、公开精确资源与packed跨包消费者、README/README_ZH的Pending持有与ACK后核验责任说明；不保留旧实现入口，不修改冻结历史资源。当前源码尚未依据此稿更改，验收见verification R11-V1～V4，bindings无新增。

选择权衡：新增pure摘要验证wrapper会重复MS8算法且可能暗授真实来源信任，因此直接复用MS8纯digest构件，由runtime组合当前来源/资格，再用本包既有完整值判定。代价是工程验收需覆盖跨包组合；无需新的共享数据平台。独立评审待完成。
