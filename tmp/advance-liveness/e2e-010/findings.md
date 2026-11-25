# 实测发现（真部署 875d696cb）

## F1 失败一轮的输入被下一轮拆成单独一步重答
- 复现：会话 `s2b.session`。甲（成功）→ 租户密钥换成无效值 → 乙（`model-failed/credential/http-401`，失败）→ 恢复密钥 → 丙。
- 实然：丙那一轮 2 次模型调用，第一步只回「乙」，第二步回「丙」。会话 `s2.session` 第 130–162 条同样出现两条「好」。
- 应然对照：CAP-SW05「每轮开始时把当时已收到的普通消息一并接走，不漏不拆」；CAP-SW09 失败是终态。要么失败那轮的输入不该再被处理，要么应和新输入同批接走，不该拆成两步、多付一次调用。
- 证据：`omne read-session-diagnostics --session $(cat s2b.session)` 的 run_026bd965… `model calls: 2`。

## F2 发行装配里两行是 S0 替身
- `session-ad11`（AD-11 空闲输入）、`session-ad15`（AD-15 作用域释放）在 `serve.distribution.json` 里是 `stubPlugin`，启动结果 `s0-double: 2`。
- 影响待测：会话级环境回收（EE04）、空闲输入相关路径。

## F3 新会话缺省权限模式是 bypass-permissions
- `coding` 定义的新会话 `session.modes.permission = bypass-permissions`，`inquiry.policy.onAsk = skip-ask`。是否符合产品缺省待对产品正文。

## F4 Web 搜索缺 Exa 密钥（负责人确认搜索可用，非缺陷，仅本机缺密钥）
- 清理前保管里有一把非 OpenRouter 的密钥（多半是 Exa），`.env` 里没有，清理后丢失。Web search 只能测到 `unconfigured` 的如实答复。

## F5 `calls show --call b2` 在调用离开后台清单后答 `denied`
- 规格（apps/cli SPEC「调用命令」）：短号找不到退出 3。实然：发出请求、服务端答 `denied` 且 body 为空。用完整调用引用能读到（terminal interrupted/control）。

## F6 Files 的 edit/patch 差异不是最小差异
- 把 `two` 改 `TWO`：差异 `@@ -1,4 +1,4 @@` 三行全删再全加；文件只有三行（末尾换行），头里算成 4 行。模型因此误以为「整文件被重写」。会话 `s3b.session` #129/#152。

## F7 Web fetch 丢掉页面 `<title>`
- example.com 的 `<title>Example Domain</title>` 不在返回的 Markdown 里，模型只能凭记忆说标题。

## F8 `never` 模式下的拒绝结果不说原因
- 工具结果只有 "The tool call was denied by a rule or a prohibition and did not run."，不说是权限模式 never、哪项权限。模型只能自己推断。对比「本次不放行」的结果写明了是人没批准。

## F9 三轴模式只开放了一轴
- 会话协议操作里只有 `read/change-permission-mode`；协作方式（co-work/auto-drive）、执行环境模式没有任何读写入口，执行环境只有 `local`。旅程 26「分别调整三件事」接不通，CAP-SW10 只覆盖权限一轴。

## F10 卡在等人时没有提醒
- 两个会话各有待答卡时，`notification list` 为空。旅程 25「我收到提醒」与 CAP-HI09「让有资格的人知道有问题在等他」在 CLI/通知侧没有体现；桌面端徽标待核。

## F11【严重】归档时有后台调用在跑，撤销归档后会话永久卡死
- 复现（稳定，两次）：coding 会话后台跑 `sleep 200` → `archive-session`（后台调用被撤、进程真停）→ `unarchive-session` → 发一句。新一轮 `run.started` 后 `not ended`、0 次模型调用，一直不动。
- `cancel-run` 能收掉这一轮（cancelled），但再发一句又卡死；重启服务端也救不回。会话 `s6b.session`、`s3.session`。
- 对照：没有后台调用的会话归档再撤销，下一轮正常（`s6a.session`）。
- 另：归档、后台调用被撤在会话历史里没有任何条目，事后看不出发生过归档。
- 归属：#1612 验收的「已转后台时归档……下一轮能启动」，当前头仍不通。

