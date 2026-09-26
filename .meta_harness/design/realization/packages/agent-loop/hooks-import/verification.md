# hooks-import 验证与证据

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。契约层的证据状态归[契约验证入口](../../../../spec/capabilities/hooks-import/verification.md)。**源码不存在、fork 未做，本节点没有任何实现层的证据。**

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| `capability.hooks-import/v1#S-29` 一条都不丢 | 单元测试：`importHostHooks` 对契约给的那份配置恰出七项、理由各自说清 | 未开始 | 本节点；有实现即可跑（纯函数，不受阻） |
| `#S-30` 写坏的 matcher 让整份失败 | 单元测试 | 未开始 | 本节点；同上 |
| `#S-34` 工作区来源导入即禁用 | 单元测试（报告那一半）＋ 落地之后的场景（「启用之前不被调到」那一半） | 未开始；后一半**受阻**于落地（契约 G-8、HI-N5） | 本节点 ＋ 资产治理 |
| `#S-35` 重新导入是新版本 | 单元测试：同路径两次导入 name 一一相同；插入一条后序号对上 | 未开始 | 本节点；有实现即可跑 |
| `#S-31` 允许不是放行 | 场景测试：真实 runner ＋ 真实执行器 ＋ 起得来的执行环境 | 未开始；**受阻**：本版 fail-closed（HI-N1 ①：拓展件子进程的宿主机允许，execution-environments G-3，账本 ⑭），另挡在工作目录的来路（HI-N7）、解释器取证（HI-N8）、runner 的会话日志最小提供者（RUN-N1）之后 | 本节点；阻断闭合后 |
| `#S-32` 兼容件挂了的各支（含改成 `veto` 一支、句柄在起子进程之前解析不出一支、解释器在而脚本不存在一支） | 场景测试，故障注入（超时、退出码 1、解释器不存在、脚本不存在、句柄解析不出）；各支的期望值照契约 S-32 与 S-19，本页不复述；解析不出那一支断言子进程没起、没落到宿主机 | 未开始；子进程真跑的几支**受阻**同上。「起不来」那几支在单元级先跑：交不出工作目录（契约 G-15）、句柄解析不出、`startProcess` 答 `noLanding{hostNotAllowed}`（**本版每一次的真实行为**）、`startFailed{programNotFound}`——断言子进程没起、记录带 `unavailability: skip`、看得见；launcher 端口按 `capability.execution-environments` v1 S-13 的答复分法写 | 本节点 |
| `capability.loop-extension-runner/v1#S-51` 的兼容件一支（运行被取消） | 场景测试：兼容件的子进程跑得很久时叫停；断言子进程组被停下、那一件没有任何记录、执行器没交结论 | 未开始；**受阻**同 S-31 一行。「中止即停进程组、以已中止拒绝」经 `runHostHook` 与一个按 execution-environments S-13～S-15 写的本机进程组 launcher 在单元级先跑 | 本节点 ＋ runner 节点 |
| `#S-33` 来源产品的 ask：四档卡不带授权、回放不重跑（以子进程被调用次数为准） | 场景测试 | 未开始；**受阻**同上 | 本节点 |
| `#S-36` Stop 的续跑状态从日志数（两次之间停机重启） | 场景测试 | 未开始；**受阻**同上 | 本节点 |
| `#S-23`、`#S-24` 两张映射表 | 逐行测试：每个事件的位置、维度、情形、上限、退出码 2、阻断与停止的译法与契约表一致 | 未开始 | 本节点；有实现即可跑 |
| `#S-26` 第 2 行、P-11 前提：请停未确认不挂起（D-040 §八 M64） | 单元测试：launcher 端口对停进程组答 `notConfirmed`、答 `environmentsWithdrawn`、缺席三支；断言执行器当场按报错交回、`error` 为「已请求停止、未确认退出」，没有挂起的 Promise | 未开始 | 本节点；有实现即可跑 |
| `#S-26` 第 2 行（超时后确实停下） | 集成测试：起一个忽略 SIGTERM 的子进程组，超时后整组退出、结论按契约 S-19 超时那一种情形归类 | 未开始 | 本节点；有实现即可跑（`runHostHook` ＋ 本机进程组 launcher；经 `executionEnvironments` 最小提供者的同一条另受 HI-N1） |
| N-37 ⑩ 四处（[design 起、限时、停](design.md#一次被调到的子进程起限时停)） | ① **带租户**：单元测试断言 `startProcess`／`processOutcome`／`stopProcessGroup` 三次都带 `resolveTenant` 解析出的那个租户，原生输入里没有租户标识；② **解释器写成 `program`**：`buildLaunch` 对两家各一条带管道与引号的命令，断言 `program` 是那一家的解释器、那一行命令原样作一个参数（不被拆、不被插值）；③ **交全环境变量**：据点环境里放一个清单外的变量与一个清单内的变量，断言子进程只看得到后者、看不到来源产品导出而本项目给不出的变量（契约 S-18 第 3 条第 3 项）；清单里没有程序搜索路径时起不来（`programNotFound`）而不是报错；④ **结果之后停组**：hook 起一个后台孙进程后正常退出，断言拿到结果之后组被停、孙进程不在；停组答 `notConfirmed` 时结论照交、记 error 日志、组留在在途集合、撤除时再停 | 单元测试（①②）＋ 本机进程组的集成测试（③④） | 未开始；②的解释器那一格等 HI-N8 取证 | 本节点 |
| fail-closed（execution-environments G-3，账本 ⑭） | 单元测试：`startProcess` 答 `noLanding{hostNotAllowed}` ⇒ 每一件兼容件「起不来」、按声明 `skip`、记录看得见，**没有任何分支回退宿主机或直接 `spawn`**；结构检查：执行器包内不 import 起进程的宿主 API（起进程只经 launcher） | 单元测试 ＋ 结构检查 | 未开始 | 本节点 ＋ `tools/ts-checks` |
| 公开函数面（[design 的公开面](design.md#公开面)） | 单元测试：不装 Cordis、不给 runner，`toHostInput`、`buildLaunch`、`fromHostOutput` 逐格对映射表；`runHostHook` 以一个脚本化 launcher 跑通超时、中止、退出码 0／2／1／127 各一次，归类按契约 S-19 | 未开始 | 本节点；有实现即可跑 |
| 配置错误同一政策 | 单元测试：`hookEnvAllowlist` 缺席或不是名字列表 ⇒ 装配启动失败；形状按 execution-environments S-13 的 `EnvAllowlist`（可空、每个名非空），与桥 `stdioEnvAllowlist` 同一校验 | 未开始 | 本节点 |
| D-033 区分实验 | 在钉住副本上做完提案列的四处改动后量改动行数 | 未开始（HI-N4） | 本节点；实施第一步 |

## 实际执行

没有。本契约不选用形式工件，本节点没有源码。

## 覆盖缺口

- **没有任何证据**：全部义务未开始。导入那一半、映射表与互译是纯函数，有实现即可测；兼容件被调到的全部场景**本版 fail-closed**（HI-N1 ①，产品问题，账本 ⑭），另挡在工作目录来路（HI-N7）与解释器取证（HI-N8）之后；「起不来」各支、中止即停、未确认不挂起可经 `runHostHook` 与本机进程组 launcher 先跑。
- `bindings.yaml` 为空，与本页一致。
- **经执行环境最小提供者的停与确认退出**（超时、撤除、取消三种来源）要等那个节点（`execution-environments-host`，已立）建包，且在验收装配里由种子件给出宿主机允许（产品装配里 G-3 未闭合）；本机进程组 launcher 只证执行器这一侧的次序。「停进程组的请求有界答复」由 `capability.execution-environments` v1 S-15 ④ 承诺，本节点没有证据覆盖它（归那份契约的场景 S-22）。

## 独立评审

2026-09-25 本节点（修复波 3 对齐之后）随 N4 批经一次独立的架构评审（只读结构核对，无运行）：建议 1，总判可进 G5；主线据此裁定 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M64。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| H-1（建议） | 请执行环境停进程组而它缺席或不答时，「等确认退出才算停下」与「确认不了只记日志」合起来没说执行器是挂着不返回还是返回报错 | 按 M64：当场按报错交回（`error`：「已请求停止、未确认退出」）、不挂起；子进程留给执行环境（C-7）按进程组善后；「停进程组请求有界答复」写进 HI-N1 闭合条件 | design.md「起、限时、停」的「停」一条；inject 表 `executionEnvironments` 行；装配给表第 2 行；装卸表在途子进程集合行；HI-N1；本页证据义务新增一行 |
| 反证清单 1～3 | 区分实验或许可翻向全自写；PF-005 把起子进程收归执行环境宿主；`data.loop-extension` 给 `command` 一条 runner 自驱的执行路径 | 照录为改选条件，本版都未触发（前一条即 HI-N3、HI-N4） | 本表 |

## 修订波（2026-09-25 公开面）

依据：[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ⑧⑩。本波只改节点；契约侧（S-18 改指执行环境接口）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-043 R-2 | 新开「公开面」：`importHostHooks`、映射表、`toHostInput`、`buildLaunch`、`fromHostOutput`、`runHostHook`（`launcher` 端口）；落点、回放、撤除停子进程列为函数层不承诺；登 HI-N9 | design.md「公开面」、HI-N9；README；本页函数面一行 |
| 执行环境接线 | `capability.execution-environments` v1 S-13～S-15、S-17 | 投影表、S-18／S-19 行、inject 边、起限时停、装配给、依赖表、失败映射逐值落到它的答复上；HI-N1 改写为「接口已定、真承接者未到；本版 fail-closed」 | design.md 对应各处；HI-N1 |
| 四处（N-37 ⑩） | execution-environments S-13 ③、S-14、S-15；消费者核对 | ① 起、等、停都带租户（经 runner `resolveTenant`），租户不进原生输入；② 解释器写成 `program`（解释器取证登 HI-N8）；③ 环境变量恰是 `hookEnvAllowlist` 从据点环境取的值（新配置项，取舍表，缺席即启动失败）；④ 拿到结果之后停组，`notConfirmed` 时结论照交 | design.md 投影表、S-17 行、起限时停、关键选择表、装卸表；本页 N-37 ⑩ 一行、配置一行 |
| fail-closed | execution-environments G-3；账本 ⑭；N-37 ⑧ | 闭合前 `startProcess` 恒 `noLanding{hostNotAllowed}` ⇒ 全部兼容件起不来、看得见；不回退宿主机 | design.md S-18 行、起、HI-N1；本页 fail-closed 一行 |
| 新发现的缺口 | 起草时推导 | 工作目录没有来路（HI-N7）；解释器是上游语义、待取证（HI-N8） | design.md HI-N7、HI-N8；报给主线 |
| 对齐契约侧提交（`f0998468`） | 契约 S-18 第 3 条第 2、3 项，G-15 | HI-N7 改指契约 G-15（交不出工作目录即起不来、不拿据点当前目录顶上），失败映射与 S-18／S-19 行加这一支；环境变量删去「方言规定的变量」，改为来源产品导出而本项目给不出的不造；HI-N8 改为契约引研究原文的待核对主张（basis 无条目） | design.md 起限时停、失败映射、HI-N7、HI-N8；本页 S-32 行、N-37 ⑩ 行 |
| 退出码非 0 非 2 的收场（主线 2026-09-25 裁定） | 主线裁定：按来源产品退出码映射，非阻断错误记录、不否决、继续；契约 S-19 第 4 行与表下第 1、2 条 | **两者相左，节点不二选一**：登 HI-N10，`fromHostOutput` 那一格与导入标注不实现、S-32 与公开函数面对应支的期望值不写；本版因 G-3 fail-closed 不会走到 | design.md 失败映射表下、S-19 行、HI-N10；本页 S-32 行、函数面行、覆盖缺口；报给主线 |
| 两份白名单同一形状类型（主线 2026-09-25 裁定） | 主线裁定：`hookEnvAllowlist` 与桥 `stdioEnvAllowlist` 两个配置项、同一形状类型，由 execution-environments 定一次 | 关键选择表、配置政策写明；那份契约尚无此类型，登 HI-N11 | design.md 关键选择、配置政策、HI-N11；本页配置一行 |
| 对齐契约第二轮（`47e36d14`）：退出码 | 契约 S-19（非 0 非 2、含 127 为非阻断错误）；`capability.loop-extension-runner/v1#S-13` | HI-N10 闭合；失败映射、S-19 行、`fromHostOutput` 行改为引 S-19 与 runner S-13、不复述归类；超时的归类同样只引 S-19；S-32 与函数面两行不再挂期望值受阻 | design.md 公开面、S-19 行、失败映射、起限时停表、HI-N10；本页 S-32 行、函数面行 |
| 对齐契约第二轮：`EnvAllowlist` | `capability.execution-environments/v1#S-13` 表下 `EnvAllowlist` 一条 | HI-N11 闭合；`hookEnvAllowlist` 的校验与取法改指那一条（可空、每个名非空、不补空值） | design.md 配置政策、关键选择、交全环境变量、HI-N11；本页配置一行 |
| 对齐契约第二轮：`args`／`shell` | 契约 S-14 ⑦、G-16 | 带这两个字段的 CC handler 导入即 `skipped{no_mapping}` | design.md S-11～S-15 行 |
| 最小提供者节点互指（主线 2026-09-25） | `packages/infra/execution-environments-host`、`packages/session/session-tenancy-table`（candidate） | 起子进程四件事落在 `execution-environments-host` 的 S-13～S-15 上；拓展件子进程的宿主机允许来自它的可选读面 `executionPlacementReadings`，缺席即 `noLanding{hostNotAllowed}`、验收由种子件给；HI-N1 ③ 删去、改为「真承接者未到，最小提供者节点已立」；依赖表、装配给表同步 | design.md 起限时停段首、起、依赖表、装配给表、HI-N1；README |


**2026-09-26 裁决对账**：[D-044 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 已允许 hooks 子进程落宿主机，取代此前「产品未允许」的前提。现行未完成项是 EE G-3 的允许读面接线与 HI G-15 的工作目录、变量名单来路；缺席时仍按契约拒绝。以下历史评审记录按当日事实保留；本次不登记实现或验证完成。
