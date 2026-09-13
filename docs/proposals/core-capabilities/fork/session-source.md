# Session、投影与持久化源码基线

本文记录
`deepseek-ai/deepseek-harness@c291e7961a515f6d7af9304e7fd1d257929aef26`
中被选择性 fork 的 Session、session projection 与 session persistence 机制。
它描述可二次开发的来源事实和相对 D-008 的差异，不定义产品契约，也不表示这些
源码已经满足 SR、DR 或 core-work v1。

## 选择边界

活动源码保留三组彼此可组合、但没有被包装成单一运行时的机制：

- Session 保留追加式内存历史、事件序号、不可变 header、seed/restore、surface
  折叠与替换、请求 header 折叠、消息历史派生缓存、prepare guard、SessionStore
  的创建/进入/撤回/fork/flush 以及 Cordis 生命周期交接。
- Projection 保留注册表、按 Session 分配的 cell、同步 fold、完整 client view、
  watermark、checkpoint 恢复、变更监听以及注册撤回。注册表从 Session 的已提交
  事件推进；未变化的 state/view 引用用于抑制无意义发布。
- Persistence 保留 provider-neutral Service/handle 契约、读写访问模式、版本与
  revision 类型、稳定错误词汇，以及 header/event 的存储前校验、未知必需事件
  拒绝、JSON 快照和连续序号校验。

原件逐文件保存在 `packages/dsh-baseline/upstream/{session,projection,persistence}`，
活动实现位于相应的 `src/` 子目录。逐文件原路径、快照哈希、活动目标和裁剪说明
记录于 `provenance/session.json`。

## 状态权威与转换

Session 的权威内存事实是单个实例拥有的 append-only 事件数组。`seq` 是下一条
事件位置，已存在事件由 `SessionSeq` 标识，边界和长度由 `SessionLogOffset`
标识。append 先对 payload 做一次 lossless JSON 快照并检查事件与 surface 元数据，
然后提交事件、推进 surface、失效必要缓存，最后向已解析的观察者快照发布；观察者
失败被记录但不能回滚已提交事件。seed/restore 在进入 live store 前验证完整序列，
并保留 `inheritedEventCount`，不会把继承前缀重写为子会话自己的事件。

Surface 是原始日志的派生状态，不是第二份历史。append 把新消息节点加入当前顺序；
replace 仅在引用当前连续节点且来源覆盖合法时，用新节点遮蔽指定范围。原始日志不被
删除。`replaceGeneration` 标记任何重写，供派生消息缓存判断增量推进或重建。
request header 同样从事件折叠，最后一个完整 header 是当前值。

SessionStore 是 live 实例成员关系与生命周期的权威。创建或恢复只在同步
`session/created` 发布成功后进入稳定可见状态；同步 veto 回滚进入并发出配对撤回，
dispose 将 live entry 移除并包含观察者失败。`session/event` 是提交后通知；
`session/flush` 是等待所有监听器的并行 checkpoint，但 Session 本身不据此补造
耐久完成事实。

Projection registry 的权威定义是按 key 注册的 projection definition；同 key
只允许兼容的 definition/version。每个 Session 的 cell 保存 fold state、两个交替
view 槽和最近处理的 inclusive watermark。注册时从可用 Session 历史物化；实时
事件按严格连续序号推进。checkpoint 只有在 definition key/version、Session
身份和 watermark 合法时才作为起点，随后仍重放缺失尾部；日志短于 checkpoint
水位时从头重建。checkpoint 读取成功本身不表示恢复完成。

Persistence 源只定义 provider 交接面。write handle 是单 owner 状态，read handle
只观察；close 幂等并承担最终耐久排空和所有权释放。append 成功表示同 provider
实例已接纳有序批次，只有 flush 成功才声明 provider 的耐久 barrier。stat/list 的
revision 只可在同一 provider 实例和同一 Session 内比较相等性。活动基线不提供
任何存储后端，因此不声称跨进程排他、崩溃恢复或真实耐久。

## 来源依赖与改写

活动源码将上游包引用改为本包相对入口：Session 消息只能来自
`../llm/index.ts`，品牌与 JSON 值辅助来自 `../support/{brand,values}.ts`。
Session 的作用域路由只消费 `@omne-harness-lite/agent/scope-baseline`，从而与
Agent 共用同一组 scope Symbol、父链和 WeakMap 状态。Projection 直接消费
`../session/index.ts`；Persistence 直接消费 Session 与 support 类型。

Typert lookup/mixin、仅为 Typert 暴露的 type augmentation，以及上游应用插件均被
删除。Cordis SessionStore、projection registry 和 persistence Service 定义仍保留，
因为它们承载实际生命周期、事件和 provider 边界，并非空转发层。普通 zod 用于
projection state/view 的真实 schema 校验；没有引入 schemastery。

活动源码中的 `@module` 标识改为本包 baseline 子路径；指向上游仓库内部 Agent Note
或未接受 RFC 的链接改写为来源状态说明，避免发布声明把上游治理文字投射为本项目
政策。原件保留这些文字且保持逐字节一致。

## 明确排除和未编译原件

以下来源不进入活动编译入口：Session invariant companion、crash repair、Typert
测试与桥、session-format 旧格式链、projection-cache、JSONL provider、migration、
compression、native/Windows 锁桥、日志上传/遥测/标题插件，以及完整 Loop/Agent。
JSONL 的选择与路径由整合负责人处理，本纵线不写入。

未选取部分不是空实现；它们没有公开导出。活动 `session/index.ts`、
`projection/index.ts`、`persistence/index.ts` 仅导出实际保留的类、函数和类型。
原 Session v3 格式、事件词汇、单机内存语义和 provider-neutral 耐久语义作为来源
事实保留，不能据此推断目标租户授权、Run 事实恢复、产品审批或 core-work 映射。

## 验证范围

保留的来源测试覆盖 Session header/序号/surface/派生缓存/请求 header/作用域撤回、
projection 注册/fold/view/watermark/checkpoint，以及 persistence 的版本、错误、
存储内容与连续批次校验。测试 import 编译后的 `dist` 公开入口，避免源码 alias
掩盖打包问题。被裁剪测试会在来源映射中具名说明原因。

Session 的 `invariant.spec.ts`、`repair.spec.ts`、`typert.spec.ts` 分别随明确排除的
invariant companion、crash repair 和 Typert 桥裁剪；
`gen-persistence-catalog.spec.ts` 属于上游文档生成流程，不验证本包活动算法；
`json.spec.ts` 只重复公共 values helper 的测试，公共支撑已有独立测试；
`properties.spec.ts` 依赖本包未声明的 `fast-check`，本次不为它扩大共享 lockfile，
相应序号、重放和派生性质由保留的确定性来源测试覆盖。Projection 完整保留
`registry.spec.ts`。Persistence 的 `contract.ts` 和 `live-write-contract.ts` 是供
具体后端调用的共享套件；本纵线没有提供后端，因此只保留可直接执行的
`storage-contract.spec.ts`，并在活动测试内联其小型 metadata fixture。

这些测试证明已选择算法在内存与 provider-neutral 边界上的行为；它们不证明真实
JSONL、跨进程 lease、崩溃耐久、完整组合或 D-008 产品验收。后者只在真实提供者与
整合代码到位后由相应负责人验证。