## F12 强杀那次的模型结果投递每 30 秒报 receipt-mismatch
- SIGKILL 一次模型流之后，服务端日志反复 `model result push: a push failed (receipt-mismatch)`、`a delivery stays unknown after its redeliveries`、`cleanup stays pending (blocked)`，重启后仍在。会话侧那一轮已正确收场为 runtime-lost。

## F13 强杀中断的工具调用被记成 failure 而非效果未知
- `tool runtime-lost failure: the execution continuity is lost; the call was not run again`。不重跑是对的；但命令其实已经写了一半（k2.txt 有 start），结局写 failure 容易被读成「没发生」。CAP-SW15/TL11 要求查不到就保持「未知」。

## F14 MCP 连接超时不写单位，填小了报成「连不上」
- `connect-timeout` 的声明只说「建立连接最多等多久」，取值按毫秒读。填 10 就是 10 毫秒，`mcp refresh` 答 `failed: the endpoint could not be reached`，对端一个请求都没收到；改 10000 后立即 `published`。原因应报超时，声明应写单位。
- 同时：只登记、没填地址与凭据时 `mcp list` 已显示 `USE usable`。

## F15 MCP 动作瞬间完成也先答 pending，模型只能睡一觉再读
- `Tools execute` 调 MCP 的 echo、bump，结果都先是 `{"state":"pending","reason":"waiting"}`，模型再 `read_result`；slow 时模型用 `Shell sleep 15` 等，多一次工具调用与一次模型往返。会话 `s7.session`。

## F16 MCP 放行卡的关口名是英文
- 卡片「关口：Call an action of this endpoint」，设置里同一项是「调用这个接入点的动作」；同一卡片其余文字是中文。

## F17 agent 发布 Skill 不需要人点头
- agent 用 Files 写目录、`OmneExtensions publish` 发到租户名下，全程没有卡片。设置里 `tool OmneExtensions change` 缺省 `auto`，所以即使会话是 `auto_permission` 也不会问。CAP-SK11 与 CAP-META-03 写「每次提交要人点头」。另：`Skills` 本身没有提交命令，提交走的是 OmneExtensions，与正文「经 Skills 提交」的说法不一致。
- 发布后同一轮 `Skills search/read` 立即可见并能跑脚本（REV:olleh），这一半成立。

## F18 被拒的系统命令在历史里与成功的一样
- `/model no/such-model` 当场答 `invalid: unknown-name`，但历史里留下 `session.command-recorded {"name":"omne-official:model","args":"no/such-model"}`，与成功的 `/model …` 同形，事后看不出被拒；成功的切换也没有「已切到某模型」的结果条目。

## F19 没有主动压缩命令
- 发行系统命令只有 model、permission、archive。旅程 16「用户也能主动触发」压缩、旅程 30 点名的「触发一个系统流程（如主动压缩）」都没有入口。

## F20 Skill 搜索与读取不标来源与层；官方 Skill 搜不到
- 工作区会话里 `Skills search` 列出 haiku-counter、text-reverser、ws-skill，结果不带层（官方/租户/工作区）与来源路径，模型说不清来自哪；`asset list skill` 显示的官方 `skin-authoring`（enabled）不在 agent 的搜索结果里。官方那一半即 #1627，修复 #1635 未合入。

## F21 工作区的提示词命令用不了
- `.omne/prompts/ws-hi/PROMPT.md` 在工作区会话里发 `/ws-hi` 答 `invalid: no such command`。SPEC 写「工作区那一层只在会话的一轮里有」，而受理在一轮开始之前，于是从输入框永远点不到工作区命令。

## F22 写坏的工作区 Skill 被静默跳过
- `.omne/skills/bad-skill/SKILL.md` 没有头部：搜索不出现，也没有任何报错、提醒或诊断指出是哪个文件、什么原因。旅程 34 要求「配置写错时装配失败，指出是哪个文件、什么原因」。

## F23 工作区约定目录没有 MCP
- 约定命名空间只有 skills、prompts、tools、agents、loop-extensions。旅程 34 与 CAP-WS08 提到的「仓库里的 MCP 自动装配」没有落点；第三方 `.claude/skills` 也不读（CAP-WS11 未实现，旅程 35 不通）。

