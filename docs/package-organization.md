# 产品包组织

本页维护产品包的目标分组、包边界和扩展规则，供人和agent选择维护位置。顶层源码归属及开发环境由[workspace](workspace.md)维护，业务责任由[领域地图](domains/boundaries.md)维护，系统分层与依赖由[架构](architecture/layers-and-dependencies.md)约束。

这些规则用于后续建包与迁移设计。下面的具名位置表达目标知识归属，不表示成员已经存在，也不接受该成员的精确接口或运行机制。新树从[包入口](../packages/README.md)读取目标组及缺项；旧成员从[legacy入口](../packages.0.0.1.legacy/README.md)查源。新成员准入与工具适配仍须明确任务。

## 组织原则

产品包按 `packages/<能力组>/<成员>/` 两层组织。能力组聚合同一责任的相关知识和维护任务；成员拥有package.json、源码、依赖、公开入口与验证。第一层不是workspace成员，也不自动成为DDD上下文、插件、服务、进程或发布单元。

一条能力的契约、业务实现、专属提供者、Cordis适配和验证就近维护。先判断这些内容能否在一个成员内清楚表达，再按真实消费和依赖边界拆为兄弟成员。目录不按全仓definitions、providers、coordinators等技术角色分割，也不要求每组具有相同数量的包。

相关知识集中不转移事实权威。共同存储机制归存储能力，专属数据映射归使用它的能力；组合保证归实际协调者。Session、模型、工具继续各自拥有事实和生命周期。

能力组允许增长。当前责任和下列目录不是未来能力的白名单，新增按[扩展指导](domains/extending-the-system.md)判断。

## 目标目录

以下是初始落点。能力组已建立文档骨架；具名叶子以导航和缺文件登记预留，不生成空实现包。叶子名称及成员划分仍须在具名消费者和精确承诺明确后确定。

```text
packages/
├── access/
│   ├── public-contract/        客户端与服务端共同的系统公开契约
│   ├── sdk/                    公共Harness SDK
│   └── server-entry/           系统协议接入与能力路由
├── identity/
│   ├── identity/               主体、成员、登录与组织关系
│   └── authorization/          授权及共同动作准入
├── assets/
│   ├── assets/                 共同定义、版本、持有与来源
│   ├── settings/               设置配值与求值
│   └── permissions/            权限配值与求值
├── workspace/workspace/        工作区身份与资源关联
├── session/session/            Session、Run与逻辑治理
├── assembly/assembly/          求值、采用和装配交接
├── agent/agent/                Agent定义、Loop与extensions
├── model/model/                模型能力、请求和原结果
├── tool/tool/                  工具定义、执行和效果
├── context/
│   ├── runtime-context/        数据注册、供给与读取
│   └── request-context/        请求投影与上下文组装
├── human-intervention/human-intervention/
├── execution/execution-environment/
├── calendar/calendar/          日历版本依据与日期计算
├── schedule/schedule/          日程、Job与整体结果
├── notification/notification/  通知及送达
├── slash-command/<成员>/       命令定义、识别与展开
├── skills/<成员>/              方法、资源、发现与读取
├── mcp/<成员>/                 端点、连接、发现与动作桥接
├── storage/<成员>/             存储契约、机制与提供者
├── time/<具名时间能力>/        有独立消费者的时间能力
├── telemetry/<具名观测能力>/   有真实共同需要的观测能力
└── common/<具名纯表示>/        经共同语义核对的纯定义
apps/<应用成员>/               客户端表现、个人设备daemon或云节点装配
tools/<开发工具>/              检查与开发工具
scripts/                       仓库自动化
```

同一能力组内可以增加具名提供者或独立适配成员，前提是包边界有依据。单成员组仍提供稳定知识位置，不为目录对称增加转发层。time、telemetry和common须有实际共同语义及消费者，不能成为收纳未归属代码的目录。

## 责任与能力组

领域页拥有责任及协作，下面只维护责任到目标能力组的导航，不把责任数量当作包数量。

