# D-042 决定正文

## 选择与范围

接受 [README](README.md) 表列的 32 个新立节点与 3 处修订的**设计**为各契约的实现路径：插件边界、服务键、inject 边与换代时收掉的在途事实、effect 装卸配对、事件派发模式与过滤器、存储要求（含跨 owner「同一提交」的共同存储对象）、装配给 vs 协议给的单机兑现、验证义务，以及各节点缺口表里仍开着的缺口（作为显式缺口，owner 与闭合条件按各表）。接受的是设计，不是实现：32 个新节点尚未建包，存量节点的本程追加部分尚未实现。

## 理由与保留前提

- 五批 architecture-reviewer 独立评审：N1（15 个 core 纯模块）、N2（资产治理、OG v2、tenancy-host）、N3（tools 三节点）、N5（cli）无阻断；N4（agent-loop 与 model 五节点）一条阻断（runner 自身换代时在途派发把指定挂件的否决写进日志、推翻 S-8）由 [D-040 §八 M63](../mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 局部闭合、不动契约；应修与建议全部有裁定（M47～M75）并已落各节点，主线定点核五处关键落点齐全（N-31）。每个节点 verification 有「独立评审」表，处置不等于评审闭合，评审意见不改变接受状态。
- 2026-09-25 深夜追加两批：N6（session 三节点与 assembly-manifest-store）、N7（infra 三节点与 pi-ai-transport）均无阻断，应修与建议由 [D-040 §八 N-42](../mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 处置、各节点回填；「公开面」修订波（SYS-OPEN，[D-043 R-2](../assets-runtimes-rulings-2026-09-25/README.md)）改遍全部节点，接口契约接线由 N-39 处置。
- 手册六项判据在评审里逐节点过：性质承载、内核负面清单、F ②③、跨 owner 同一提交的共同存储对象、与被接受候选（D-039：assets B、tools C、model A·A·A）一致、每个插件边界一条反证。
- 形式证据：本程 8 个 formal task 退出 0（run `2026-09-25-formal-assets-runtimes`）、stream-assembly 三份有效性核对按预期出反例（run `2026-09-25-validity-stream-assembly`）、Node 24 无损 JSON 探针（run `2026-09-25-node24-json-probe`）；**绑定只指会失败的证据**，asset-registry、mcp-bridge、runner、hooks-import、modality-projection 与十五个纯模块中的多数为空表，如实。
- 保留前提：D-041 接受契约；D-040 §八仍有效的裁定已由 D-045 追认；后续改判即节点跟着改；kernel-basis 待补 probe（A-1、H-1、H-7、`provide-is-effect-managed` 升格、「同一提供者 fiber 重跑 ⇒ 下游重跑」、「撤除开始时 fiber 先离开 `ACTIVE`」）不成立时按各节点写明的改选条件重选；验收装配剩余五件替身在真承接者到来时删除，替身行为不作证据；八个最小提供者是真实提供者，其行为可作证据，真承接者出契约新版本时替换。

## 下一程缺口（接受为显式缺口，不在本程补）

C-1 会话日志契约与提供者、C-2 装配清单契约（PF-004）、C-3 据点上的中心事实副本读面、C-4 入口组合 v2、C-5 凭据保管方 `infra/secrets`、C-6 附件存储、C-7 执行环境（PF-005）、C-8 agent loop、C-11 撤除等待 probe、C-12／C-13 会话持有租户读面、C-14 `dependencyPresence`、C-15 `infra/clock` 严格递增时刻、C-16 `runAttemptFacts` 读面——编号与 owner 以 `apps/cli` 缺口表与 D-040 §八 M43／M48／M58／M74 为准；传输 fork 包节点（MRR-N4）、TER 观察者与 `late`／成本路由（T-2～T-5）同此。

## 实际接受依据

产品负责人于 2026-09-26 以 D-045 所录直接授权接受 PR #9 中未正式接受的设计，接受前 main `d35b9f7a`；原话及精确范围见 [D-045](../assets-runtimes-formal-acceptance-2026-09-26/decision.md)。

## 不表示

任何新增包已建、任何新增实现测试已跑、所有设计路径都可实施、所有账本未决问题均已有答案。投影 v2 的发布与接受由 D-045（G6）登记；v1 保留历史。D-039 的装配落点保持不变。