## F24【严重】提醒型安排到点后永远受阻：发行装配缺通知承接者
- 复现：CLI `schedule create` 一个每分钟的提醒（cron `* * * * *`，purpose reminder），17:32 到点后 `standing: blocked`，`reasons: ["carrier-missing:notification"]`，`next` 一直停在 17:32，收件箱为空，历史只有 create。
- agent 建的「工作日 9 点写日报」提醒（schedule 66409062…）同样是提醒型，按同一原因明早 9 点会受阻。
- 旅程 41「到点后……做完通知我」、CAP-SJ03/SJ08/NO05「提醒型安排到点点名发送」在发行树上不通。
- 根因（读码核实）：`apps/harness-server/src/rows/schedule/carriers.ts` 提供 results/programs/executors 三个登记面，但全仓没有任何发行组件调用 `results.register`；`programs.register` 只在 `apps/harness-server/src/lab/programs.ts`（实验室入口）里。发行装配缺通知承接者与任何程序，提醒必受阻，程序型作业（CAP-SJ00/SJ06 的 program 承接）也无从发起。

## F25【缺口】agent 型安排建不出来
- agent 按旅程 41 建「3 分钟后在专属会话里跑 date 并通知我」：结果出口要发布提供方，系统里一个都没有；改用 `returnTo` 只回「不构成有效调度」，不说哪个字段不对。即 #1636/#1566 未交付的部分。
- 另：agent 不知道日程有「按日历跳过/顺延到工作日」的条件，用 cron `0 9 * * 1-5` 加手填 16 个 2027 年排除日顶替，2027-12 之后会在假日照常提醒。

## F26 CLI 子命令没有帮助
- `omne calendar --help`、`omne schedule … --help` 都答「unrecognized arguments」；参数名（`--date`、`--definition-file`、`--schedule`）只能读源码得知。

## F27【缺口】组织层设置与锁定没有写入口
- 资产协议 `set-setting` 只写行事租户自己这一层；读侧有 `lockedBy: organization`、`prohibited by organization`，但没有任何操作能写组织层的值、上界或锁。团队管理员（super-admin）也做不到。旅程 47、CAP-AR05「上层可以锁定」、CAP-AR09「各层可以配值、覆盖或锁定」接不通。
- 同属多人一线：资产复制、分享、人工提升（旅程 48、CAP-AR12/13/14）与组织隶属（CAP-ID04）都没有任何入口。

## F28 语音转写交给模型时不说它来自语音
- 发 wav 给 Haiku（不收音频）：系统转写成 "The secret word is pineapple." 交给模型，但模型答「没有收到语音附件，只收到一条文字消息」。转写没带「这是某段语音的转写」的来路标记，模型无法如实告诉用户它读到的是什么（CAP-ME05、旅程 4 的后半句）。PDF 同样转成文字加渲染图，模型能说清。

## F29 秘密保管文件写回后是 0644
- `~/.local/state/omne/model-vault.json` 存着部署与租户的全部秘密（模型密钥、MCP 凭据），`setting set` 写回后权限 `-rw-r--r--`；只靠父目录 0700 兜着。`session-cursor-signing.key` 是 0600。日志与其余状态文件里没有发现任何秘密明文。

## F30 Shell 常驻终端用不了
- `Shell create_session` 两次都 `rejected … reason=unavailable`，同时 `Shell info` 说环境支持 terminal。CAP-META-05「开多个各自保持状态的终端会话」不通，agent 只能退回一次性 execute。

## F31 非法时区被收下，之后日历全部 basis-unavailable
- 桌面端设置页把时区改成 `Mars/Phobos`，答「已写入」，生效值即变成它；随后 `calendar environment`、`calendar day` 全部 `basis-unavailable` 且不给原因（日程预览同受影响）。设置项声明说「IANA 时区名」，但写入时不校验。复原：改回 `Asia/Tokyo`。

## F32 取消一轮后已流出的回复整段消失
- 桌面端写长文时点「停止」：已经显示出来的两百来字回复整段不见，只剩「这一轮已取消」。模型侧已记 interrupted 并有真实费用，人却看不到花钱买到的那一段。

## F33 桌面端失败的一轮不显示成因
- 对话页只有一条红色「这一轮失败了」标记，不可点、不展开，看不到成因（服务端诊断里明明有 `model-failed/credential/http-401`）。CAP-DA06 要求「一轮失败后显示成因、没处理的消息的条数与两条出路」。

