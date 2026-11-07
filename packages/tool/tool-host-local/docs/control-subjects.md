# 控制主体持久关联

[createLocalToolControlSubjects](../src/control-subject-adapter.ts) 实现 Tool 的 [ToolControlSubjects](../../tool/src/construction.ts)。它保存原控制者的稳定身份投影，供 ledger 在传播控制前重新核权。控制意图、传播任务和拒绝结果仍由 Tool ledger 保存。

## 输入与接线

`LocalToolControlSubjectsInput<P, B>` 接收以下依赖。

| 输入                 | 承诺                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `store`              | 与 Tool ledger 共用的 `ToolLedgerStore`。生产装配必须提供耐久存储。                                               |
| `project`            | 既有身份核验者的窄闭包。先核验真实 `P`，再返回 `LocalToolControlSubject`。字段相同的伪造对象不能通过。               |
| `resolveSessionWork` | 按合法 `tenant` 和原始 opaque SessionId，经既有 Session 归属与身份签发链取得当前 `P`。不能将存储 JSON 当成受信主体。 |
| `qualify`            | 既有 `ToolAccessGuard<P>['qualify']`。适配器固定请求 `action: 'control'`。                                           |
| `commitAttempts`     | 正安全整数，限制条件提交的尝试次数。不合法时构造抛出 `TypeError`。                                                   |

将工厂结果注入 `createToolLedger` 的 `settlement.controlSubjects`。运行时消费该 ledger 的 `controls`。装配方同时提供真实身份与资格闭包；缺少闭包时相关操作返回 `unavailable`。

投影只有合法租户、`kind: 'acting-for-tenant'`、`actor.component: 'sessionWorkPrincipals'`、`work.owner: 'session'` 和非空 `work.work`。`work.work` 原样保存和比较。适配器不解析 SessionId，不从它推导租户或权限。租户使用 legal-identity 的铸造检查和等值检查。

## 记录和首次证据

每个租户使用 host 域 `{ kind: 'host', tenant, key: 'control-subjects' }`。记录键是 `subject:` 加规范摘要。摘要输入依次为 organization、account、call、kind、actor.component、work.owner、SessionId。摘要只用于定位，读取仍比较完整字段。

记录值包含 `kind: 'control-subject'`、`schema: 1`、租户的两段文本、原 call、稳定 subject 投影和首次 evidence。不保存 `P`、凭据或资格缓存。

evidence 的 owner 为 `@omne-harness/tool-host-local`。record 为 `control-subjects:` 加 `JSON.stringify([organization, account, call, subjectKey])`，用于在读取前拒绝跨租户或跨调用的引用。revision 为首次关联提交的域修订号。digest 覆盖除 evidence 外的完整记录主体。evidence 与主体写进同一条 host 记录，后续始终返回首次 evidence。

Session 来源修订不参与身份。其他关联推进 host 域修订也不替换已有 evidence。当前实现不回收关联记录。

## 操作和故障

- `capture` 在首次等待前固定 caller 的 tenant/call，核验投影并查询当前控制资格，然后建立或认回关联。资格拒绝时不写关联。
- `matches` 核验当前真实主体，再比较引用指向的完整稳定身份。凭据刷新后，只要身份不变仍可认回。该操作不表示当前控制资格允许。
- `qualify` 读取原关联，用原 SessionId 解析当前主体，重新核验完整投影，再查询该主体的当前控制资格。它不接收 driver 的 principal。

存储通过域修订号 CAS 保证首次建立的竞争安全。冲突后重读并认回胜者。`unknown` 或提交抛错后，适配器只读回同一个确定键一次；只有完整匹配的已保存记录才算成功。未找到记录返回 `unavailable`，不证明迟到提交永不发生。后续重试仍使用相同键。

明确的身份不符、跨 tenant/call、被篡改的引用返回 `denied`。缺记录、记录损坏、读取失败、无法核验、缺少回调、非法回调答复或回调抛错返回 `unavailable`。异常正文和主体不进入诊断。适配器从不重建未知原记录来替代旧 evidence，也不改写已有记录。

## 原调用恢复的边界

runtime 的 `resolveAccess({ tenant, call })` 归受信调用来源与 runtime 组合，不属于本适配器。原调用可能没有控制记录，或控制者不同于调用发起者。

现有来源的定位顺序如下。

1. 从 call 域读取 [CallRecord](../../tool/src/ledger-store.ts)，取得原 `admission`、完整 `request.consumer` 和 `request.invocation.source`。
2. 来源拥有者在本租户的 host 域 `invocation-source` 内，用 `source:` 加 `JSON.stringify([owner, work, position, purpose])` 定位 consumer 关联。
3. [调用来源](../src/invocation-source.ts)的内部组合核对原 call、admission、完整固定请求摘要和原 invocation evidence。`CallRecord.initiator` 只是来源投影，不能直接当作 `P`。
4. 从已核验的来源取得原发起者的稳定身份描述，经既有 `resolveSessionWork` 重新解析，并经 `project` 对比原身份，再核当前 recover/write 资格。

来源中的原始 principal JSON 只能作为数据。若身份拥有者无法从它确认原稳定身份，恢复必须返回 `unavailable`。组合不得使用最近的控制者、全局 driver 主体或猜测的 SessionId。

## 验证范围

[独立用例](../tests/control-subject-adapter.spec.ts)覆盖稳定身份、重建、CAS、未知提交、来源故障和真实 Tool ledger 的控制拒绝。存储与身份源是测试替身。这些用例不证明 SQL Session 身份组合、跨进程耐久性或生产执行器停止行为。
