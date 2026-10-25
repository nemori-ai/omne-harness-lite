# execution-environment-host-local 的机制流程

本页给出本成员的六条机制级流程。每条有一张图和一张「失败与责任交接」表。行为以 [SPEC](../SPEC.md) 为准，图只投影它。F-EEH04 至 F-EEH06 是设计，本成员现在没有 `command` 与 `terminal` 的提供者；机制见[架构的宿主命令与终端机制](architecture.md#宿主命令与终端机制设计未实现)。

协议级流程归 [execution-environment-contract 的流程](../../execution-environment-contract/docs/flows.md)。登记表内部的获取、过门、释放与恢复归 [execution-environment 的流程](../../execution-environment/docs/flows.md)。登记协议的定义归 [execution-environment-cordis-contract 的流程](../../execution-environment-cordis-contract/docs/flows.md)。

## 流程

### F-EEH01 装载服务与宿主文件提供者

依据：[SPEC Service 实现](../SPEC.md#service-实现)、[Cordis 说明的插件与配置](cordis.md#插件与配置)。

```mermaid
sequenceDiagram
  participant A as 装配入口
  participant S as ExecutionEnvironmentRegistry
  participant R as 登记表
  participant D as filesFacilityPlugin fiber
  participant H as 宿主文件插件 fiber
  A->>A: createHostFilesDomain()，进程内一份
  A->>S: 装载 ExecutionEnvironmentRegistry
  S->>S: 校验空配置
  S->>R: createEnvironmentRegistry({ recovery, authority, bindings })，三者每次使用时现取各自的服务
  S->>S: 登记关闭效应 executionEnvironment.close
  A->>D: 装载 filesFacilityPlugin（inject executionEnvironment）
  D->>S: registerFacility(files 声明)
  S->>D: this.ctx.effect，效应落在 D 上
  S->>R: 写入设施声明表
  A->>H: 装载 createHostFilesPlugin(domain)（inject executionEnvironment，配置可带 drainBoundMs）
  H->>S: registerProvider(这个责任域的宿主文件提供者，诊断写 ctx.logger)
  S->>H: this.ctx.effect，效应落在 H 上
  S->>R: 写入提供者表
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 配置 | Service 与 `filesFacilityPlugin` 只接受缺省、`null` 或空对象；宿主文件插件另接受有限、非负的 `drainBoundMs` | 其余值校验失败，插件不装载 |
| 恢复授权 | 每次恢复操作现取 `executionRecoveryAuthority` 服务 | 装配入口装载 `ExecutionRecoveryAuthorityService` 的子类。没有装载时恢复答不可用 |
| 访问端口 | 每次访问核验现取 `executionEnvironmentAuthority` 与 `executionScopeBinding` 服务 | 装配入口装载两者的子类。任一缺席时核验答不可用，获取不发生 |
| 责任域 | 同一进程的所有宿主文件插件共用装配入口给的一个责任域 | 每次装载另建责任域会让配额和原获取查询看不到旧代的获取；责任域由进程宿主拥有 |
| 登记 | 设施声明的寿命等于 `filesFacilityPlugin` 的 fiber，提供者登记的寿命等于宿主文件插件的 fiber | 重复登记抛出，该插件的 fiber 进入 `FAILED` |
| 只装其中一个插件 | 只有提供者时落点解析返回 `missingFacility`；只有声明时返回 `noMatchingEnvironment` | 装配者两个都装 |
| 服务不在场 | 两个插件都停在 `PENDING` | 装配者装载服务 |

### F-EEH02 宿主文件使用

依据：[SPEC 宿主文件使用](../SPEC.md#宿主文件使用)、[架构的宿主文件使用](architecture.md#宿主文件使用)。对应契约设施协议里文件操作的最小调用事实，以及 [INV-EE04](../../execution-environment-contract/SPEC.md#inv-ee04-原主体在实际边界继续受约束) 与 [INV-EE09](../../execution-environment-contract/SPEC.md#inv-ee09-资源和秘密以最小必要条件提供)。本节已由 PanQiWei 接受，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。

```mermaid
flowchart TD
  A[落点已经算完] --> B{落点是否提供文件使用}
  B -->|否| R[拒绝并保持原落点]
  B -->|宿主机| C{当前授权是否点名对象}
  C -->|否或已撤权| R
  C -->|是| D{用 O_NOFOLLOW 打开路径；末段符号链接则拒绝}
  D -->|末段是符号链接| R
  D -->|路径没有对象| U[未解析]
  D -->|打开到的身份与点名不一致| R
  D -->|身份一致| E[按该操作绑定对象]
  D -->|看不到打开结果| K[未知]
  E --> F[观察与控制记下这一次请求的一种结果]
  R --> F
  U --> F
  K --> F
```

末段符号链接由打开时的 `O_NOFOLLOW` 拒绝，不再使用先 `lstat` 再打开的竞态预检。设备号和 inode 的核对发生在打开之后。核对失败不返回字节。后一次请求重新点名。上一次字节留在上一次结果里。`Shell()` 不经过这张图。

经 Cordis 装配时，这张图之前还有登记表的逐操作门：请求形状、租约是否仍接纳新操作、这次获取的账本是否已关闭、此刻的设施声明、租户一致、绑定层一致与守卫。宿主提供者不再查账本。门之后、这张图之前，这次获取的门面只把操作计入在途；门面已封闭（释放、结清或所属代退役之后）时返回 `closed`，不触碰文件系统。门的流程归 [execution-environment 的 F-EER02](../../execution-environment/docs/flows.md#f-eer02-一次设施操作过门)。

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 不是宿主层 | `rejected`，原因 `unsupported` | 落点保持为请求里的那一个 |
| 未点名 | `rejected`，原因 `notAuthorized` | 调用方按当前授权点名后用新的请求身份再请求 |
| 身份不一致 | `rejected`，原因 `conflict` | 本设施关闭描述符。关闭失败的描述符留待后续重试 |
| 路径没有对象 | 未解析 | 写入的替换模式也返回未解析，见 [SPEC 其余现行行为](../SPEC.md#宿主文件设施的其余现行行为) |
| 打开或核对后出错 | 未知 | 请求身份仍在。截断之后没写完时文件可能已变短 |
| 关闭 | 有成功回执为完成，否则为未知 | 已读到或写到的结果留在原请求上 |

### F-EEH03 卸载与关闭

依据：[SPEC 撤除顺序](../SPEC.md#撤除顺序)、[Cordis 说明的撤除顺序](cordis.md#撤除顺序)。

```mermaid
sequenceDiagram
  participant D as filesFacilityPlugin fiber
  participant H as 宿主文件插件 fiber
  participant S as ExecutionEnvironmentRegistry fiber
  participant R as 登记表
  participant P as 宿主文件提供者
  alt filesFacilityPlugin 卸载
    D->>R: 撤除 files 声明
    R-->>D: 已取到的设施对象此后返回 unsupported
  else 宿主文件插件卸载
    H->>R: 撤除提供者
    R->>R: 标为不在场，租约以 providerRetired 失效
    R->>P: retire()
    P->>P: 封闭本代获取的门面，等在途操作结束，最多 drainBoundMs，再重试名下描述符的关闭
    P-->>R: 已排空；超界为待处置，诊断写 ctx.logger
  else 服务卸载
    S->>R: close()
    R->>R: 拒新请求，租约以 registryClosed 失效
    R->>P: retire()（各提供者并发）
    P-->>R: 已排空；超界为待处置
    R-->>S: 已排空或待处置
    S-->>S: 待处置时撤除函数抛出 RetirementPending，Cordis 写入 ctx.logger，卸载照常完成
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 两个插件的卸载先后 | 不固定 | 各自独立，先后不影响结果 |
| 已交租约 | 失效，之后的设施操作返回 `closed` | 集成方释放租约。丢掉引用不是释放，获取表保留记录 |
| 退役待处置 | 撤除函数抛出 `RetirementPending`。fiber 卸载时这个错误只进 `ctx.logger`；调用方直接调用撤除函数时可以重试 | 未停的受管资源在集成方账本里，由维护者处置。宿主文件提供者没有受管资源；它的待处置表示本代某些获取在上界内没有结清（在途文件操作未结束或名下描述符关闭失败），诊断写明数目，这些操作的结果仍交回原请求；获取记录留在责任域里，之后的结清或 `maintain()` 再试 |
| 服务卸载时依赖它的插件 | 随之卸载或重跑，与 `close()` 并发 | 同一个提供者的退役共用一次 `retire()` |
| 外部效果 | 不撤回 | 已写入的字节留在文件里 |

### F-EEH04 宿主命令：门、许可与转发（设计，未实现）

依据：[SPEC 宿主命令与终端](../SPEC.md#宿主命令与终端未实现)、[架构的宿主命令与终端机制](architecture.md#宿主命令与终端机制设计未实现)。协议级流程是契约的 [F-EEC07](../../execution-environment-contract/docs/flows.md#f-eec07-命令的增量输出与终局)。

```mermaid
sequenceDiagram
  participant M as 管理端（宿主提供者）
  participant R as 资源账本
  participant S as systemd 用户 scope
  participant G as 门进程
  participant T as PTY 与命令
  M->>R: plan(坐标 unit 与 boot_id)
  M->>S: systemd-run --user --scope 启动门进程
  G->>G: 核对 /proc/self/cgroup 含自己的 unit
  G-->>M: ready
  M->>R: permit
  R-->>M: confirmed
  M->>G: GO（唯一写端，只发一次）
  G->>T: node-pty 以显式尺寸与环境变量启动命令
  loop 增量转发
    T-->>G: 原始字节
    G-->>M: base64 的分隔 JSON 帧，经私有标准输出管道
    M->>M: 有界缓冲，超出丢弃并计数
  end
  T-->>G: 退出，启动器写回执文件
  G->>G: O_NOFOLLOW 读回执
  G-->>M: 带退出码或信号的完成帧，缺回执时 failed
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 平台前提 | 用户 systemd、可用的用户管理器、真实的 Bash、GNU `env`、`stty`、node-pty 都在 | 缺任一项时报 `unavailable`，不用猜测的进程号或假后端顶替 |
| 门就绪 | 门进程核对自己在 scope 的 cgroup 里，才报就绪 | 重复的就绪使资源失效 |
| GO | 账本 `permit` 确认之后才发 GO，GO 之前不启动用户命令 | 账本已关闭时关闭 GO 的写端，命令不启动。准备超时返回 `unknown`，保留控制对象，关闭 GO 的写端 |
| 转发 | 管道写端返回 false 时暂停 PTY，`drain` 后恢复 | 非法帧、帧过大或帧 id 不匹配使资源失效 |
| 完成 | 只在收到回执时给出 `completed` | 缺回执或传输不完整时为 `failed`（`effectUnknown`） |

### F-EEH05 终端腿与回执（设计，未实现）

依据：同 F-EEH04。协议级流程是契约的 [F-EEC08](../../execution-environment-contract/docs/flows.md#f-eec08-终端腿)。

```mermaid
sequenceDiagram
  participant M as 管理端（宿主提供者）
  participant R as 资源账本
  participant B as PTY 里的持久 Bash
  M->>R: plan(这条腿) 与 permit
  M->>B: 写脚本文件，builtin source 执行
  B-->>M: 输出字节
  B-->>M: 私有转义序列 OSC 777（带腿 id 与退出码）
  M->>M: 从字节流剥出完成信号，普通 ANSI 原样透传
  M->>M: 核对 cgroup.procs 没有非僵尸残留
  M->>M: readlink /proc/<shell>/cwd 读新的工作目录
  M-->>M: 完成：退出码与工作目录
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 覆盖工作目录或环境变量 | 整段包进子 shell 并 `builtin wait`，不改写终端的基态 | 无 |
| 完成信号 | 私有转义序列只由管理端解析，不作为输出交给读者 | 重复的回执、完成后仍有数据使终端失效 |
| 残留检查 | `cgroup.procs` 没有非僵尸的残留进程，才报完成 | 确认不了后代已停时终端失效 |
| 失效 | 在途的腿以 `failed`（`effectUnknown`）结算，终端被强制停止 | 不换新 shell 假装继续 |

### F-EEH06 停止确认与冷恢复（设计，未实现）

依据：同 F-EEH04。协议级流程是契约的 [F-EEC05](../../execution-environment-contract/docs/flows.md#f-eec05-恢复授权收场与作用域释放)。

```mermaid
sequenceDiagram
  participant M as 管理端（宿主提供者）
  participant S as systemd 用户管理器
  participant R as 资源账本
  M->>S: systemctl --user kill --kill-who=all --signal=SIGKILL
  M->>S: systemctl --user stop
  M->>S: systemctl --user show -p LoadState -p ActiveState
  S-->>M: 状态
  alt inactive 或 not-found，或 boot_id 已变
    M->>R: stopped(坐标, confirmed)
  else 其他状态，或查询失败
    M->>R: stopped(坐标, unconfirmed)
  end
  Note over M: 冷恢复：recover 按受管资源的坐标核对 scope 状态，再走同样的停止与确认
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 停止 | 强制结束执行域的全部进程，再停止执行域 | 超时不取消原生操作，不丢弃原控制 |
| 确认 | scope 为 `inactive` 或 `not-found` 才报 `confirmed`；`boot_id` 变了视为不活动 | 原启动尚未隔离或尚未排空时不确认缺席。其余情况为 `unconfirmed`，保留处置责任 |
| 冷恢复 | 进程重启后，`recover` 按坐标核对 scope 状态 | 不重启命令，不重建 shell，不重授旧许可 |
| 身份目录 | 处置或清理时删除；冷清理覆盖命令与终端两类目录 | 清理经账本的 `stopped` 确认 |

## 失败与生命周期

| 情形 | 结果 | 责任方 | 依据 |
| --- | --- | --- | --- |
| 关闭失败的描述符 | 留在共用引擎里并带所属获取的标记，每次公开操作前和排空该获取时重试关闭 | 宿主文件责任域 | [架构的宿主文件使用](architecture.md#宿主文件使用) |
| 提供者代退役或被丢弃 | 责任域保留获取记录、句柄代际表和待关闭的描述符；新代仍能查询和结清它们 | 宿主文件责任域 | [SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期) |
| 进程失败 | 责任域随进程消失，没有东西证明旧名额已结清；新进程的责任域对旧代的获取键答未知。冷恢复归 [#323](https://github.com/nemori-ai/omne-harness-lite/issues/323) | 集成方据账本处置 | [execution-environment SPEC](../../execution-environment/SPEC.md#所有权失败与生命周期) |
| 重复装载服务 | 第二份在 `provide` 时失败 | 装配者 | [Cordis 说明的 isolate 绑定](cordis.md#isolate-绑定) |
| 配置不合 Schema（Service 与声明插件不是空对象；宿主文件插件带其他字段或非法的 `drainBoundMs`） | 校验失败，插件不装载 | 装配者 | [Cordis 说明的插件与配置](cordis.md#插件与配置) |
| 撤除函数抛出 | Cordis 写入 `ctx.logger`，卸载照常完成 | 装配者经 `ctx.logger` 观察 | [Cordis 说明的机制读数](cordis.md#机制读数与假设) |
| 获取账本已关闭 | 登记表的门使这份获取的文件操作返回 `closed`，不调用宿主设施 | 集成方 | [execution-environment 的逐操作门](../../execution-environment/SPEC.md#租约视图与逐操作门) |
| 退役时有在途文件操作 | 等它们结束，最多 `drainBoundMs`；超界为待处置，诊断写明数目 | 宿主文件提供者 | [SPEC 宿主提供者的事实](../SPEC.md#宿主提供者的事实) |