| 责任入口 | 目标组 | 就近维护的知识 |
| --- | --- | --- |
| [身份与授权](domains/identity-and-authorization/README.md) | identity | 主体关系、登录、授权与共同准入 |
| [资产与规则](domains/assets-and-rules/README.md) | assets | 共同持有、来源、设置与权限求值 |
| [工作区](domains/workspaces/README.md) | workspace | 工作区身份及资源关系 |
| [会话与工作](domains/sessions-and-work/README.md) | session | 逻辑工作、输入受理及消费协调 |
| [装配交接](domains/assembly-and-handoff/README.md) | assembly | 定义采用、绑定和交接 |
| [Agent推进](domains/agent-progression/README.md) | agent | Loop与扩展推进 |
| [模型调用](domains/model-invocation/README.md) | model | 请求、原执行、结果与费用 |
| [工具执行](domains/tool-execution/README.md) | tool | 调用、执行与外部效果 |
| [Runtime Context](domains/runtime-context/README.md) | context | 数据供给、注册与请求投影 |
| [人工介入](domains/human-intervention/README.md) | human-intervention | 决策请求及有效答复 |
| [执行环境](domains/execution-environments/README.md) | execution | 环境、设施与资源 |
| [日历](domains/calendars/README.md) | calendar | 版本、日期依据及计算 |
| [日程与Job](domains/schedules-and-jobs/README.md) | schedule | 接受、执行协调及整体完成 |
| [通知](domains/notifications/README.md) | notification | 发送、尝试与送达 |
| [Slash Command](domains/slash-commands/README.md) | slash-command | 名称、绑定、识别与展开 |
| [Skill](domains/skills/README.md) | skills | 方法取用、正文及资源 |
| [MCP](domains/mcp/README.md) | mcp | 端点、连接、发现与桥接 |

assets维护共同治理，具体类别维护专有定义与业务。共同治理不反向导入全部类别实现，Tool不接管被调用类别的业务状态。命令受理、Skill读取与脚本执行、MCP连接与实际调用的分责继续沿对应领域页。

## 包边界与公开入口

独立包须说明具名消费者，以及独立安装、平台或依赖隔离、公开消费、替换、发布或验证的具体收益。比较内部模块与兄弟成员对维护路径、依赖闭包和行为完整性的影响。存在接口、文件变大或能够做成插件，不能单独决定拆包。

公开入口应让消费者完整使用能力，隐藏内部队列、存储步骤、资源管理和恢复细节。消费者通过exports使用其他包，禁止穿透兄弟成员的src。构造与普通操作的调用资格分别由实际契约明确。

