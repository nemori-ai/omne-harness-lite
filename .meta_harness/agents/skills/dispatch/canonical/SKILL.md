---
name: dispatch
description: >
  Reduce 建当前波任务、写集求交、登记 binding、写线包、演练并校验首次线消息，收口时给每条存续线发 delta 并关闭收口卡。首次派发、下一波物化、收口放行或派发恢复时加载；收件与集成用 integrate。
---

# 派发

协作规则归 `docs/engineering/integration.md`「集成节点的清单」，其中「线会话记录」「读写交叉的两类」与本技能直接相关。Reduce 的阶段、阶段内的核对、收口顺序与提问前三问归 `docs/engineering/map-reduce-states.md` 第 3 节，首次消息的派发状态归第 6 节。首次开工和恢复时先读这些节。

本技能给 PREPARE、DISPATCH 与 RELEASE_WAVE 的动作顺序。SERVE 与 VERIFY_WAVE 按 `integrate`。人只与唯一的 reduce 会话讨论设计。线开工后没有波中问答通道。反复出现的失误与防范归 `.meta_harness/human/delivery-pitfalls.md`，下面用 P 编号引用。

| 阶段 | 本技能的节 | 离开条件 |
| --- | --- | --- |
| PREPARE | 1–4 | 当前波任务、收口卡 R(w) 与 F 已建并读回，写集求交通过 |
| DISPATCH | 5–8 | 首次消息已演练、校验并打开供人转发，`integrate` 的等待已挂起 |
| RELEASE_WAVE | 「放行」 | 全部存续线的 delta 已读回，R(w) 的接受决定已读回，R(w) 已关闭并读回 |

## 1. 整理需求，定位已有卡

从有效卡、已接受正文和精确 F 读事实，不从主检出猜当前版本。人已授权且可查清的事项自行决定。向人提问前先过 `map-reduce-states.md`「提问前三问」。只把剩余的真实冲突或权限决定交人。

## 2. 建卡

按 `docs/engineering/delivery.md` 与 `docs/engineering/agent-delivery.md` 建卡，按实际 Issue 模板写本次范围、负责人、revision、条件和验收。`kind:` 唯一且与正文主工作类型一致；`line:`、`nature:`、`contract:` 用标签同步命令对齐。Project 是投影，写入失败单列，不写成成功。创建结果未知时先读回，不重复创建。

写验收时，上位正文里的每条验证义务（复杂度上界、基准、规模）都对应到一张卡和一条验收判据，或者具名推迟。卡第一次实现某条按请求执行的热路径时，验收比较第 k 轮与第 k+n 轮的代价。替身配符合性套件只证明形状，联调的代价检查另派，并指定拥有者。方法见[波段编排](references/wave-planning.md)。

## 3. 波准入

分解当前波前，按[波段编排的判断方法](references/wave-planning.md)权衡关键路径、容量、反馈时延与风险。

按 `integration.md`「不变量」核对：开工依据已接受且合入提交在 F；跨线写集不相交；契约成员只有一个写者；破坏性变更及真实消费者在具名责任内。在收口点的检出上按 `integration.md`「读写交叉的两类」运行 `scope-cli.ts`，对本波绑定求交，同线顺序任务先按线聚合。退出 1 时不开波，改分解，不降低判据。退出 0 时逐条复核 `read-overlap-frozen:` 行，写进线包。

建卡范围按 `map-reduce-states.md` 第 2 节「滚动规划与逐收口等待」。

## 4. 准备本波的 Wave

Wave 与 Project 字段沿 `delivery.md` 及工具帮助。已有 Wave 不覆写。idle 线也有当前的等待对象，不制造空任务或空 PR。

## 5. 发派发评论，写回 binding