## F34【严重】开发目录不存在时，租户的 plugin 清单整个不可用，皮肤穿不上
- 部署配置给 plugin-access 设了开发目录 `~/.config/omne/plugins`；清理时这个目录被删后，服务端对每次 `plugin/v1 list-wanted` 都答 `basis-unavailable`（日志 1384 条警告），客户端 `observe-wanted ended: not-sent`。
- 后果：资产里已发布、已启用的皮肤（skin:sea）也拉不到，皮肤页的「在用的皮肤」选择控件不出现；负责人自己的窗口里写的皮肤同样装不上。一个可选的开发目录缺失，不该让租户持有的全部 plugin 不可用。
- 处置：建回空目录、重启负责人窗口后警告停止。另：清单写了空的 `server: {members: []}` 的皮肤能发布，与拒绝提示「leave server out」不一致。

## F35 老花字号下侧栏会话列表几乎被挤没
- 窗口 1280×860、字号「老花」时，侧栏导航与底部按钮占满高度，会话列表只剩一条细缝。

## F36【严重】一个租户读得猛，另一个租户的推进就卡住（存储队列无隔离）· 已提 #1640
- 我的压测脚本每 2 秒对一个 1500 多条的会话拉两次整份历史（同时还有一个约 60 万 token 的长会话在读）。期间负责人租户的一轮在 step-1 反复「agent run waits for a dependency」：`sessionAccessCheck … membership-unavailable:queue_full`，以及 `meter … @omne-harness/pi-ai-anthropic source-unavailable`，模型请求一直发不出去，界面上看就是卡住。停掉压测后 `queue_full` 不再出现。
- 脚本本身轮询过猛是我的问题；但产品侧暴露的是：存储请求队列各租户共享、没有公平排队或配额，单个租户的读压能饿死别的租户；推进方只按退避等，人看不到原因。
- 同类：压测期间 `read-session-diagnostics` 偶尔答 `basis-unavailable`，`asset create` 一次答 `basis-unavailable`（重试成功）。
- 后续（#1640）：负载解除、服务端重启后，负责人那一轮仍报 `meter … pi-ai-anthropic source-unavailable`，之后不前进、不收场、无日志，模型调用数停在 98。校准计量对历史每次调用逐一读账目，任一次答 unavailable 即整次失败。

## F37 循环拓展件：写法说明缺 subject 结构；否决理由传不到模型；重发布那一刻的一轮卡死
- agent 照 `OmneExtensions help` 写的拓展件，因说明里没写 `subject` 的结构，按 `script` 键去找参数，实际参数包在 `entries` 里（应读 `effectiveArguments`），于是从不否决。改脚本后否决生效。
- 否决生效时，工具结果只有 "The tool call was denied by a rule or a prohibition and did not run."，拓展件写的理由与拓展件的名字都没到模型和人眼前；会话诊断里也看不到拓展件的调用记录（CAP-AG05 要求原参数与改写都留记录）。
- 重新发布拓展件的同一时刻新开的一轮，`not ended`、0 次模型调用，永久卡住（之后新开的会话正常）。另有一次 `asset create` 答 `basis-unavailable`，重试成功。

## F38 强通知进了 agent 的收件箱，但不叫醒它
- 会话 s20 的 agent 用 `Notifications subscribe` 订阅 `agent.posts/post`（scope all，strong），另一个会话的 agent 发一条 `wake-1`：发送方答「收件人有你本人和一个 agent」，s20 的 `inbox` 里也有这条（strong）；但 s20 没有任何待处理输入、没有起新一轮，直到我手动发消息它才看到。CAP-NO11「强通知成为它会话里的一条输入并叫醒它」不通。
- 另：订阅相关命令（subscribe/subscriptions/unsubscribe）已存在，路线图对 CAP-NO09 的「未见生产证据」已过时；`scope` 必须是对象，模型第一次传字符串被拒后自行改对。

## F39 Skill 依赖的工具不在时，搜索与读取都不说
- 发布 `needs-browser`，`.omne/skill.json` 声明依赖 `{"category":"tool","name":"Browser"}`（发行版没有 Browser）。agent `Skills search` 与 `read` 的结果里都没有「缺 Browser、不可用」之类的说明，模型只能自己对照工具清单猜。CAP-SK04「缺什么写在搜索结果与读取结果里」不通。
- 另：`.omne/skill.json` 少了 `formatVersion` 时发布只答 `declaration-format-unsupported`，不说缺的是 formatVersion（代码里有 detail「formatVersion is not 1」，没透到 CLI）。
