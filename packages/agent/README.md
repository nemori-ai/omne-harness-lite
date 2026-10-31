# Agent 能力组

## 责任与范围

本组按公共契约、框架定义、通用实现和具体装配划分成员。四类成员已初始化。设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，实现与提供者分别判断。两个契约包已经实现并有测试：agent-contract 导出契约类型、声明与输出判断、身份解码与结构判定和资产正文契约，agent-cordis-contract 导出 Cordis 服务定义和目录插件。通用实现 agent 与具体装配 agent-host-local 仍是模板，Loop、runtime、提供者和宿主插件尚未实现。装配消费者直接依赖 agent-contract。agent-contract 依赖资产包并向它的类别注册表登记正文契约，资产包不依赖 agent-contract。核心通过自己的执行记录和窄交接端口工作，外部协调者在外部保存自己的业务关联并消费事件。对象和生命周期见 [对象模型](agent-contract/docs/object-model.md)。

## 成员与依赖

| 成员 | 责任 |
| --- | --- |
| [agent-contract](agent-contract/README.md) | 纯契约、行为及边界校验。已实现，运行接口只有类型 |
| [agent-cordis-contract](agent-cordis-contract/README.md) | 唯一 Cordis 定义与框架协议。已实现，提供者未实现 |
| [agent](agent/README.md) | 无 Cordis 的通用实现与工厂。模板，未实现 |
| [agent-host-local](agent-host-local/README.md) | 具体宿主或服务装配。模板，未实现 |

## 关键协作

消费接口从纯契约进入；应用自行选择实现，Cordis 插件只依赖唯一定义。运行关系见 [组架构](docs/architecture.md)。独立调用者、外部协调者、扩展作者、实现者和装配者各自的起点见[按读者选择阅读路径](docs/key-flows.md#按读者选择阅读路径)。

## 组合验证

源入口与安装闭包分别核对。契约包的测试覆盖纯判断、导出面、依赖方向和目录的登记规则，见两个成员的测试说明。跨域持久性、围栏、换代和控制传播沿 [公共规格](agent-contract/SPEC.md) 与真实协调者验证；契约包的测试和包骨架都不证明这些性质。

## 维护

公开承诺、构造机制和框架装配分别在拥有者维护，新增或迁移成员同步包组织、实际消费者与文档登记。具名个人维护者仍由负责人指定。
