# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-23 起草当日）：没有任何证据。**
> `capability.tool-admission` v1 是 `candidate`，**未经独立评审、未接受**；尚无提供者设计、尚无源码——**本程不交付它的实现**。
> 本版不建形式工件（[契约 S-37](v1/contract.md#s-37-本版不建形式工件)），**所以下面没有「无反例」这类结论可报**；
> 已触发的证据义务全部是规范场景与跨契约演练，**状态一律「未开始」**。

## 证据义务

### 规范场景

**八条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-38 三档各一](v1/contract.md#s-38-三档各一) | 演练；**观察求值是否被调用**（`forbid`、`auto` 两档不得调用） | **未开始** | 「不产卡」「不看授权表达」只有看调用与产出才证得了 |
| [S-39 算不出 × 三种运行模式](v1/contract.md#s-39-算不出--三种运行模式) | 演练；可替换的求值桩（三种结果） | **未开始** | 卡片四档要**逐字**比对 PF-008 §5.2 原词 |
| [S-40 子宽于父整批失败](v1/contract.md#s-40-子宽于父整批失败) | 演练 | **未开始** | 受阻：父摘要的来源（[G-12](v1/contract.md#十一已知缺口)） |
| [S-41 一批里一条 ask，整批不执行](v1/contract.md#s-41-一批里一条-ask整批不执行) | **跨契约**演练（本契约 ＋ runner ＋ 执行运行时） | **未开始** | 「卡片答完之前执行运行时没收到任何提交」由 runner 兑现，只跑本契约这一半证明不了 |
| [S-42 答复收成结论，禁止翻案](v1/contract.md#s-42-答复收成结论禁止翻案) | 演练；**卡片挂着期间改权限**两次 | **未开始** | 答复的记录形状受阻于 [G-4](v1/contract.md#十一已知缺口)；答复落成授权的那两次写入受阻于 [G-2](v1/contract.md#十一已知缺口)，本场景只检查「这一次」的结论 |
| [S-43 放行之后参数变了，令牌作废](v1/contract.md#s-43-放行之后参数变了令牌作废) | 演练；往日志里人为落一次排错位置的改写 | **未开始** | 受阻：生效参数的记录形状（[G-8](v1/contract.md#十一已知缺口)） |
| [S-44 判不出来不放行](v1/contract.md#s-44-判不出来不放行) | **故障注入**（求值读不到、日志读不到） | **未开始** | **最容易被「读不到就当算不出」抹掉的一条，必须真跑**；`bypass-permissions` 下那一格是关键 |
| [S-45 工作区来的工具不提权](v1/contract.md#s-45-工作区来的工具不提权) | 演练 | **未开始** | 上游求值也有一道（PF-002 §5.7 的读入过滤），本场景只检查本能力这一道 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 本件钉在 `before_action` 瀑布最后 | [S-29](v1/contract.md#s-29-位置干预力与结论投影)、[S-30](v1/contract.md#s-30-放行之后参数不再变) | `capability.loop-extension-runner` ＋ 装配 | runner 的场景；排错位置时 [S-43](v1/contract.md#s-43-放行之后参数变了令牌作废) 的第二道仍挡得住 |
| 本能力不在、报错或没给出结论时这一批全拒 | [S-29](v1/contract.md#s-29-位置干预力与结论投影)、[S-34](v1/contract.md#s-34-本能力缺席报错或判不出来) | runner（主线裁定，待确认） | runner 的故障注入场景 |
| 一批里还有一条在等，谁都不执行 | [S-31](v1/contract.md#s-31-一批里还有一条在等谁都不执行) | runner ＋ 执行运行时 | 两者的行为模型与场景 |
| 提交前必核对凭据；`unavailable` 与 `invalid` 都不执行 | [S-25](v1/contract.md#s-25-verifytoken)、[S-34](v1/contract.md#s-34-本能力缺席报错或判不出来) | `capability.tool-execution-runtime` | 它的场景 |
| `veto.reason` 原样带拒绝原因 token | [S-29](v1/contract.md#s-29-位置干预力与结论投影) | runner | runner 的场景；agent 侧可观察 |
| 求值：失败不折成 `undecidable`；确定 | [S-9](v1/contract.md#s-9-授权上下文与求值) | 求值的实现（[G-1](v1/contract.md#十一已知缺口)） | 实现的单元测试：**停掉授权上下文存储，求值必须报失败而不是 `undecidable`** |
| 空集收成 `forbid`；一个档位而不是集合 | [S-8](v1/contract.md#s-8-有效执行权限) | `capability.asset-evaluation` | 它的场景 |
| 第四档的资格；四档选项在别处出的卡上不带授权 | [S-15](v1/contract.md#s-15-定死的四档选项与卡片草稿)、[S-28](v1/contract.md#s-28-四档选项只在本能力出的卡上带授权含义) | PF-008 卡片契约 ＋ runner | 那两份契约的场景 |
| 这一件不可替换、不可禁用、不可收窄 | [S-32](v1/contract.md#s-32-这一件不得被替换禁用或收窄) | 待裁（[G-7](v1/contract.md#十一已知缺口)） | 裁定之后由资产领域的场景承担 |

## 实际执行

**无。**没有实现，没有形式工件，没有运行记录。

## 变化的影响

- **2026-09-23 起草**：首版，没有旧证据可作废。
- **起草中的一处自我修正（同日）**：初稿要求一批里各项的 `parent` 逐值相同，与 `parent.permission` 按工具条目相矛盾；已改为「`parent` 都带或都不带、`parent.runMode` 相同，`parent.permission` 各项可不同」（[S-7](v1/contract.md#s-7-admissioninput)、[S-21](v1/contract.md#s-21-admit)、[S-23](v1/contract.md#s-23-一批的含义)、[S-24](v1/contract.md#s-24-失败值与它们的次序) 与 [examples §3](v1/examples.md#3-子宽于父被拒)）。
- **待主线确认的推导项**（接受之前须逐条确认；任一项被改判都会改动所列条款）：
  `answer` 成员与「有答复时禁止照判、其余由答复定」（[S-7](v1/contract.md#s-7-admissioninput)、[S-12](v1/contract.md#s-12-答复)、[S-22](v1/contract.md#s-22-判定次序)）；
  `verifyToken` 的输入扩成 `(token, call, session)` 与四个无效原因（[S-25](v1/contract.md#s-25-verifytoken)、[S-26](v1/contract.md#s-26-令牌有效的条件)）；
  凭据按「`callId` ＋ 本件的最终结论」这把键指认而不是记录 id（[S-16](v1/contract.md#s-16-admissiontoken-与参数相等)）；
  账本外的失败值 `unavailable`（[S-24](v1/contract.md#s-24-失败值与它们的次序)、[S-25](v1/contract.md#s-25-verifytoken)）；
  五个拒绝原因与四个选项 id 的 token（[S-14](v1/contract.md#s-14-拒绝原因)、[S-15](v1/contract.md#s-15-定死的四档选项与卡片草稿)）；
  「宽」的两条次序（[S-11](v1/contract.md#s-11-父会话摘要与宽的次序)）；
  `from = workspace ⇒ value = ask`（[S-8](v1/contract.md#s-8-有效执行权限)）；
  账本名 `ExecutionPermission` 不立（[S-8](v1/contract.md#s-8-有效执行权限) 末段）。
- **四份 candidate 依赖**（`data.content-blocks`、`data.tool-definition`、`data.loop-extension`、`data.asset-model`）改号或改义时，逐条核对 [契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的表并同步 catalog 的 clauses。
- **并行起草的 `capability.loop-extension-runner`、`capability.tool-execution-runtime`、`capability.asset-evaluation`、`capability.hooks-import`** 定型后：本契约只以名字提到它们、不登依赖（它们是消费者，或是上游输入值的产出方）；对齐时核对 [第六节](v1/contract.md#六在拓展点协议里) 与 [S-25](v1/contract.md#s-25-verifytoken) 的义务在它们那一侧是否有对应条款。

## 对齐义务

- **词条链接待合流后补**（2026-09-24 整批对齐）：正文里「干预力」原标「无词条」，词条批已立为词条，本包已改用正式名、去掉标记；那几条词条在 HUB 上、本分支看不到，**链接待合流后补**（主线）。
