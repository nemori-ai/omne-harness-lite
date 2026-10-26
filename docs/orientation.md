# 开工定向

人和 agent 开工前先读本页。本页给出同一个起点，回答三个问题。系统有哪些责任？核心四项与执行环境之间允许哪些方向？服务端怎样分层，又怎样装进一个单机进程？

本页只做导航和画图，不拥有任何结论。每张图的事实归图下列出的出处。本页与出处不一致时，以出处为准，并把差异交给出处的拥有者。读完本页后，按角色进入[读者入口](README.md#选择阅读路径)，或按任务进入[任务地图](context-map.md)。

## 状态怎样读

每张图下有一张状态表和一份出处清单。状态只取下面三种值。整张图默认是「已接受正文」，与默认不同的元素在状态表里逐个列出。

| 状态 | 含义 |
| --- | --- |
| 已接受正文 | 元素来自已接受的架构、领域或成员正文。它约束后续工作，不表示已经实现。 |
| 首条路径已装载 | 元素出现在[应用装配](architecture/runtime/application-assembly.md#插件树)的首条租户路径插件树里。插件树是装配设计，不表示成员已经实现或验证。实际支持范围以成员 README 为准。 |
| 已知冲突待裁 | 两处现行条款互相矛盾，拥有者还没有裁定。本页不把它画成现行关系，只标出冲突和承接卡。 |

## 领域地图

[领域入口](domains/README.md#责任入口)把 17 项责任分成五个阅读组。横向能力和 Cordis 内核不属于任何一组。每个框写四项内容：责任名、性质、拥有的事实、目标能力组。框只表示责任，不表示包、插件、服务或进程。图中四条箭头是核心四项与执行环境之间已接受的单向组合。

```mermaid
flowchart TB
  subgraph gov["治理与资源"]
    identity["身份与授权<br/>共同治理<br/>主体、成员、登录与准入<br/>packages/identity"]
    assets["资产与规则<br/>共同治理<br/>定义、持有、来源；规则求值<br/>packages/assets"]
    workspace["工作区<br/>资源能力<br/>参与、实例、地址及关联<br/>packages/workspace"]
  end
  subgraph kinds["专有类别知识 · 补充专有知识，不产生第二套资产身份"]
    slash["Slash Command<br/>专有类别<br/>识别、绑定、参数及展开<br/>slash-command/#lt;成员#gt;"]
    skill["Skill<br/>专有类别<br/>方法、资源、发现及读取<br/>skills/#lt;成员#gt;"]
    mcp["MCP<br/>专有类别<br/>端点、连接、发现及桥接<br/>mcp/#lt;成员#gt;"]
  end
  subgraph work["工作、装配与执行"]
    session["会话与工作<br/>逻辑治理<br/>输入承接、Session/Run、推进权<br/>packages/session"]
    agent["Agent 推进<br/>执行能力<br/>Loop 求值、动作、扩展位置<br/>packages/agent"]
    model["模型调用<br/>执行能力<br/>固定输入、原输出、收场与费用<br/>packages/model"]
    hitl["HITL 人介入<br/>交接能力<br/>请求、呈现、答复及关联<br/>human-intervention"]
    assembly["装配交接<br/>集成责任<br/>求值、采用、结构绑定和换代<br/>packages/assembly"]
    context["Context<br/>数据 / 派生能力<br/>块的注册读取；一次请求计算<br/>packages/context"]
    tool["工具执行<br/>执行能力<br/>固定调用、等待、结果与效果<br/>packages/tool"]
  end
  subgraph res["执行资源"]
    env["执行环境<br/>资源能力<br/>落点、设施、供给/释放<br/>packages/execution"]
  end
  subgraph biz["业务服务"]
    calendar["日历<br/>业务能力<br/>供应、版本、覆盖及计算<br/>packages/calendar"]
    schedule["日程与 Job<br/>业务治理<br/>接受、等待取消、整体结果<br/>packages/schedule"]
    notification["通知<br/>业务交付<br/>独立发送、目标送达<br/>packages/notification"]
  end
  subgraph cross["横向能力 · 保存与观测，不拥有业务含义"]
    storage["存储 storage"]
    clock["时间 time"]
    telemetry["日志 / 遥测"]
    schema["Schema 提供者"]
    common["common：消息、内容块、调用账目、交接引用…"]
    util["util：unix-format、xml-format（纯文本）"]
  end
  cordis["Cordis 装配内核<br/>装配、组合、依赖注入与生命周期。领域独立于内核建模，Cordis 不决定领域含义；业务身份与装配作用域分别表达。"]

  session -->|"经公开操作"| agent
  agent --> model
  agent -->|"消费契约"| tool
  tool -->|"取得获准落点与设施"| env

  %% 以下 ~~~ 是不可见的排版连线，不表示任何关系
  gov ~~~ work
  kinds ~~~ work
  work ~~~ biz
  res ~~~ cross
  biz ~~~ cordis

  classDef loaded fill:#e3f2fd,stroke:#1565c0
  class identity,session,agent,model,context,storage loaded
```

图中箭头的读法如下。Session 经 Agent 的公开操作产生 Model 或 Tool 的效果。Agent 消费 Model 与 Tool 的公开契约。执行环境为工具提供获准的落点与设施。分解轴怎样交叉、哪些概念必须分开，读[三条分解轴](architecture/structure.md#三条分解轴)。

| 状态 | 元素 |
| --- | --- |
| 已接受正文 | 除下一行以外的全部元素与关系 |
| 首条路径已装载（图中蓝底） | 身份与授权、会话与工作、Agent 推进、模型调用、Context、存储 |
| 已知冲突待裁 | 无 |

出处如下。

- 五个阅读组：[领域与能力责任](domains/README.md#责任入口)「责任入口」。
- 性质与拥有的事实：[责任边界与协作](domains/boundaries.md#责任地图)「责任地图」。
- 目标能力组：[产品包组织](package-organization.md#责任与能力组)「责任与能力组」。横向能力的成员见同页[目标目录](package-organization.md#目标目录)。
- 核心四项的单向组合：[产品包组织](package-organization.md#依赖方向与cordis集成)「依赖方向与Cordis集成」。
- 横向能力与 Cordis 的边界：[责任边界与协作](domains/boundaries.md#横向能力与阶段范围)「横向能力与阶段范围」；[总体结构与责任](architecture/structure.md#cordis-集成与作用域)「Cordis 集成与作用域」。
- 装载状态：[应用装配](architecture/runtime/application-assembly.md#插件树)「插件树」。

## 协作

### 怎样读总体协作图

全系统的协作图只有一份，在[总体结构与责任](architecture/structure.md#总体协作关系)「总体协作关系」，本页不重画。读那张图时，把每个框看作一组责任，不看作一个服务。「领域能力与业务工作治理」指各领域自己的责任，「可直接调用的计算与机械能力」也不是第四类 runtime。箭头表示主要交接，不规定调用时序、源码依赖或物理部署。虚线「独立调用」表示不经会话直接使用执行能力，它仍要满足动作准入与数据保护。HITL 的答复回到原等待位置，等待、恢复和继续推进仍归原拥有者。要看源码依赖的方向，读下一张图。

### 核心四项的方向

这张图只回答一个问题：Session、Agent、Model、Tool 与执行环境之间，源码可以依赖哪个方向，运行时结果送到哪里，哪些反向耦合被禁止。

```mermaid
flowchart LR
  session["Session<br/>逻辑治理（最外层）"]
  agent["Agent<br/>推进与执行挂接<br/>宿主内含结果接收方"]
  model["Model<br/>请求执行、原结果、费用"]
  tool["Tool<br/>调用、等待、外部效果"]
  env["执行环境"]

  session -->|"经 Agent 公开操作<br/>sessionAgentDrive"| agent
  agent -->|"消费契约 modelRuntime"| model
  agent -->|"消费契约 toolRuntime"| tool
  tool -->|"toolEnvironments"| env
  model -.->|"结果交付 → ConsumerRef"| agent
  tool -.->|"结果交付 → ConsumerRef"| agent
  agent --x|"DIR-AGENT-SESSION"| session
  model --x|"DIR-MODEL-AGENT"| agent
  tool --x|"DIR-TOOL-AGENT"| agent
  model --x|"DIR-MODEL-SESSION"| session
  tool --x|"DIR-TOOL-SESSION"| session

  classDef loaded fill:#e3f2fd,stroke:#1565c0
  class session,agent,model loaded
  linkStyle 6,7,8,9,10 stroke:#c62828,stroke-dasharray:4 3
```

三种线的含义不同。

- 实线是允许的源码依赖。外层认识内层，并且只用内层公开的契约。
- 虚线是运行时交付。Model 和 Tool 把结果推给受理时冻结的 `ConsumerRef`。这个端口由接收方以通用形状声明，所以运行时有箭头，源码上没有 Model 到 Agent 的依赖。
- 末端带叉、标着 `DIR-*` 的线是被禁止的反向依赖。契约层不得认识外层的状态、生命周期或治理。

Session 与 Model、Tool 之间只画了禁止线。按[应用装配](architecture/runtime/application-assembly.md#插件树)的现行写法，两者之间只剩恢复对账时的查询与内容读取，结果、账目与交付解除走 Agent 宿主的接收方。[会话与工作](domains/sessions-and-work/README.md#协作与依赖)另写了一条资格参加关系，即 Tool 启动围栏的资格版本，见下文 K-04。

| 状态 | 元素 |
| --- | --- |
| 已接受正文 | 除下两行以外的全部元素与关系，包括 Tool、执行环境、`toolRuntime` 与 `toolEnvironments`。首条路径的发行层不含工具与执行环境的行。 |
| 首条路径已装载（图中蓝底） | Session、Agent、Model；`sessionAgentDrive`（`session-ad14` 行）；`modelRuntime`（`agent-host` 行的 `inject`） |
| 已知冲突待裁 | Session 与启动围栏的关系（K-04）；Session 与 Model 的关系（K-05）；Tool 的服务键 `toolStartFence`（K-11） |

三项冲突都收在 [#759](https://github.com/nemori-ai/omne-harness-lite/issues/759) 的冲突清单里。本页只标出，不替拥有者裁定。

- K-04：[会话与工作](domains/sessions-and-work/README.md#协作与依赖)仍写 Session 是「Tool 启动围栏的资格版本拥有者」。[应用装配](architecture/runtime/application-assembly.md#插件树)写启动围栏是 Agent 日志的 `start-fence` 条目，`ToolStartFencePort` 已被替代。[Session 契约](../packages/session/session-contract/SPEC.md)仍按两个被替代的端口写操作步骤。承接 [#680](https://github.com/nemori-ai/omne-harness-lite/issues/680)、[#756](https://github.com/nemori-ai/omne-harness-lite/issues/756)。
- K-05：应用装配装载 `session-ad05`（AD-05）。这一行 `inject` 了 `modelRuntime`，让 Session 一侧作 Model 消费者拥有者并读取账目。[产品包组织](package-organization.md#依赖方向与cordis集成)的来源职责表写 Session 的邻域适配不直接依赖 Model 操作契约。[会话与工作](domains/sessions-and-work/README.md#协作与依赖)写结果、账目与交付解除经 Agent 宿主的结果接收方完成。[#680](https://github.com/nemori-ai/omne-harness-lite/issues/680) 承接一部分，其余待裁。
- K-11：[Tool 契约](../packages/tool/tool-contract/SPEC.md)与 [Tool 的 Cordis 说明](../packages/tool/tool-cordis-contract/docs/cordis.md)声明服务键 `toolStartFence`，该成员源码的服务声明没有这个键。Session 契约写启动围栏是 Agent 日志的 `start-fence` 条目。现行正文没有写明两者的关系。待裁。

出处如下。

- 来源职责与禁止的反向耦合：[产品包组织](package-organization.md#依赖方向与cordis集成)「依赖方向与Cordis集成」。
- 五条方向约束：[constraints.json](architecture/constraints.json) 的 `directions`。
- 集成方认识被集成方：[系统分层](architecture/layers-and-dependencies.md#领域语义依赖与模型边界)「领域语义依赖与模型边界」。
- Session 与 Model、Tool 的关系：[会话与工作](domains/sessions-and-work/README.md#协作与依赖)「协作与依赖」。
- 服务键名：[应用装配](architecture/runtime/application-assembly.md#插件树)「插件树」；`toolEnvironments` 见 [Tool 的 Cordis 说明](../packages/tool/tool-cordis-contract/docs/cordis.md)。
- `ConsumerRef`：[Model 契约](../packages/model/model-contract/SPEC.md)、[Tool 契约](../packages/tool/tool-contract/SPEC.md)。

## 顶层架构

### 依赖分层

这张图回答客户端、两端共用的契约和服务端怎样分层。箭头表示依赖某个公开定义或接口，不表示消息流、线程或进程。

```mermaid
flowchart LR
  subgraph clientSide["客户端"]
    app["客户端应用<br/>apps/cli"]
    sdk["客户端 SDK<br/>access/sdk"]
  end
  subgraph shared["两端共用"]
    pub["公开契约<br/>access/public-contract"]
  end
  subgraph serverSide["服务端"]
    edge["服务端接入适配<br/>access/server-entry"]
    core["服务端能力的公开接口<br/>*-contract · *-cordis-contract"]
    adapter["基础设施与 Cordis 适配<br/>*-host-local · 存储提供者 · *-adapters"]
    asm["应用装配<br/>apps/#lt;应用成员#gt;"]
  end

  app --> sdk
  sdk --> pub
  edge --> pub
  edge --> core
  adapter --> core
  asm --> core
  asm -->|"选择实现"| adapter
  asm --> edge
  sdk --x|"SDK 不导入服务端"| edge

  classDef loaded fill:#e3f2fd,stroke:#1565c0
  class edge loaded
  linkStyle 8 stroke:#c62828,stroke-dasharray:4 3
```

SDK 只依赖公开契约，不带服务端存储、runtime 实例或 Cordis 装配树。服务端能力不反向读取装配入口，由装配选择实现。框里第二行是目标能力组里承担这个角色的成员，不是一一对应。

| 状态 | 元素 |
| --- | --- |
| 已接受正文 | 除下一行以外的全部元素与关系 |
| 首条路径已装载（图中蓝底） | 服务端接入适配（`server-entry` 行） |
| 已知冲突待裁 | 无 |

出处如下。

- 分层与约束表：[系统分层](architecture/layers-and-dependencies.md#依赖关系与禁止方向)「依赖关系与禁止方向」。基础图在那里，本图只加了目标能力组的标注和「SDK 不导入服务端」一条禁止边。
- 成员标注与禁止边：[产品包组织](package-organization.md#sdk与系统接入)「SDK与系统接入」「[最小 CLI 的接入边界](package-organization.md#最小-cli-的接入边界)」。

### 单机进程

这张图回答第一版单机部署怎样组织进程。客户端进程加一个常驻服务进程已经是多进程部署。服务内部的三类 runtime 不必拆成独立进程。

```mermaid
flowchart TB
  client["客户端进程<br/>CLI · SDK"]
  moreClients["其他客户端…"]
  subgraph server["Harness Server · 常驻 daemon · 一个 Cordis 根"]
    direction TB
    subgraph layerEntry["接入"]
      entry["server-entry：治理位置 · 会话位置"]
    end
    subgraph layerGov["治理"]
      identity["identity"]
      authz["授权适配"]
      assetsWs["assets · workspace"]
    end
    subgraph layerWork["工作治理"]
      sess["session：协调器、调度器 · session-adapters"]
    end
    subgraph layerRuntime["runtime · 三类 runtime 生命周期独立；不要求一类一个进程"]
      agentRt["Agent runtime<br/>agent-host-local"]
      modelRt["模型请求 runtime<br/>model-host-local"]
      toolRt["工具 runtime<br/>tool-host-local"]
    end
    subgraph layerContext["上下文"]
      rc["runtime-context"]
      rq["request-context"]
    end
    subgraph layerState["状态"]
      st["storage：SQLite 提供者 · 会话日志 · Agent Journal"]
    end
    subgraph layerAssembly["装配"]
      boot["应用装配入口：发行层 + 运维者层插件树<br/>全部行就绪后才开始接收消息"]
    end
  end
  env["执行环境<br/>辅助执行进程"]
  provider["模型供应商<br/>经 pi-ai 传输"]

  client -->|"HTTP JSON"| server
  server -->|"fetch SSE"| client
  toolRt -.-> env
  server --> provider

  %% 以下 ~~~ 是不可见的排版连线，不表示任何关系
  layerEntry ~~~ layerGov ~~~ layerWork ~~~ layerRuntime ~~~ layerContext ~~~ layerState ~~~ layerAssembly
  client ~~~ moreClients

  classDef loaded fill:#e3f2fd,stroke:#1565c0
  classDef absent stroke-dasharray:5 3
  class entry,identity,authz,sess,agentRt,modelRt,rc,rq,st loaded
  class toolRt,env absent
  linkStyle 2 stroke-dasharray:5 3
```

| 状态 | 元素 |
| --- | --- |
| 已接受正文 | 除下两行以外的全部元素与关系。工具 runtime 与执行环境不在首条路径的发行层里（图中虚线框）。 |
| 首条路径已装载（图中蓝底） | server-entry、identity、授权适配、session 与 session-adapters、Agent runtime、模型请求 runtime、runtime-context、request-context、storage |
| 已知冲突待裁 | session-adapters 中装载的 `session-ad05` 行（K-05，见[核心四项的方向](#核心四项的方向)）。它在插件树里已装载，与方向表的冲突尚未裁定。 |

出处如下。

- 部署范围与进程组织：[部署与运行拓扑](architecture/deployment/README.md#部署环境与进程组织)「部署环境与进程组织」。
- HTTP JSON 与 fetch SSE：[系统技术基础](architecture/technical-foundations.md#共同技术选择)「共同技术选择」。
- 装配入口、插件树行与供应商适配：[应用装配](architecture/runtime/application-assembly.md#进程与装配入口)「进程与装配入口」「[插件树](architecture/runtime/application-assembly.md#插件树)」。

## 维护本页

本页的拥有者是 docs 读者入口与知识地图的拥有者。下列事件发生时，更新对应的图和状态表。

1. 出处正文改变了图中的责任、关系或标签。
2. 首条路径的插件树增加、删除或替换了行。
3. 拥有者裁定了一项冲突并写回正文。这时删除对应的待裁标注。

转换或修改图时，不增加出处里没有的框或边。新的协作关系先写进出处正文，再进本页。