按 `tools/dev-flow/src/delivery/README.md`「派发命令」准备 `spec.json` 与人读的 `prose.md`。分支、taskBase、route、写范围和权限由 binding 单源持有，prose 只引用。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec <spec.json> --text <prose.md> --dry-run
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec <spec.json> --text <prose.md> --out <binding.json>
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts bind --binding <binding.json> --worktree <工作树>
```

定写范围时不只看类型检查或编译的失败清单。卡要删除或改名一个形状时（类型、事件名、字段名或命令），先在全仓的 `.md` 与 `.ts` 中搜索这个形状的全部命中。代码标识之外，这个形状的中文说法与别名也要搜。搜索输出不截断，命中清单存进任务过程目录。写范围覆盖全部命中所在的成员与正文。历史记录（例如 RFC）中的命中不改。命中落在别线的写范围或另一个写者的契约成员上时，不直接并入本卡，回第 3 节改分解（P20）。

为线父卡登记一波的 attempt 时，binding 的契约变更取本波队列各卡的最高级。否则批次带破坏性卡时，`pnpm run check` 的 change-scope 会拦下。线父卡正文的「契约变更」与 `contract:` 标签同步改。每次写入后读回精确的 revision 与 attempt。结果未知时先读回，不用 `--force` 绕过冲突。

redo 也走本节：Reduce 更正输入后为任务卡登记新 attempt，再按「放行」一节的发布方法发 redo delta。

升修订也走本节。spec 的 `revision` 大于卡上「交付修订」行的值时，`post` 把这次派发当作新修订：先改写卡上的修订号行，卡上有 binding 区块时一并撤下，再发派发评论。修订号行留给 `post` 改：正文单写者只写范围改动，不先改修订号，否则 `post` 按普通派发处理，不撤旧 binding。`--dry-run` 输出的 `cardEdits` 列出每处改动，核对后再正式运行。然后 `bind` 登记新 attempt。同一分支已有工作树时，用 `worktree-cli.ts swap` 给新 attempt 换树。见 `tools/dev-flow/src/delivery/README.md`「为新修订派发」与 `tools/dev-flow/src/integration/README.md`「准备任务工作树」。

## 6. 建分支与工作树，运行 start

按 `tools/dev-flow/src/integration/README.md` 与 `worktree-cli.ts` 帮助，从 binding 的 taskBase 准备隔离工作树。已有同名分支时核对尖端，不覆盖别的执行。运行 `start` 后用 `status` 读回：issue、revision、attempt、branch、taskBase 与 binding 一致，relation 为 `current`。不手写 context。

## 7. 看板字段

按工具结果补写已获准的 Project 字段。看板写入失败时保留诊断，由有权限者补投影。看板失败不绕过 binding 或准入，也不使认领失败或成功。

## 8. 交出派发包

派发包由线包和首次消息组成。线包每波更新，首次消息只发给新的线会话。已有线会话的下一波读 delta，不重发首次消息。

1. **写线包。** 按 `.meta_harness/human/map-reduce-delivery/templates/line-pack.md` 从有效 binding、已接受依据和当前波写线包，发在线父卡上并读回。
2. **填首次消息的输入。** 模板是 `.meta_harness/human/map-reduce-delivery/templates/line-initial-dispatch.md`。先列出字段，再从有效来源写输入 JSON：schemaVersion=1、milestone 数字、line 短名、revision 数字和 fields 字符串映射。fields 包含全部列出字段，`dispatch_revision` 等于 revision。字段按模板分为六组：
   - 身份：仓库、里程碑卡、线父卡、机器与宿主、工作目录、`binding_refs`、`line_pack_ref`、唯一 reduce 会话。
   - 先加载：`prepare_commands`、`skill_source_ref`。`skill_source_ref` 写明 `docs/engineering/skills.md` 来源表里 pstack、Matt 与 ub-mode 的 revision，或指向该来源表的固定提交。
   - 长程目标：`milestone_close_condition`、`line_later_wave_plan`。
   - 方法：`line_work_kind`、`role_policy_ref`。
   - 当前分工与冻结点：当前波与收口卡、assignment 与原因、F、`wave_queue_ref`、`write_set_ref`。
   - 交回与等待：`handoff_post_command`、`wait_command`、`events_receiver_health_command`、`line_state_path`、`final_report_ref`。

   分支、taskBase 与写范围只写 binding 的引用。字段里没有占位符和秘密，也没有与 binding 矛盾的副本。

   写命令之前先运行工具的帮助或读它的实现，确认参数，不凭印象猜写（P8）。README 与实现不一致时，按冲突报告给工具的拥有者，不在消息里自己选一种写法。命令字段只放 reduce 能在本机演练的命令。`events_receiver_health_command` 只放只读的 `events-receiver-cli health` 命令。接收器的 `init` 与 `serve` 会创建 webhook、启动常驻服务，不放进消息。消息引用 `tools/dev-flow/src/delivery/README.md`「事件等待」的启动方法。

   命令代码块从行首开始，不放进列表或引用。缩进 4 个以上空格的围栏不算代码块，validate 不要求其中的命令有演练证据。
3. **生成。** render 写出 `tmp/milestone-<id>/dispatch/<line>-r<revision>.md` 并返回 sha256。同修订相同字节复用文件。内容要变时用新修订。
4. **演练。这一步不能跳过。** 在本机按目标机的同一布局运行首次消息和线包里的每条命令，包括交回命令、等待命令和接收器健康命令。健康命令用本机接收器演练同形命令。演练不向生产卡发试验记录：发布类命令用不承载交付的演练卡。把每条命令的原文、实际运行的命令、退出码与输出摘要写进演练证据 JSON，`messageSha256` 取 render 返回值。格式归 `tools/dev-flow/src/delivery/README.md`「首次派发临时消息」。
5. **校验。** 带演练证据运行 validate。缺证据、证据针对另一份消息或有命令没有证据条目时，validate 退出 2。
   - 结果里的 `nonZeroExits` 逐条列出非 0 退出码。每一条都写说明进校验记录。带 `--timeout` 的等待命令演练时退出 3 是预期结果。其他非 0 退出表示命令有错：改输入，用新修订重新 render，重新演练。
   - validate 只给 STRUCTURE_CHECKED。它不证明命令输出正确，也不等于 VALIDATED。按返回的 `remainingGuards` 逐项核对：读回 binding 与 attempt，核对目标机上的固定材料、当前收口卡与等待对象、角色策略和权限，检查秘密与矛盾副本。逐项保存证据后才记录 VALIDATED。常见格式扫描不能证明没有其他秘密。
6. **打开供人转发。** 用宿主侧边栏或 IDE 的公开操作打开返回的绝对路径。queued 只算等待展示。人原样转发；reduce 不自动发送，不替人创建会话，也不让人补设计。派发状态按 `map-reduce-states.md` 第 6 节分别记录，后一状态不能从前一状态推断。

```sh
pnpm initial-dispatch fields
pnpm initial-dispatch render --input <输入.json> --root <目标检出>
pnpm initial-dispatch validate --input <输入.json> --rehearsal-evidence <演练证据.json> --root <目标检出>
```

## 放行：发 delta，关闭收口卡

收口顺序与放行守卫归 `map-reduce-states.md`「收口顺序」。整波检查由 `integrate` 完成。之后按下列顺序执行：

1. 按真实结果调整后一波预案。继续推进时，按第 2–5 节建下一波任务卡与 R(w+1) 并读回。里程碑终态时不建虚构后继，先读回有权者的终态决定。
2. 为每条存续线写一条 delta，idle 线也写。正文按 `.meta_harness/human/map-reduce-delivery/templates/line-delta.md`，首行是 `<!-- line-delta -->`，固定项归「线会话记录」。终态时每条存续线都发 terminal delta。
3. 发布前读一遍 delta 文件：占位符都已替换，首行是标记，F 正确。生成 delta 文件的任何一步失败时都不发布，先修好再重新生成。然后用 `gh issue comment <线父卡> --repo <owner/name> --body-file <delta 文件>` 发布，读回这条评论，核对首行标记与 F。发布结果未知时，先读回线父卡，确认没有这条 delta 再重发。
4. 全部存续线的 delta 都已读回，各条的 F 一致，非终态时 R(w+1) 已建。然后 R(w) 按自身交付条件接受，读回接受决定。规则归 `docs/engineering/delivery.md`「4. 接受、取消与重开」。
5. 关闭 R(w)，读回关闭状态。守卫不满足时不关闭。
6. 收口前请其他写者暂停了往联调轨道合入时（`integrate`「收口一波」第 1 步），在同一张协调卡上用约定的标记通知对方恢复合入，并读回这条评论。

## 恢复

恢复时从 GitHub 重读事实：任务卡与 binding、派发评论、线父卡上的线包、delta 与交回记录、收口卡状态。已生成的文件不说明已打开、已转发或已认领。结果未知的写入先读回再决定，不重复发布。人请求停止时冻结新的派发与写入；STOPPED 不等于 DONE。恢复后的等待按 `integrate` 重新挂起。
