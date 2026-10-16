# 工具执行能力组

本组维护工具定义、执行、等待、结果及组合责任。公开契约已技术接受，契约包已导出公开类型与契约函数，Cordis 服务定义已导出。独立执行、runtime 与单机宿主尚未实现。

## 责任与范围

工程范围由[领域责任](../../docs/domains/tool-execution/README.md)与[产品正文](../../.meta_harness/design/product/tool-execution/design.md)约束。本组拥有包分解、公开依赖、组协作及组合验证导航。

## 包与依赖

本组按安装闭包分成四个包。依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。`tool` 与 `tool-cordis-contract` 互不依赖。各包的测试断言这一方向。

| 包 | 承担的行为 | 阅读入口 |
| --- | --- | --- |
| tool/tool-contract | 纯契约：公开类型、品牌身份解码、定义与状态判定、声明构造、确定性投影、默认参数 codec 与结果政策。不依赖 Cordis 与任何 Tool 实现 | [SPEC](tool-contract/SPEC.md)与[设计索引](tool-contract/docs/index.md) |
| tool/tool-cordis-contract | Tool 的 Cordis 服务定义、服务键、事件与实例目录。不含 Tool 实现 | [包入口](tool-cordis-contract/README_ZH.md)与 [Cordis 定义](tool-cordis-contract/docs/cordis.md) |
| tool/tool | 不含 Cordis 的领域实现：独立执行、runtime 工厂、受理决定器与记录仓端口。当前只有构造形状 | [包入口](tool/README_ZH.md)与[内部架构](tool/docs/architecture.md) |
| tool/tool-host-local | 单机宿主：宿主时钟、同机启动协调器、绑定登记表与 Cordis 插件。尚未实现 | [包入口](tool-host-local/README_ZH.md)与 [Cordis 装配](tool-host-local/docs/cordis.md) |

| 消费方 | 生产依赖 | 测试依赖 |
| --- | --- | --- |
| Agent、Session、请求组装、HITL、执行环境、Code 等其他领域 | `tool-contract`；编写 Cordis 插件时另加 `tool-cordis-contract` | `tool-contract`；需要真实 runtime 时可加 `@omne-harness/tool/testing` |
| 其他领域的工具作者 | 只有 `tool-contract` | 同上 |
| 独立程序（不建 Session 直接执行工具） | `tool-contract` 加 `tool` | 自选 |
| 应用装配 | `tool-host-local`，间接带入其余三包 | 自选 |

`tool-contract` 的安装闭包目前经 kernel-basis 的 `Outcome` 带入 Cordis。这是共同前置，由 kernel-basis 的拥有者迁出 `Outcome` 后解决；在此之前，测试只允许这一条路径。

产品的[旅程与能力](../../.meta_harness/design/product/tool-execution/design.md#关键用户旅程)、[关键协作流程](tool-contract/docs/flows.md#工具执行的关键协作流程)和[验证对照](tool-contract/SPEC.md#旅程能力与验证入口)用于定位组合义务，不是另一份业务规则源。

共同持有、设置和权限归 assets；发起与业务采用归实际协调者；环境归 execution；Skill 资源与 MCP 发现连接分别归其成员。Tool 通过公开能力完成包装动作，不接管被调用领域的业务状态。跨组提交和消息采用协议归真实协调者。

增加包须说明实际消费者、安装闭包差异、替换和验证收益。类型存在、目录变大和插件可能性不足以决定拆包。组不提供合并 SPEC，各包维护自己的行为，组维护导航和依赖边界。工程关系见[组设计](docs/architecture.md)。

## 关键协作

`tool-contract` 定义逻辑调用、真实执行、内部等待、控制、结果及执行账的契约，`tool` 与 `tool-host-local` 实现它们。发起协调者与身份治理、环境、HITL 和原消费方分别承担资格、资源及业务采用；Skill 和 MCP 通过公开行为组合，不以方法读取或连接成功代替动作准入。

流程从[组协作入口](docs/key-flows.md)导航到契约包的流程。

## 组合验证

Tool 验证原调用、dummy、等待、控制、收场与效果；发起和消费协调者共同验证当前资格、排队撤权、可靠承接、归档迟到和提交未知。提供者验证真实环境、传输、隔离及外部效果，缺环境保留无法验证。范围见[持续验证义务](tool-contract/SPEC.md#持续验证义务)。尚无真实存储、故障、断电或性能执行证据。

## 维护

修改行为同步契约 SPEC、原具名专题、实际消费者及相称验证；修改包分解同步组导航、登记与依赖方向测试。具名维护人尚缺，由项目负责人指定；职责拥有者不等于已派发个人。产品、组工程和包机制分别维护唯一正文。