成员根入口提供可独立消费的类型、必要校验、纯函数或显式依赖的工厂。Cordis绑定在集成入口维护，默认沿[IC-4](architecture/cordis-integration-conventions.md#ic-4)使用同包 `./cordis`。契约与提供者共置时，服务定义可以通过独立公开子入口消费；具体插件仍由 `./cordis` 发布，避免定义消费引入业务提供者实现。独立适配成员须在实际设计中说明包边界、入口与集成责任，不凭目录自行改变现行绑定要求。

源码无Cordis边、生成声明无Cordis类型、独立运行不启动Cordis、安装不引入Cordis，是不同检查。exports分开不证明全部闭包隔离；支持平台、打包和安装须由实际消费验证。

## SDK与系统接入

access把完整Harness的接入知识就近组织。public-contract拥有系统公开操作、数据、事件及边界行为；SDK和server-entry共同消费它。业务含义仍由原能力维护，系统内部接口不自动成为公开操作。

SDK是客户端统一编程入口，承接调用、观察、订阅及明确属于客户端的资源责任。它可以依赖客户端平台和传输适配，管理由客户端拥有的连接与句柄。它不能导入服务端接入实现、服务端提供者、服务端业务存储、runtime实例或Cordis装配树。server-entry按共同契约调用能力公开接口，不能导入SDK或穿透业务私有实现。

完整Harness客户端通过SDK使用系统；独立能力消费者可以直接使用所需能力及所选实现，不强制经过SDK。同组不要求共同安装或发布。首批SDK操作、传输、认证、兼容、缓存、订阅恢复及拥有式daemon启动沿[分层后续设计](architecture/layers-and-dependencies.md#待细化范围)明确，本页不补默认协议。

## 依赖方向与Cordis集成

依赖按角色和公开契约判断，不按core、infra或util目录名取得许可。共同纯定义不依赖领域状态和提供者；能力契约不依赖实现它的提供者、SDK或应用；业务实现通过公开契约和显式依赖组合，产品装配负责选择提供者。

服务定义随能力契约的唯一拥有者就近维护，消费者和提供者引用同一定义，通用assembly不收回全部Service和key。Service形状、键、依赖换代、isolate及撤除的精确规则继续归[Cordis集成约定](architecture/cordis-integration-conventions.md)。

同组或同包不豁免依赖方向。类型引用、源码值边、声明和实际产物分别核对，事件或回调不为反向代码依赖提供默认许可。SDK和独立入口的安装闭包按目标平台验证。

共同提交仍须满足实际存储与协调协议；相邻目录、同库路径或相同租户不证明原子性。[IC-5](architecture/cordis-integration-conventions.md#ic-5)的精确事务读例外保持原范围，不能借组织更新扩大提供者互引或装配豁免。

## 新增与扩展

先明确新增行为的要求、采用范围、身份与事实拥有者、调用方、结果、副作用和验证责任。普通既有承诺扩展就近处理，新增产品含义或公开保证由其拥有者决定。

| 新增内容 | 放置判断 |
| --- | --- |
| 内部行为或计算函数 | 留实际拥有者的内部模块 |
| 原契约的新提供者 | 放所属能力组，平台依赖和验证就近维护 |
| 新资产类别 | 复用共同治理，专有知识由类别拥有者维护；不自动建包 |
| 稳定新业务责任 | 确认责任和承诺后增加领域入口及能力组 |
| 新应用或部署角色 | 装配和表现归apps，可复用业务归能力 |
| 新Harness公开操作 | 原能力维护业务，access维护系统投影、SDK及接入 |

新组不必先修改固定类别白名单，也不必同时增加SDK操作。运行时注册、扩展API、角色声明和测量载体由实际拥有者另行设计。实施顺序沿[Feature场景](engineering/scenarios/feature.md)及[领域扩展指导](domains/extending-the-system.md)。

## 文档归属与维护路径

领域页解释模块关系、协作和组合责任，本文维护目录及包边界。精确类型、失败、状态转移、事务、取消、恢复和验证资源随实际成员或协调者，跨包协议也随其拥有者。

能力组与成员包各自维护完整、按需生长的文档体系，具体要求归[两层成员文档](member-documentation.md)。组入口拥有组内工程关系及共同维护，成员入口展开公开使用、行为、内部设计与验证；必要专题就近拆分。SPEC完整表达非类型行为，不作为整套成员文档的厚度限制。不复制产品规则或创建中央模块SPEC，未实现目标不造空成员。

agent从[任务地图](context-map.md#领域设计与新增模块)定位责任，再沿本页选择目标组，读取实际契约、实现及相称验证。涉及其他能力时进入它的拥有者，涉及系统公开投影时进入access，涉及发行装配时进入apps。责任足够就停止扩大阅读。

拆页、登记和迁移正文沿[维护指南](maintenance.md)，当前成员位置由实际workspace与成员入口发现，不手工维护另一份永久成员账本。

## 现有成员与工具适配

目标规则替代“所有Service定义集中core”和“仅以core/util目录判断跨包许可”的目录治理。现有成员仍保留真实路径、接口和行为，迁移须同步消费者、公开入口、构建、发布、资源读取及验证；路径变化不改变Schema身份或接受范围。

当前typescript-package@2.0.0的service-contract创建与扫描仍限制core；架构静态检查的IC-1、IC-5及分组方向也仍使用旧路径投影。它们是尚待适配的工具范围，不能据旧检查失败否定目标组织，也不能据旧检查通过宣称新依赖政策成立。具体范围见[模板](../tools/ts-checks/templates/package/README_ZH.md)及[符合性报告](../tools/ts-checks/src/arch/CONFORMANCE.md)。

在新组实施公共Service成员前，工具拥有者须完成相称模板和规则适配，保留唯一服务定义、纯入口、依赖方向、精确例外及未知报告。不能手写骨架或伪造采用标识绕过现行检查。此义务不阻碍本页目标设计和独立的文档维护。

当前成员重组、工具适配、SDK安装闭包及真实维护成本尚需各自实施和验证任务。报告区分目标要求、现状、偏离、口径变化与未覆盖，沿[领域符合性](domains/verification.md)和[项目验证](verification.md)选择证据。
