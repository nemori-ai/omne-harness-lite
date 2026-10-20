# Session 能力组

## 责任与范围

本组按公共契约、框架定义、通用实现和具体装配划分成员。四类成员已初始化，业务技术接受及运行实现分别判断。所有运行接口仍是候选。Session 是治理服务，Run 与 attempt 是逻辑对象；不增加第四种 runtime、每会话 Context 或实例目录。具体事务提供者尚未选择。

## 成员与依赖

| 成员 | 责任 |
| --- | --- |
| [session-contract](session-contract/README.md) | 纯契约、行为及边界校验 |
| [session-cordis-contract](session-cordis-contract/README.md) | 唯一 Cordis 定义与框架协议 |
| [session](session/README.md) | 无 Cordis 的通用实现与工厂 |
| [session-cordis](session-cordis/README.md) | 具体宿主或服务装配 |

## 关键协作

消费接口从纯契约进入；应用自行选择实现，Cordis 插件只依赖唯一定义。运行关系见 [组架构](docs/architecture.md)。

## 组合验证

源入口与安装闭包分别核对。跨域持久性、围栏、换代和控制传播沿 [公共规格](session-contract/SPEC.md) 与真实协调者验证；包骨架不证明这些性质。

## 维护

公开承诺、构造机制和框架装配分别在拥有者维护，新增或迁移成员同步包组织、实际消费者与文档登记。具名个人维护者仍由负责人指定。
