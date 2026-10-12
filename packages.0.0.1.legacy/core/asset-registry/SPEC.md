# Asset registry behavior

公开形状、值读和纯构件归 src/index.ts；正式抽象 Service 及键 assetRegistry 归 ./cordis。Service 提供 fill、reload、refreshAvailability、lookup、list、markFailed、onAssetChange 七操作；提供者选择只归装配。纯根不加载 Cordis。求值复用 [asset-evaluation](../asset-evaluation/SPEC.md)，耐久构成归 [assembly-manifest](../assembly-manifest/SPEC.md)，不建立第二个求值算法或登记库。

纯表构件、正文选择及记录读取接受调用方提供的 `AssetEvaluator`。同一装配可共用其编译结果，但每次仍校验完整实际输入。省略该参数保留独立值函数的现行行为，不创建进程级作者 Schema 缓存。

## 表、依赖与报告

六张表按类别过滤 caller 显式给出的 compositionOrder；它须为组合的精确无重复全排列，不含根，不从集合编码猜顺序。删除保持相对次序。已知八类中的 connector/agent_definition 是 categoryNotRegistered，八类外 invalidInput。每 session/category 一份当前不可变快照；替换造新快照，不原位修改。多表全成全败，单次 MF append 确认后才可见。MF 是构成唯一耐久源；同会话队列不替代存储裁决。

每个依赖均需自己的在场／自报可用提供者，没有可选、或、部分可用。先工具后技能，技能 tool 依赖须本次 available。读不到 provider 是 unreadable，不是 missing。工具／技能不可用仍给同名同形替换件，只换说明、不增删条目；其他类不原位替换。可用性不持久、不改构成，也不代替 admission。

存储依赖还需可读回工具；调用端模态需模型输出支持，结果端需模型输入支持或已登记转换器，unknown 不放行。multi 工具可用才列全命令可用性。Ask.request_approval 在 never 或模式不可读时关闭，Ask 门本身不关闭。缺少这些真实源时保持不可用，不能推造事实。

报告绑定真实 session/runId/attempt 和每表 filledAt；条目、可用性、MCP 动作／持有／执行权限按尝试钉住，skill 门控按整个 run 钉住，continue 原样带上。崩溃丢报告后同 runId 再 start 重判是当前限制，不是完整跨恢复保证。effectivePermissions 键恰为本次工具可读模型面名字；普通工具用同次新鲜求值，可信部署 meta 门恒 auto、tenantAutoWritable=false。已在表但当次组合无能力为 not_in_composition；同标识退回官方用退回资产权限，旧 content 到 reload 才变。求值不可读 unavailable，不补作者默认。

完整 MCP 分支的承诺是：先求当前持有／门控，再由桥钉动作，只加该动作集作第二次求值；无动作集复用第一结果，无有效持有不调桥／借旧持有／造权限键。通常第二次求值读不到只使非 meta 权限不可用；第一次失败或真实 C16 失配使整个操作失败且无报告。**当前此完整分支未实现**：buildReport 给 mcpActions=[]，readReport 拒非空；不得用空动作报告宣称已完成桥集成。

完整分支须保持桥的五种结局，不把它们合为空动作：成功副本逐动作及 endpoint 行 available，桥标仅替换件的动作仍 stand_in；判定失败 endpointUnreachable/credentialUnavailable/oauthRequired/protocolError 若带历史 fetched 副本，依原形投影 stand_in，endpoint unavailable；从未 fetched 则无动作，原因同时给未取得和失败；dependencyUnavailable/bridgeWithdrawn/invalidInput 无结论且无副本则无动作，endpoint 原因区分读不到和输入缺陷；无当前生效持有不调桥、无动作，endpoint unavailable 且持有报告明确没有。桥 excluded 动作不进表，每动作 resident=false，不持久；名字由桥给，冲突 toolNameConflict。动作条目的 capability、asset、from 取本次接入点持有，content 是桥给出的 tool 正文。结果端任意，动作依赖不套普通结果模态约束。

availability 在 fill、reload、重开重建各算一次，每次 refresh 再算并更新最近可用性。run 读取报告值，session 读取最近算值；session lookup/list 不暴露 MCP 动作，也不借最近 run 报告。run tool list 先按快照次序，后接该报告动作，按 endpoint 在 MCP 表的顺序分组。

## 写操作与读操作

fill 将真实 E、显式 O 和六表构成一起 given，成功整批换六表；调用方负责真实求值且 unresolved 为空，形状合格不证明事实。ref 未提交则正常执行；已提交且当前六表均 assembly 且 basedOn=ref 时原样认回、零追加。任一表被替代则 evaluationSuperseded，不回过去。

reload 仅六类之一；现读持有、配值、carrier，固定原定义版本／原根，成功求值后核显式 O，不自动修排列。目标表以一次 mint 成立；plugin 连带旧／新成员类别，其他表不变。每次产生新时刻，不去重，动作空间下次尝试才可见。缺 plugin 来源时保留不支持边界。

