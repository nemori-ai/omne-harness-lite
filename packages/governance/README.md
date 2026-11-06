# 治理贡献能力组

## 责任与范围

本组承接[装配与交接领域](../../docs/domains/assembly-and-handoff/README.md)中的动态治理贡献、精确租约和当前治理采用。它保护已装配声明及当前选择的事实，不接管设置值、资产持有、身份资格或授权许可。跨领域规则归[动态贡献](../assets/docs/governance-contributions.md)。

本组与底层 Cordis 辅助所在的 assembly 物理分组分开。业务提供者可以依赖 kernel-basis；治理组合可以依赖业务公开定义。既有领域不得反向导入本组获取全局状态。

## 成员与依赖

[governance-contract](governance-contract/README_ZH.md) 已有输入 Schema、命令与查询类型，以及唯一 Cordis Service 定义。它依赖 Legal Identity、Settings 和 Permissions 的公开定义。`governance-local` 是本地持久提供者的目标成员，目前尚未建立。

执行内容采用仍由 `adoption-contract` 的已采用设计约束，保持 prepare、validate、read。本组不增加该协调者的方法。

## 关键协作

应用把本组的受保护当前事实接到 Settings 和 Authorization 各自的来源消费口。业务领域保有规则和提交权威。公共交接是贡献、精确撤除、完整采用、目录读取和原操作认回，见[成员规格](governance-contract/SPEC.md)。当前目录不是一份可独立编辑的设置目录。

## 组合验证

契约成员的快速测试检查公开边界。完整发布、同提交围栏、重装隔离、未知结果认回和真实 Cordis 生命周期仍须由提供者与应用的独立验收覆盖。有限模型沿 HITL 与 Settings 的正式 verification 入口维护，本组不复制它们，也不以模型通过声称生产组合已可用。

## 维护

新增成员或依赖时同步包组织、交付线、领域导航和实际消费者。按正式依赖图复查成员与组级环。未来采用提供者经领域消费口与应用桥接使用当前治理来源，不能从底层 assembly 辅助形成反向依赖。公共包名与语义拥有者不因物理分组改变。
