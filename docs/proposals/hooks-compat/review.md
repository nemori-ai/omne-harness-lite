# 独立评审与处置

[提案索引](README.md)

评审：architecture-reviewer（只读），2026-09-14，对象为 HUB 分支 `design/dsh-core-adoption`
提交 `ed1ef8b` 的本提案三个文件，含与 [tool-execution/cordis.md](../tool-execution/cordis.md)
的接口一致性；无比较基线。处置在同一分支的后续提交完成，mapping.md 与 README 整体重写；
"待用户"的项在 [README 新增决定点](README.md#评审后新增的决定点作者建议待用户确认)列出。

## 阻断接受

| 编号 | 发现 | 处置 |
|---|---|---|
| B1 | 命令 hook 的执行边界未落为装配准入条件；进程环境未定义；宿主进程持有的凭据与 records 文件构成跨租户泄漏路径；"无 records 写权"只在 API 层成立 | 已修：[装配与信任](mapping.md#装配与信任)新增装载条件（无沙盒映射时只有部署授予宿主级执行信任的装配者类别可载 command handler，否则 `execution_boundary_required`）、进程环境（白名单环境变量、显式 cwd、只经 stdin、无服务句柄）与措辞修正；可信类别的政策 → 决定 U1 |
| B2 | S1"受理后守卫"只有 API 形状没有协议；缺口登记错位（lifecycle.md 缺 RD-17 / SE-12 行） | 已修：新增 [S1 守卫协议](mapping.md#s1-守卫协议)（take 前内联求值、同门关闭、fail-open、崩溃重求值、只对用户 text 项、interrupt_then_run 受理准备阶段先求值）；缺口表补 RD-17（run-driver v3 行）与 SE-12 行；形状选择 → 决定 U5 |

## 应修后接受

| 编号 | 发现 | 处置 |
|---|---|---|
| M1 | Stop 续跑入队缺去重身份；`hook_continuation` 的裁决、取用重查、与用户控制的关系、计数存放未定义 | 已修：dedupKey `(RunRef, handler)`；SE-14 新行；takeTrigger 重查项；排队项撤回沿 SE-04、已取用沿 RN-03；计数为 SE-10 projection；有界性依据 → 决定 U3 |
| M2 | 提交后观察者无法向已进行的准备贡献输入；S9 触发源不耐久 | 已修：S0 与旁路 A 改为驱动器准备阶段的同步贡献者（RD-17 允许的装配改写）；S9 只映射 `session.lifecycle.changed`，删去实例 dispose |
| M3 | fail-open 范围过宽，与 TL-13"守卫缺失不能默认许可"冲突 | 已修：命令级失败沿决定 s；扩展点登记不可用 → 插件不 ready、`hooks.config.rejected{guard_unavailable}`，动态撤除先封闭准入 |
| M4 | 逐项可查有遗漏：`StopFailure`、`Stop/SubagentStop.additionalContext`、`sessionTitle`、`terminalSequence`、CX `decision: block`、`permission_mode` 映射表、`turn_id`、留候选的事件无恰一状态、配置字段表、终态到事件表、S7 在 context / queue 列的触发 | 已修：事件表补齐并给每项恰一状态；新增[配置字段](mapping.md#配置字段)、[终态与事件](mapping.md#终态与事件)、`permission_mode` 三值映射；S7 在任一列裁决后触发一次 |
| M5 | "降级"与"不支持"未区分 | 已修：文首定义三种状态；条件性降级（allow 仅在 AU ≠ allow 时）单列 |
| M6 | 程序化作答与 HD-05 的相容性需写实；应限定为工具门的 system_approval；deny message → HD-07；守卫是否在 HD-06 时重跑未说明 | 已修：on-behalf-of 措辞、限定范围、reason 映射、守卫只在 adjudicateCall 求值一次；与确认模式的交集 → 决定 U2 |
| M7 | "装配者"未精确定义；成员 / 资产失效后的重验缺失；Skill frontmatter hooks 未映射 | 已修：装配者 = TG-05 选用 / 启用操作记录的 membership revision；每次触发前重验；Skill / Subagent frontmatter hooks 首版不支持 |
| M8 | 与 tool-execution/cordis.md 的守卫返回值不一致；`PostToolBatch` 挂错站点；`UserPromptExpansion` 与 IN-01 冲突 | 已修：两处返回值统一含 `context?`；`PostToolBatch` 与 `UserPromptExpansion` 首版不支持 |
| M9 | 差异性事实应进入兼容说明 | 已修：新增[可见差异](mapping.md#可见差异)表；门 = ask 时守卫先于 HD 请求创建 |

## 建议

| 发现 | 处置 |
|---|---|
| `hooks.run.started` 改为非耐久工程观测 | 已修 |
| 一个适配器加两个配置装载器 | 已修（机制对照与 Cordis 视角） |
| 首版裁剪 `PostToolBatch`、`PermissionDenied.retry`、`UserPromptExpansion`、`sessionTitle` | 已修：均标首版不支持 |
| "下一 Run 立即开始"改为按 SE-15 调度 | 已修 |
| HK-1 证据加 S1 `suppressOriginalPrompt` 与 S8"阻止结算"两例 | 已修 |

## 转给用户的决定点

U1（宿主执行信任政策）、U2（程序化作答与确认模式）、U3（`hook_continuation` 有界性依据）、
U4（fail-closed 租户策略）、U5（S1 守卫形状）：见 README 新增决定点表，正文已按作者建议写。

## 评审未验证项的现状

- 需求快照 `18026b2` 说明未变；run-driver 场景 S20 与 tools 设计的守卫 API 正文仍是接受后
  的提供者设计修订项；HK-1 的"API 结构检查"是实现阶段义务。
- DSH `packages/hooks/*` README 未被评审员直接读取，DSH 行为依据研究笔记；本提案沿用。