refreshAvailability 先核合法 start/continue/attempt，只读、不换表、不追加。用最新装配／reload 的 carrier 配方和当前持有／配值，skill/run 只在 start 判。刷新后并发 append 不要求末尾重读头，不新增 report.head，不自动重来。

lookup/list 的 session 视图读当前表，run 视图读报告所依历史表，新 reload 条目在本尝试回答没有。tool 名字原样用模型面名字，不逆转成定义名。slash_command 每次现读谁可用；skill/session 现读，skill/run 用报告。门控取会话创建租户，不随账号当前租户切换，当前资格另核。只缩已有条目，不将新获权条目加入；unknown 是 unavailable，不是 none。读不到历史表／正文不能换当前，list 任一必要门控读不到整个失败，不返半列表。

读时谁可用只判快照原条目那份持有此刻是否以 not_usable 被过滤；增删、disabled、替换、新版不混入此门控，它们等待 reload／装配。失权与从不存在回答同一 none，不另输出“存在但没权限”。门控不跨调用缓存；若采用副本，生产者须明确失效与陈旧边界。当前中心不可达时副本收权生效到再连上为止的产品边界，不变成永久核权免除。

markFailed 只在 caller 已记录③型命令失败后删除该条，不重求值、不加入变化、不删 reload 命令。已无条目原样零追加；成功前换好，reuse 保留旧 E/O/ref，MF 未确认不能声称删除成功。失败日志落盘先序由 caller 负责，未承诺 JSONL/SQL 同事务。

onAssetChange 只缩 slash_command，其他五表含 skill 不变；无删除原样，门控 unknown 全不改。通知非可靠交付，正确性靠读取现判；通知在重授予前到达才保证“重授予仍须 reload”。丢通知后重授予可无 reload 再可见是当前限制。registry 不枚举全租户 session、不发业务事件／提醒／停止取消、不推表变更；消费者按自己的时机读取。

原 caller 缺参／坏报告仍优先 invalidInput。只有已确认内部输入的真实 C16 根漂移，才把 AE invalidInput 映 unavailable；不能 blanket catch、改 source/声明/current→pinned 或捏旧持有。cycle/unsupported 原样转交。

| 操作 | 既定失败先后／禁止 |
| --- | --- |
| fill | invalidInput（含旧 ref 被替代）→sessionNotFound→dependencyUnresolved→toolNameConflict；求值失败无结果可交，归装配收口 |
| reload | 表示非法→categoryNotRegistered→sessionNotFound→compositionCycle→categoryUnsupported→成功求值后排列非法→dependencyUnresolved→toolNameConflict |
| refreshAvailability | invalidInput→sessionNotFound→compositionCycle→categoryUnsupported→toolNameConflict；可确认根失配 unavailable，无报告 |
| lookup/list | invalidInput→categoryNotRegistered→sessionNotFound；读失败 unavailable，不当 none／空表 |
| markFailed | 非 slash_command、①/②型或 reload 族均 invalidInput，不只是忽略；之后 sessionNotFound |
| onAssetChange | 表示先核、再会话事实；只缩范围与 unknown 不写保持 |

操作所必需的依赖不可读或提交不确认为 unavailable，不能以明确失败值替代未知。条目自报、模态、桥或其他条目级依赖失败只使对应项不满足，按上文分支处理，不因此把整次操作改成 unavailable。缺省身份／within/run/attempt 一律不从上下文补。

## 历史与原始 fill 来源

持久 content 恰 E/O/filledBy 三成员，保留 root/values/filteredOut，不增原输入副本、占位 basedOn 或 root locator。表构成／filledAt 在 tables，basedOn 来自记录壳。reuse 保留被缩表旧 E/O/ref，不改成全会话最新 E；MF readEvaluation 独立选择最近 given/mint。

固定真实 readHead 的 H/latest 后，公开 readGiven(session,H) 取最后 given；AR 核完整 assembly、六表、E/O、唯一有效根，再由有权 STT/EIS 读真实 asset/version。不能用 latest 六表、readEvaluation、creation、缓存或根值猜原始 fill。坏 given、缺六表、错引用／会话／seq 或不可读使 unavailable，零后续 fixed-root/evaluate/append/report。

reload 按 H 条件追加；已知 headMismatch 按有界策略整套重取 H/表/given/input/E/O，不能只换 expectedHead。refresh 持本次 H 的历史视图，后续追加不扩大观察点。重启从持久构成／原版本正文重建，不现求值变相 reload；无法取回旧正文使该类 unavailable，不拿最新正文补。报告／MCP 动作不恢复；归档后首次使用按同规则重建。

SessionRef 不授权，同会话／租户／run 真实关系由内部入口核验。核心当前 computeTableAvailability 只用前序工具满足技能 tool 依赖，其他无真实 provider 的事实 unreadable；不得写成模态、存储读回、运行模式或自报已经接全。
