# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.identity-values` v1 已由 D-023 接受并冻结（2026-09-22），提供者设计在 [`realization/packages/core/identity-values`](../../../realization/packages/core/identity-values/README.md)；尚无源码、尚无装配。**此后版本目录不再原地改，语义改动发布 v2。**
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **九条静态检查（SC-1～SC-9）、十条消费者核对场景（CS-1～CS-10）、
> 十条隔离义务规范场景（IS-1～IS-10）一条都未执行**——文件存在不代替结果。
> 唯一跑过的是对 Schema 正反实例的**本地形状自检**，
> 它**未登记**（无输入快照、未进 `record/evidence/`），范围与局限见[下节](#结果与反例)；
> 它**不支持**任何一条隔离义务。
>
> **三组场景不互相顶替**：`CS-n` 定义在[契约第八节](v1/contract.md#消费者核对场景)、
> `IS-n` 定义在 [`examples.md` 第 13 节](v1/examples.md#13-隔离义务的规范场景)、
> `SC-n` 定义在[本页下表](#静态检查义务)。**每组各有唯一定义处，本页只登记状态。**

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) **第 1～11 节**（参与机检的那些节）的正反实例逐条过 Schema。**第 12、13 节不参与**——它们没有「校验对象」，形状上一概合法 | Draft 2020-12 校验器 ＋ 该文件按节绑定的 `$defs` | [S-1](v1/contract.md#s-1-accountid)、[S-3](v1/contract.md#s-3-organizationid)、[S-4](v1/contract.md#s-4-organizationkind)、[S-5](v1/contract.md#s-5-tenantid-的构成与相等)、[S-7](v1/contract.md#s-7-tenantid-的规范序列化形式)、[S-8](v1/contract.md#s-8-tenantrole)、[S-9](v1/contract.md#s-9-loginstateid)、[S-10](v1/contract.md#s-10-membershipstanding)、[S-11](v1/contract.md#s-11-scopelayeridentity)、[S-12](v1/contract.md#s-12-缺席与空值都不是身份值)、[S-31](v1/contract.md#s-31-不透明标识的交换表示)、[S-32](v1/contract.md#s-32-判别式集合闭合)、[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 的**形状那一面** | **本地形状自检，未登记**。见[下节](#结果与反例)。**正式覆盖未开始** |
| V-2 | **静态检查**：判定函数的输入集合、账号记录的字段集合、层事实表的键、身份参数有无默认值、归属身份的持久形状等五类（逐条见[下表](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | [S-1](v1/contract.md#s-1-accountid)、[S-2](v1/contract.md#s-2-登录标识不是-accountid)、[S-3](v1/contract.md#s-3-organizationid)、[S-4](v1/contract.md#s-4-organizationkind)、[S-6](v1/contract.md#s-6-tenantid-无生灭路径)、[S-7](v1/contract.md#s-7-tenantid-的规范序列化形式)、[S-9](v1/contract.md#s-9-loginstateid)、[S-16](v1/contract.md#s-16-按归属层显式携带身份值)、[S-17](v1/contract.md#s-17-身份参数没有默认值)、[S-20](v1/contract.md#s-20-六条路径同一判定)、[S-21](v1/contract.md#s-21-判定依据的构成封闭)、[S-22](v1/contract.md#s-22-路径是地址不是钥匙)、[S-24](v1/contract.md#s-24-账号记录不含跨账号关联字段)、[S-25](v1/contract.md#s-25-个人-context-不进任何层)、[S-26](v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁)、[S-28](v1/contract.md#s-28-当前租户身份在创建那一刻捕获)、[S-29](v1/contract.md#s-29-层事实只以显式身份值为键)、[S-34](v1/contract.md#s-34-语义身份与实现地址分开) | **未开始**；**检查器尚不存在**，形式归 realization |
| V-3 | **六路径核对**（[IS-1](v1/examples.md#13-隔离义务的规范场景)）：每个 owner 逐条列出读/写/覆盖/删除/订阅/清理的判定位置，并对同一对象逐路径各走一次拒绝分支 | 结构化核对清单（评审对象）＋ 规范场景演练 | [S-20](v1/contract.md#s-20-六条路径同一判定) | **未开始。**需要一个实现了数据访问路径的提供者 |
| V-4 | **「声称隔离」的实施位置核对**：逐个问「判定在哪一行」，再把 isolate 标签、过滤器或前缀去掉重跑 | 架构评审 ＋ 规范场景演练 | [S-23](v1/contract.md#s-23-不得冒充隔离) | **未开始。**这条最容易被一层前缀糊过去，评审不能只看接口声明 |
| V-5 | **不可用 ≠ 无效的行为核对**：注入存储不可用，观察是否发生清理或回退 | 规范场景 ＋ 故障注入 | [S-10](v1/contract.md#s-10-membershipstanding)、[S-19](v1/contract.md#s-19-不可用即明确失败)、[S-26](v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁) | **未开始。**责任：提供者。这条最容易在实现里被一个 `catch { return ineffective }` 抹掉，**必须真跑** |
| V-6 | **归属不漂移**：创建 → 切换当前租户身份 → 复核归属与计量 | 规范场景演练 | [S-28](v1/contract.md#s-28-当前租户身份在创建那一刻捕获) | **未开始。**需要会话领域与计量的提供者；**计量口径本身是缺口**（[G-02](v1/contract.md#十已知缺口)） |
| V-7 | **跨边界重验**：构造一条只带 TenantId、不带授权依据的消息投给接收边界 | 规范场景演练 | [S-30](v1/contract.md#s-30-跨边界须重新验证) | **未开始，且本版装配下无法演练**——单机同进程传参不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-8 | **结构约束**：至多一个上级、无环、个人组织不在链上、共同上级谓词 | 结构模型（Alloy 一类），**归组织治理契约** | [S-4](v1/contract.md#s-4-organizationkind)、[S-14](v1/contract.md#s-14-上级组织与上级链)、[S-15](v1/contract.md#s-15-shareancestor) | **未开始**；**本契约不另造平行模型**，那份模型消费本契约的值定义。**函数名与定义式以本契约 S-14/S-15 为准**，那份模型带坐标引用 |
| V-9 | **缺席即拒绝**（[IS-2](v1/examples.md#13-隔离义务的规范场景)）：在身份的**输入位置**构造一次不带身份的调用；另核对一处**合法缺席**（official 资产的作者字段）**不**被误拒 | 规范场景演练 | [S-12](v1/contract.md#s-12-缺席与空值都不是身份值)、[S-18](v1/contract.md#s-18-缺席即拒绝)、[S-33](v1/contract.md#s-33-表示层校验与判定分开) | **未开始。**两支都要走：只走拒绝那支，会把一个把所有缺席一律拒掉的实现判成通过，而那会拒掉 official 资产 |
| V-10 | **物理位置不构成资格**（[IS-3](v1/examples.md#13-隔离义务的规范场景)）：同一宿主机同一 OS 用户，两个租户身份先后挂同一目录 | 规范场景演练 ＋ [SC-1](#静态检查义务) | [S-21](v1/contract.md#s-21-判定依据的构成封闭)、[S-22](v1/contract.md#s-22-路径是地址不是钥匙)、[S-34](v1/contract.md#s-34-语义身份与实现地址分开) | **未开始。**需要执行环境与资产两侧的提供者 |
| V-11 | **现读**（[IS-6](v1/examples.md#13-隔离义务的规范场景)）：解除成员关系后立即发起下一道准入；另找出每一处授权缓存并逐个问「它什么时候失效」 | 规范场景演练 ＋ 缓存声明的评审 | [S-27](v1/contract.md#s-27-每道准入现读) | **未开始。**答不出失效条件的缓存**即为反例**，不必等到真的放行一次 |
| V-12 | **归属身份的持久形状**：受所有权约束的对象，其持久形状里存的是**一个带判别式的 `ScopeLayerIdentity`**，不是两个可空的身份列 | 静态检查（[SC-9](#静态检查义务)）＋ 数据形状评审 | [S-16](v1/contract.md#s-16-按归属层显式携带身份值)、[S-11](v1/contract.md#s-11-scopelayeridentity)、[S-32](v1/contract.md#s-32-判别式集合闭合) | **未开始。**这是一次**形状核对**，不是运行时演练，因此不在 IS 表里 |
| V-13 | **[交接凭证](v1/contract.md#s-35-交接凭证-handoff-warrant)**：对每个实例各跑四支——**不带凭证**、**带一份为另一个对象产出的凭证**、**重放一份旧凭证**（核实**通过**，被守卫的那一步由核实方自己的前置现读定：状态未变 ⇒ 正常或幂等 `ok`，状态已变 ⇒ `account-record-expired`／`not-expired`，**任何交错下都不产生错误效果**）、**带一份自己编的字符串**（伪造） | 规范场景演练 ＋ 故障注入；**演练归两个实例各自的契约**，本页只登记本契约的义务已触发 | [S-35](v1/contract.md#s-35-交接凭证-handoff-warrant)（六条性质）、[S-30](v1/contract.md#s-30-跨边界须重新验证) | **未开始。****第四支最要紧、也最容易被跳过**：第一、二支失败时实现通常本来就会拒，而伪造那一支一旦通过，所有以凭证为前置的次序条款**同时变成空条款，且每一步仍返回 `ok`**。**第三支的判据在评审轮三翻了方向**：旧凭证**不再被拒**，要观察的是核实方有没有在自己提交里现读状态前置（[性质 4](v1/contract.md#性质-4-在两个实例上为什么站得住)） |
| V-14 | **消费者路径走查**（[CS-1～CS-10](v1/contract.md#消费者核对场景)）：逐条按「消费者 X 在情形 Y 下依赖 S-n，得到 Z」走一遍，**走不通即本契约的缺口** | 结构化走查（评审对象）；有提供者之后升级为真实演练 | 十条合计覆盖 [S-1](v1/contract.md#s-1-accountid)、[S-3](v1/contract.md#s-3-organizationid)、[S-5](v1/contract.md#s-5-tenantid-的构成与相等)～[S-7](v1/contract.md#s-7-tenantid-的规范序列化形式)、[S-10](v1/contract.md#s-10-membershipstanding)～[S-13](v1/contract.md#s-13-sameaccountdistincttenants)、[S-15](v1/contract.md#s-15-shareancestor)～[S-22](v1/contract.md#s-22-路径是地址不是钥匙)、[S-26](v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁)～[S-29](v1/contract.md#s-29-层事实只以显式身份值为键)；**[S-13](v1/contract.md#s-13-sameaccountdistincttenants) 只在这里有落点**——它是一条纯值判定，Schema 管不到、静态检查也查不出 | **未开始。**走查**不需要提供者**，现在就做得了；**CS-8**（计量）与 **CS-6**（工作区目录）会停在已知缺口 [G-02](v1/contract.md#十已知缺口)／[G-07](v1/contract.md#十已知缺口) 上，**停在缺口不算走不通**，如实记为「本版到此为止」 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。
**本版全部状态为「未开始」，不得以「已列出」充当「已通过」**；检查器形式归 realization。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 判定函数的入参类型里不出现路径、目录、OS 用户、主机名、环境变量、运行实例身份类型 | [S-21](v1/contract.md#s-21-判定依据的构成封闭)、[S-22](v1/contract.md#s-22-路径是地址不是钥匙) | 未开始 |
| SC-2 | 账号记录的字段清单里不出现指向另一个 AccountId 的引用，或任何跨账号聚类键 | [S-24](v1/contract.md#s-24-账号记录不含跨账号关联字段) | 未开始 |
| SC-3 | 受租户约束的数据访问入口，身份参数**必需且无默认值**；函数体内不现取当前租户身份 | [S-17](v1/contract.md#s-17-身份参数没有默认值)、[S-28](v1/contract.md#s-28-当前租户身份在创建那一刻捕获) | 未开始 |
| SC-4 | 读/写/覆盖/删除/订阅/清理六条路径调用**同一个**判定函数 | [S-20](v1/contract.md#s-20-六条路径同一判定) | 未开始 |
| SC-5 | 不存在把 OrganizationKind 从一个取值改成另一个的写路径 | [S-4](v1/contract.md#s-4-organizationkind) | 未开始 |
| SC-6 | 不存在「销毁租户身份」的写路径；解除成员的实现里不含删除、迁移或改键 | [S-6](v1/contract.md#s-6-tenantid-无生灭路径)、[S-26](v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁) | 未开始 |
| SC-7 | 属性配值与层事实的键构成里不含账号级的项（AccountId、LoginStateId、个人 context） | [S-25](v1/contract.md#s-25-个人-context-不进任何层)、[S-29](v1/contract.md#s-29-层事实只以显式身份值为键) | 未开始 |
| SC-8 | 不存在第二处把 TenantId 编码成标量的规则；**三个不透明标识**（AccountId、OrganizationId、LoginStateId）**与[交接凭证](v1/contract.md#s-35-交接凭证-handoff-warrant)一律不被解析、不被大小写折叠、不来自运行时对象**；地址（主键、表名、路径、缓存键、主题、度量标签）不被回读成身份 | [S-1](v1/contract.md#s-1-accountid)、[S-3](v1/contract.md#s-3-organizationid)、[S-7](v1/contract.md#s-7-tenantid-的规范序列化形式)、[S-9](v1/contract.md#s-9-loginstateid)、[S-31](v1/contract.md#s-31-不透明标识的交换表示)、[S-34](v1/contract.md#s-34-语义身份与实现地址分开)、[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 性质 1 | 未开始 |
| SC-9 | 受所有权约束的对象，其持久形状里的归属字段是**一个带判别式的 `ScopeLayerIdentity`**；**不存在**「两个可空身份列 ＋ 谁不为空算谁」那种形状 | [S-11](v1/contract.md#s-11-scopelayeridentity)、[S-16](v1/contract.md#s-16-按归属层显式携带身份值) | 未开始 |

五类静态检查义务——**判定函数的输入集合**（SC-1）、**账号记录的字段集合**（SC-2）、
**层事实表的键**（SC-7）、**身份参数有无默认值**（SC-3）、**归属身份的持久形状**（SC-9）——
**状态一律为「未开始」**。

## 结果与反例

### 已执行：Schema 形状自检（2026-09-22，评审轮一修订后重跑）

> **这次执行未登记。****没有输入快照、没有进 `record/evidence/`**，
> 因此**不作为证据**，也不记入任何一条义务的「已通过」。
> 它只保证本包给出的正反实例与它们的标注不互相矛盾。

| 项 | 值 |
|---|---|
| 对象 | 本包 [`v1/identity-values.schema.json`](v1/identity-values.schema.json) 与 [`v1/examples.md`](v1/examples.md)，**评审轮一修订之后**的内容（**未冻结，无 hash 可绑**） |
| 工具 | CPython 3.12.13 ＋ `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing` 0.37.0；经 `.meta_harness/` 下 `uv run python` 调用 |
| 输入 | `examples.md` **参与机检的 86 行**——第 1～11 节里带「预期」列的表格行。每节按其「校验对象」绑定一个 `$defs`，第一列为实例、第二列为预期。**第 7 节的「结构相等三个用例」表不在其内**（它比的是相等判定，不是 Schema），**第 12、13 节整节不在其内**（无「校验对象」） |
| 做了什么 | `Draft202012Validator.check_schema` 通过；每条实例按其所在节的 `$defs` 求值，与「预期」列逐条比对 |
| 结果 | **86/86 与标注一致**，按定义项计：AccountId 11、OrganizationId 5、LoginStateId 3、LoginIdentifier 4、OrganizationKind 7、TenantRole 7、TenantId 12、MembershipStanding 13、MembershipStandingResult 8、ScopeLayerIdentity 10、HandoffWarrant 6 |
| 本轮新增的 8 条 | AccountId 两条（尾随换行 `"…\n"`、前导 U+FEFF）＋ HandoffWarrant 六条。**前两条是引擎差异的回归用例**：同一次运行里另核对过，**旧 pattern（`^\S(?:[\s\S]*\S)?$`）在 CPython 下对这两条都返回「通过」**，与标注相反；换成显式空白字符类 ＋ `(?![\s\S])` 之后两条都返回「拒绝」。**这次核对同样未登记** |
| 范围与局限 | **只覆盖形状。**不支持 [S-16](v1/contract.md#s-16-按归属层显式携带身份值)～[S-30](v1/contract.md#s-30-跨边界须重新验证) 中的**任何一条**；不支持 [S-1](v1/contract.md#s-1-accountid)/[S-3](v1/contract.md#s-3-organizationid)/[S-9](v1/contract.md#s-9-loginstateid) 的「部署内唯一」「不可解析」「不来自运行时」，以及 [S-6](v1/contract.md#s-6-tenantid-无生灭路径) 的「无销毁写路径」；**[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 的六条性质一条也不支持**——HandoffWarrant 那六行只说明形状对得上，**一份自己编的字符串在这一关与一份真凭证完全无从分辨** |
| **只在一个引擎上跑过** | 上面那条「两边都拒」的结论，**本次只在 CPython `re` 上取得**。ECMA-262 那一侧**未实测**，理由是判断而非观测：`(?![\s\S])` 与显式字符类在两族语法里语义相同。**要正式登记，须在一个 ECMA-262 校验器上重跑同一份输入** |

**它未绑定冻结 hash，规范资源一改就失效，须重跑。**
要正式登记，须给出输入快照与可复现步骤，并把原始结果放进 `record/evidence/`。

### 尚无的记录

V-2～V-14 尚无执行记录。首次执行时在此记录工具与版本、环境、配置、输入范围、
可复现步骤与原始结果位置；记录多时按执行拆文件并从本页链接，
原始产物归 `record/evidence/`。

记录时**必须分开陈述**：Schema 校验的结果、静态检查的结果、规范场景演练的结果、真实组合的符合性。
**四者不能互相冒充**——[S-33](v1/contract.md#s-33-表示层校验与判定分开) 说的就是这件事，
它对证据同样成立。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[包入口](README.md#版本包)：
本契约没有状态转移，也没有需要在给定规模里找反例的结构关系；
真正需要结构模型的是上级链的无环与至多一个上级，那条义务在**组织治理契约**上（V-8），
不在这里建第二份平行模型。

**这不是把义务省掉**：它被改写成了 V-2～V-7 与 V-9～V-14 的静态检查、走查与规范场景，登记在上表。
本契约**不拥有任何进展性质**（值不会「最终成为」别的值），因此没有需要写成有界形式的断言。

**[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 不改变这个结论**：
凭证的产出与核实发生在**两条操作之间**，本契约一步状态转移也没有多出来。
那条次序守卫要在行为模型里检查，落点是
`omne-harness-lite-design-2026-09-15 · composition.account-registration · v1` 的行为模型，
**不在本包**；本页只登记本契约这一侧的义务（[V-13](#证据义务)）已触发，状态「未开始」。

## 变化的影响

- **已记录：`capability.account-identity` v2（`candidate`）对本契约两处的读法**（2026-09-23）。**本契约 v1 已冻结，一个字不改**；两处收口归本契约的下一版：
  ① **[G-04](v1/contract.md#十已知缺口)（不透明标识的词法）对 LoginStateId 已在规格层定下**——账号能力 v2 的
  [S-45](../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 规定 LoginStateId 等于出示物 UTF-8 的 SHA-256 写成的 64 个小写十六进制字符，
  满足 [S-31](v1/contract.md#s-31-不透明标识的交换表示)；AccountId、OrganizationId 等其余标识的 G-04 **仍开**。
  消费者判 LoginStateId 合不合形状仍只用 S-31，不收紧到那个形状（同一条 S-45 写明理由）。
  ② **[S-9](v1/contract.md#s-9-loginstateid)「由存储生成」读作「在签发那次存储提交里产生」**，唯一性仍由存储的唯一约束兑现，不由派生兑现。
  **对证据的影响：无**——本契约的义务与已执行的检查都不涉及这两处。
- **已执行：PF-002 升到 rev 10、PF-015 升到 rev 9**（2026-09-22，
  [PF-002 changelog rev 10](../../../product/PF-002-assets-settings-and-permissions/design.md)、
  [PF-015 changelog rev 9](../../../product/PF-015-session-lifecycle-and-ownership/design.md)）。
  **rev 10 把工作区从「一个会话挂上的宿主机目录」改成「租户持有的一级归属，由目录承载」，并定它 opt-in、挂上就在装配时自动加载。**
  本契约引 PF-002 的三处（[设计依据表](v1/contract.md#设计依据)里 §5.2、§4 工作区、§5.8）逐条回读：
  §5.2 与 §5.8 原文未变；§4 的「挂在租户下、同目录换租户身份即另一份」**原样保留**，
  且新定义与 [S-22](v1/contract.md#s-22-路径是地址不是钥匙)、[CS-6](v1/contract.md#cs-6-工作区宿主为租户) 的方向一致——
  路径指认的是**承载目录**，归属键含 TenantId 分量。**改的只有三处措辞**：设计依据表那两行的 rev 标注与一句「工作区不是目录」，
  S-22 首段补「路径指认的是承载它的那个目录」，[G-07](v1/contract.md#十已知缺口) 的问题句改为「承载它的那个宿主机目录」并记 PF-002 已把目录之外的承载形态列为非目标。
  PF-015 rev 9 只加 §6.13 与第 10 项可空，[S-28](v1/contract.md#s-28-当前租户身份在创建那一刻捕获) 引的 §6.12 原文未变，只改 rev 标注。
  **不新增证据义务；[IS-3](v1/examples.md) 的场景（两个租户身份挂同一目录 D）在新定义下照旧成立。**
  **工作区 opt-in、创建时必须归会话捕获的租户**这两条新规则不落在本契约——它们是会话与资产领域契约的输入，届时按 [S-28](v1/contract.md#s-28-当前租户身份在创建那一刻捕获) 消费捕获的 TenantId。
- **未落盘：能力拆分投票裁定的修正 1**（2026-09-22，依据
  `record/proposals/tenant-capability-split/`）。
  裁定方向是把「当前租户身份」这项选择的存与取从
  `capability.organization-governance` 移到 `capability.account-identity`，
  本契约本应随之改两处**点名**：[S-19](v1/contract.md#s-19-不可用即明确失败) 第 3 行
  指向的查询面坐标，以及 [S-28](v1/contract.md#s-28-当前租户身份在创建那一刻捕获)
  第一句「由组织治理契约的查询面按 LoginStateId 给出一个 TenantId」。
  **移交本轮未落盘**（初值需要个人组织的 `OrganizationId`，
  那是 [`#S-3`](v1/contract.md#s-3-organizationid) 定义的不透明、存储生成、不可从 `AccountId` 派生的值，
  账号契约算不出来，硬算就会翻转依赖方向；详见
  [`capability.organization-governance` 的验证入口](../../capabilities/organization-governance/verification.md#变化的影响)），
  **因此这两处点名保持指向治理契约，本契约一个字未改**，已有结论不受影响。
- **已执行：PF-001 升到 rev 15**（2026-09-22，
  [changelog rev 15](../../../product/PF-001-identity-scope-and-agent-constraints/design.md)）。
  **rev 15 只改 [flows §4](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作) 成员名单那一行**
  （拆成「有效成员」与「已解除的成员」两行，后者只归超管），**本契约不受影响**——
  [设计依据那张表](v1/contract.md#设计依据)没有一行落在 flows §4 上，**原文逐字未变**。
  [S-10 MembershipStanding](v1/contract.md#s-10-membershipstanding) 那条「名单上的有效性不得作准入依据」
  **同样一字不动**：它管的是那一格与一次判定的关系，**与谁有资格读那份名单无关**，
  治理契约把读它的授权拆成两档也不触及这一条。
  **只改 rev 标注**：抬头「产品依据以 PF-001 rev N 为准」，`rev 14` → `rev 15`。
  **不新增证据义务，已有结论不受影响。**
- **已执行：PF-001 升到 rev 14**（2026-09-22，
  [changelog rev 14](../../../product/PF-001-identity-scope-and-agent-constraints/design.md)）。
  **rev 14 只改了 [flows §4 角色与操作](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作) 那张表**
  （补三行读面授权，答的是 `capability.organization-governance/v1` 登记的缺口 G-11），
  **本契约不受影响**——[设计依据那张表](v1/contract.md#设计依据)引的全是 `design.md` 的小节与
  [flows §3.3](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)，
  **没有一行落在 flows §4 上，原文逐字未变**。
  **特别核过 [S-10 MembershipStanding](v1/contract.md#s-10-membershipstanding)**：
  它点名 [`capability.organization-governance/v1#S-59`](../../capabilities/organization-governance/v1/contract.md#s-59-列出组织成员) 的返回
  **不得作准入依据**，理由是那份名单上的「有效性」是 `MembershipStanding` 的**投影**
  （与角色并列、没有失败支），**与谁有资格读那份名单无关**。
  rev 14 把 `#S-59` 的授权由超管放宽为有效成员，**这条禁止一字不动**，
  [Schema 里那段同句的 description](v1/identity-values.schema.json) 同样不动，形状自检仍然有效。
  **只改 rev 标注**：抬头「产品依据以 PF-001 rev N 为准」，`rev 13` → `rev 14`。
  **不新增证据义务，已有结论不受影响。**
- **已执行：PF-001 rev 11 落盘的复核**（2026-09-22，
  [changelog](../../../product/PF-001-identity-scope-and-agent-constraints/design.md)）。
  **复核对象**：[S-2](v1/contract.md#s-2-登录标识不是-accountid) 的「本版无变更路径」。
  **复核依据**：[§2 非目标](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)
  已列「**登录标识的修改**……本版**不提供改**」；
  [§4 账号的属性表](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)
  「登录标识」一行写「**本版不可改**」，「何时确定」写「注册时，此后不变」。
  **复核结论**：正文与 S-2 **逐条一致**——两条性质（部署内唯一、只指认不证明持有）**都没有变**，
  rev 11 补的是「不可改」这一条本契约已经假定的事实，它从「已裁未落盘」变成有正文依据。
  **语义不变、表示不变，不出新版本**；契约的设计依据一行已改标 **rev 11**，
  S-2 正文里那句「rev 11 落盘中、设计依据仍标 rev 10」随之删去。
  **已有证据全部仍适用**——[Schema 形状自检](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)
  不涉及登录标识的可变性，其范围与局限不因这次复核改变。
  **反过来的推论不成立**：将来产品若开放修改登录标识，S-2 的两条禁止（不进 TenantId、不作归属键）
  仍成立，但 [SC-8](#静态检查义务) 的「标识不被解析」与账号能力那侧的唯一性收场都要重判。
- **已执行：PF-001 升到 rev 12、PF-003 的标注对齐到 rev 4**（2026-09-22，
  [PF-001 changelog](../../../product/PF-001-identity-scope-and-agent-constraints/design.md)）。
  **本轮改动直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，
  未接受、未冻结，[不可原地覆盖的是已发布规格](../../README.md)。
  （**catalog 已于当日晚些时候登记**，状态仍是 `candidate`，资源未进 `frozen.json`——
  **登记不是发布**，这句推理不受影响。）
  **改了两条，都是值语义，不是表示**：

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **[S-15](v1/contract.md#s-15-shareancestor) `shareAncestor` 改为含自身** | 定义式由「两条不含自己的上级链求交」改为「**把各自算进自己的上级链之后**求交」，并写明它**等价于同一棵隶属树（根相同）**；「含个人组织的一对恒为假」补上**「两者不同」**这个限定；[CS-4](v1/contract.md#cs-4-分享边界有共同上级)（本轮之前名为「场景 4」）同步 | **Schema 与实例不受影响**——`shareAncestor` 是一条判定式，不是 Schema 里的字段，[Schema 形状自检](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)**仍然有效**，范围与局限不变。受影响的是**组织治理契约那侧的 Alloy 断言**（`ShareAncestorIsSameAffiliationTree` 由「预期反例」翻成「预期无反例」），那份证据不在本包 |
  | **[S-3](v1/contract.md#s-3-organizationid) OrganizationId 补一句「个人组织被清除后其标识不复用」** | 「不回收、不复用」这条**没有变**；变的是它的理由——组织从「本版没有终结路径」变成「只有一条终结路径，而那条路径同样不回收标识」。另在 [S-2](v1/contract.md#s-2-登录标识不是-accountid) 补写「不可改 ≠ 永远属于同一个账号」：**登录标识可释放，OrganizationId 不复用**，两者正相反 | **无新增义务，但多了一条要真跑的理由**：本版之前组织根本没有终结路径，「不复用」这句话没有可被违反的场景；现在**有了**。它的证据形式**不在本包**——标识由组织治理契约的提供者生成，[那条清除操作](../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)明写「`OrganizationId` 不回收」，演练归它 |

  **本契约没有新增或删除任何条款号，也没有新增证据义务。**
- **已执行：评审轮一修订**（2026-09-22）。
  一位 spec-reviewer 独立评审本契约 v1，处置由主线裁定，逐条落在 v1 上——
  **本契约仍是 `candidate`，未接受、未冻结，
  [不可原地覆盖的是已发布规格](../../README.md)，因此不发布第二个版本。**
  **条款只追加不重排**：S-1～S-34 的编号与顺序原样保留，本轮只新增 [S-35](v1/contract.md#s-35-交接凭证-handoff-warrant)。

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **新增 [S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 交接凭证**（本行「与一次尝试」「不跨尝试复用」的口径已由评审轮三那一行取代） | 原本三份契约各自描述「依据」，没有拥有者，且都没写**不可伪造**——次序守卫因此可能整条落空。本轮把共用定义落在这里：不透明、由一步操作产出、绑定一个对象标识（本版为 AccountId）与一次尝试、由下一步核实（存在／绑定／由产出方签发）、核实方不核实它断言的领域事实、不跨尝试复用；**不可伪造写成契约承诺**，机制归 realization。Schema 新增 `$defs/HandoffWarrant` | **新增三条义务**：[V-13](#证据义务)（四支演练，含伪造那一支）、[SC-8](#静态检查义务) 扩到凭证、[V-1](#证据义务) 的条款列加 S-35。**形状自检新增 6 行**，但那 6 行**不支持六条性质中的任何一条** |
  | **[S-31](v1/contract.md#s-31-不透明标识的交换表示) 把「空白」定成显式码点集合** | 由 `\S` / `$` 改为显式否定字符类 ＋ `(?![\s\S])` 绝对结尾。理由是两处引擎差异：ECMA-262 的 `\s` 含 U+FEFF、Python 的不含；Python 的 `$` 匹配到「末尾换行之前」 | **这是本轮唯一一处改变了「什么被 Schema 接受」的修订**：旧 pattern 在 CPython 下**接受**尾随换行与前导 U+FEFF 两类串，新 pattern 拒绝。**语义没变**（S-31 一直禁止首尾空白），**表示的判定结果变了**——旧实例集的结果**不可外推**，[自检已按新 pattern 重跑](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)。两条反例进 [`examples.md` 第 1 节](v1/examples.md#1-accountid)作回归用例 |
  | **[§四](v1/contract.md#四派生谓词)不再整体自称纯值判定** | 改为逐条分：只有 [S-13](v1/contract.md#s-13-sameaccountdistincttenants) 是纯值；[S-14](v1/contract.md#s-14-上级组织与上级链)／[S-15](v1/contract.md#s-15-shareancestor) **读组织记录、会失败**，读不到按 [S-19](v1/contract.md#s-19-不可用即明确失败) 收场 | **[S-19](v1/contract.md#s-19-不可用即明确失败) 的适用面由一处扩为四类读面**（成员资格、上级链、当前租户身份查询、其他被点名的判定依据读面），[V-5](#证据义务) 的故障注入范围**随之扩大**：只注入成员资格存储不足以覆盖本条，**组织记录那一路要单独注入** |
  | **[S-14](v1/contract.md#s-14-上级组织与上级链)／[S-15](v1/contract.md#s-15-shareancestor) 声明为定义权威，函数名统一 `ancestorChain`** | 原写作 `ancestors(o)`，与组织治理契约的 `ancestorChain` 不一致；本轮统一，并写明消费者带坐标引用、不各自复述定义 | **[V-8](#证据义务) 的成立前提多一条**：组织治理那份结构模型必须**引用**本契约的定义，不是各写一份。**两处定义式一旦分叉，那份模型检查的就不是本契约的条款** |
  | **[S-4](v1/contract.md#s-4-organizationkind) 不再自列个人组织的结构性禁止** | 改为引用 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1 #S-6`（**恰四条**）；本契约只留两句数据形状后果 | **无新增义务。**去掉的是一份会过期的副本：本契约既没有那些操作也没有那些失败值，自列一份漏了也判不出来 |
  | **[S-16](v1/contract.md#s-16-按归属层显式携带身份值) 写死持久形状** | 存一个带判别式的 `ScopeLayerIdentity`，**不得**改存成两个可空身份列 | **新增 [SC-9](#静态检查义务) 与 [V-12](#证据义务)**。它是**形状核对**不是运行时演练，因此**不进** [IS 表](v1/examples.md#13-隔离义务的规范场景) |
  | **[S-12](v1/contract.md#s-12-缺席与空值都不是身份值) 限定「一律拒绝」的适用位置** | 只在身份的**输入位置**成立；official 资产的作者字段是**合法缺席**，不触发 [S-18](v1/contract.md#s-18-缺席即拒绝) | **[V-9](#证据义务) 因此要走两支**：只走拒绝那支，会把一个「所有缺席一律拒」的实现判成通过 |
  | **[S-21](v1/contract.md#s-21-判定依据的构成封闭) 限定适用面** | 只封闭**租户范围对象的准入判定**；**流转边界判定**的输入是[上级链](v1/contract.md#s-14-上级组织与上级链)（组织结构事实），单独写明 | **无新增义务**，但 [SC-1](#静态检查义务) 的检查对象要分清是哪一种判定函数——**把上级链当成违反 S-21 的入参报出来，是误报** |
  | **[S-10](v1/contract.md#s-10-membershipstanding) 写明唯一读面与 `unavailable` 的承载方式** | 对应到 `capability.organization-governance · v1 #S-26`；`unavailable` **必须以返回值承载**，不得走带外错误通道 | **[V-5](#证据义务) 的通过判据更严**：注入之后不仅要「明确失败」，还要确认失败是**从返回值分支**出来的，不是从一个异常里捞出来的 |
  | **场景两组改为带 id 的两套编号** | 契约第八节 → `CS-1`～`CS-10`（消费者路径走查）；`examples.md` 第 13 节 → `IS-1`～`IS-10`（隔离义务演练脚本）。两处各自是唯一定义处 | **新增 [V-14](#证据义务)** 登记 CS 那一组；此前它们**一条也没有登记为义务**。**[S-13](v1/contract.md#s-13-sameaccountdistincttenants) 的唯一落点就在 V-14**——纯值判定，Schema 管不到、静态检查也查不出 |
  | **[G-01](v1/contract.md#十已知缺口) 补第二个阻断面** | 除 [S-11](v1/contract.md#s-11-scopelayeridentity) 的第三个变体外，补写 **[S-16](v1/contract.md#s-16-按归属层显式携带身份值) 对会话级对象不给落点** | **无新增义务**；它改变的是**谁该在这里停下来报缺口**——要把对象归属记到会话这一层的 owner，此前读不出自己被阻断 |
  | **证据义务补齐九条无落点的条款** | [S-3](v1/contract.md#s-3-organizationid)、[S-9](v1/contract.md#s-9-loginstateid) 并入 [SC-8](#静态检查义务) 与 [V-2](#证据义务)；[S-16](v1/contract.md#s-16-按归属层显式携带身份值)／[S-18](v1/contract.md#s-18-缺席即拒绝)／[S-27](v1/contract.md#s-27-每道准入现读) 各立义务行（V-12／V-9／V-11）；[S-22](v1/contract.md#s-22-路径是地址不是钥匙)／[S-34](v1/contract.md#s-34-语义身份与实现地址分开) 补进 V-2 与 [V-10](#证据义务)；[S-33](v1/contract.md#s-33-表示层校验与判定分开) 补进 V-9；[S-13](v1/contract.md#s-13-sameaccountdistincttenants) 补进 V-14 | **「没有义务行」此前被读成了「没有义务」。**补齐之后**没有一条条款是零落点的**；但**补齐落点不等于取得证据**——新增的 V-9～V-14 **状态一律「未开始」** |

  `registry` 那一侧的 `catalog.clauses` 与 `covers` 已于同日随本轮由主线统一登记
  （见 [registry 当前状态](../../../registry/README.md#当前采用)）；本页**不代替那次登记**。
- **已执行：PF-001 升到 rev 13 的复核**（2026-09-22，
  [changelog rev 13](../../../product/PF-001-identity-scope-and-agent-constraints/design.md)）。
  **改动直接落在 v1 上，不发布第二个版本**（本契约仍是 `candidate`）。
  **逐条复核结论：三处校准，语义与表示都没变。**

  | rev 13 改了什么 | 本契约受影响的条款 | 复核结论 |
  |---|---|---|
  | **「管理资格」判为笔误，本版 ＝ 超管**；[§6.4](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) 那句改为「组织的**超级管理员身份**不带来成员个人范围的访问权」 | [S-29](v1/contract.md#s-29-层事实只以显式身份值为键) 第三条抄的是旧句 | **措辞已同改并加链接。语义不变**——本契约从来只认 [S-8](v1/contract.md#s-8-tenantrole) 的两个取值，从未定义过第三种资格，所以旧句指的本来就是超管。**没有条款需要改判**，也没有证据需要重取 |
  | **上级组织「创建时可指定」删掉**，改为「创建时为空，此后经隶属请求建立」 | [S-14](v1/contract.md#s-14-上级组织与上级链) | **不受影响。**S-14 只定结构约束的**表达**（至多一个、不成环、个人组织不参与），**建立与解除的操作面本来就归组织治理契约**。rev 13 消除的是产品正文内部的一处自相矛盾，**本契约没有跟着它写过任何东西** |
  | **未激活记录到期清除时，个人组织与第一个租户随之消失** | [S-3](v1/contract.md#s-3-organizationid)、[S-6](v1/contract.md#s-6-tenantid-无生灭路径) | **S-3 不变**（「个人组织被清除后其标识不复用」rev 12 已写，rev 13 只是补齐了产品依据）。**S-6 补了一段读法**：消失的是**记录**，不是**值**；并写明消费者**不得**因此造一个通用的「按租户删除」入口。**这是澄清，不是新规则**——S-6 一直写着「有状态的是记录」 |

  **对证据的影响：一条也没有。**[形状自检](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)不涉及上面任何一项；
  新增或修改的证据义务**全部来自评审轮一修订那一条**，不来自 rev 13。
  **契约首部的产品依据已由 rev 12 改标 rev 13**，[设计依据表](v1/contract.md#设计依据)的
  PF-001 各行锚点已逐条重核（§4 新增段落、§2 非目标改行之后**仍然全部解析得到**）。
- **已执行：评审轮二修订**（2026-09-22）。
  复评（第二轮独立评审）对本契约 v1 的发现，处置由主线裁定，逐条落在 v1 上——
  **本契约仍是 `candidate`，未接受、未冻结，
  [不可原地覆盖的是已发布规格](../../README.md)，因此不发布第二个版本。**
  **条款号一个没动**：S-1～S-35 的编号与顺序原样保留，本轮**不新增、不重排、不删除**任何条款。

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **[`MembershipStandingResult`](v1/contract.md#s-10-membershipstanding) 保持两支，表示层拒绝写在本类型之外** | 消费者 `capability.organization-governance · v1 #S-26` 新增了 `invalidInput` 失败值。**本类型不因此多一支**——它是「判定结果」的类型，而 `invalidInput` 按 [S-33](v1/contract.md#s-33-表示层校验与判定分开) **不是判定结果**。[S-10](v1/contract.md#s-10-membershipstanding) 补写：表示层拒绝由**操作自己的失败集合**承载，**同样以返回值承载、同样不走带外通道**；并写明 S-26 的返回是一个**闭合和** `invalidInput` \| `MembershipStandingResult`。[CS-10](v1/contract.md#cs-10-成员资格读不到) 与 [S-19](v1/contract.md#s-19-不可用即明确失败) 第 1 行同步 | **Schema 与实例不变**——`invalidInput` 本来就不在 `$defs/MembershipStandingResult` 里，[`examples.md` 第 9 节](v1/examples.md#9-membershipstandingresult) 的八行一行不改，[形状自检](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)**仍然有效**。**[V-14](#证据义务) 的 CS-10 走查多一支**：要确认调用方**先分和、再分右项的两支**，共三个分支 |
  | **[S-10](v1/contract.md#s-10-membershipstanding)「唯一的读面」改成「准入判定必须用的那个读面」** | `capability.organization-governance · v1` 另有 [`#S-59`（列出组织成员）](../../capabilities/organization-governance/v1/contract.md#s-59-列出组织成员)与 [`#S-27`（我的租户）](../../capabilities/organization-governance/v1/contract.md#s-27-我的租户)也会说到成员关系，旧措辞因此不成立。改为逐条写明：**这两个读面的返回一概不得作准入依据**，现读一律走 `#S-26`；`#S-59` 每项里的「有效性」是 `MembershipStanding` 的**投影，不是同一形状**（它与角色并列、没有失败支），`#S-27` 给的是一份 `TenantId` 列表这种**视图** | **无新增义务**，但 [V-14](#证据义务) 的走查判据更严：一次「照着名单放行」**即为反例**，不必等到真的放错一次。**小节标题改了**，本包内引它的那处锚点（[S-19](v1/contract.md#s-19-不可用即明确失败) 第 1 行）已同步；**本包之外没有引用它的地方**。**订正（评审轮三）**：这句「本包内已同步」当时不实——[Schema](v1/identity-values.schema.json) 的 `$defs/MembershipStandingResult.description` 仍写着「本版唯一的成员资格读面」，与改后的 S-10 互斥，**同版本两份规范工件说了两样话**；已于[评审轮三修订](#变化的影响)改成与 S-10 同句 |
  | **[S-19](v1/contract.md#s-19-不可用即明确失败) 第 3 行右列换成 `#S-36` 的实际出口** | 旧写法「这次登录还没选过」**不是** [`#S-36`](../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 的任何一个出口。改为它实际的两个已做出的出口：④ **尚未切换过时给出的初值 `TenantId`**（`(该账号的个人组织, 该账号)`），⑧ 校验说「拒绝」时的 **`loginStateNotValid`**；中列同时点名 ⑧ 的 `unavailable` 作为「读不到长什么样」，**都带坐标** | **[V-5](#证据义务) 的故障注入对象更明确**：这一路要注入的是**登录状态校验那一侧**，观察是否拿到 `unavailable` 而不是一个初值或 `loginStateNotValid`。**没有新增义务行** |
  | **[设计依据表](v1/contract.md#设计依据)的引文不再只点 S-35** | 旧引文只说 S-35 没有行，读起来像「只有它一条」。改为逐条点名：**S-35 哪一行都不来自**；**[S-7](v1/contract.md#s-7-tenantid-的规范序列化形式)／[S-12](v1/contract.md#s-12-缺席与空值都不是身份值)／[S-31](v1/contract.md#s-31-不透明标识的交换表示)～[S-33](v1/contract.md#s-33-表示层校验与判定分开) 由 SYS-SPEC 供给**、**[S-23](v1/contract.md#s-23-不得冒充隔离) 由 SYS-TENANT 供给**、**[S-30](v1/contract.md#s-30-跨边界须重新验证) 由 SYS-TENANT ＋ SYS-DEPLOY 供给**（**S-7 是本轮点出来的，评审名单里没有它**，见下） | **无。**这是依据的登记方式，不改变任何条款的语义或表示 |
  | **[§六](v1/contract.md#六装配给与协议给)抬头改为「只列跨部署形态会变的判定」，并补 [S-19](v1/contract.md#s-19-不可用即明确失败)、[S-23](v1/contract.md#s-23-不得冒充隔离) 两行** | 旧抬头说「把本契约的**每项**判定分成两类」，而表里从来就不是每一项。抬头改口径并写明「不在表里不等于不适用」；补的两行：**S-19**——跨进程后读失败先表现为传输层的事，协议须把它们映射到同一个失败支并**以返回值**到达调用方；**S-23**——按租户分主题/分片/分库、甚至每租户独立部署**都不构成隔离**，它们是地址（[S-34](v1/contract.md#s-34-语义身份与实现地址分开)） | **[V-7](#证据义务) 的补做清单多一项**：跨进程演化启动时「须由协议兑现」的那一档**由十项变成十一项**（新增的是 S-19 那行；**S-23 那行右列写的是「不变」**，它加的是冒充物清单，不是一项待兑现）。**本版仍无法演练**，这一条不改变那个状态 |
  | **[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 实例表把「绑定一次尝试」落到两个实例上** | 性质 4 此前只有一句通则，两个实例各自的「那一次」指什么没有落点。现在写死：**激活依据绑定一次注册尝试**，下一次尝试须自己走一遍第 ② 步才拿得到；**清除依据绑定一次清除链执行，且一次性**——被 `capability.account-identity · v1 #S-38` 核实之后即作废，**重扫须重新经 `capability.organization-governance · v1 #S-53` 取得**（它幂等返回成功并再产出一份）。作废由核实方兑现，机制仍归 realization | **[V-13](#证据义务) 的第三支判据变具体**：「带一份上一次尝试的凭证」对两个实例是两种构造——注册那一侧是**上一次注册尝试**的依据，清除那一侧是**上一轮扫描**的、且已被核实过的那一份。**义务数不变** |
  | **[消费者表](v1/contract.md#消费者)两行校准** | account-identity 行补 **[S-33](v1/contract.md#s-33-表示层校验与判定分开)**（它八个操作统一的 `invalid-input` 按本条不得被记成判定结果），并写明 **[S-30](v1/contract.md#s-30-跨边界须重新验证) 是引用不是消费**——该契约的「装配给 vs 协议给」表两处指向本条，没有从本条取承诺，catalog 的 `clauses` 因此也不含它；registration 行的「catalog 依赖登记待 registry 补」改为**已登记**（2026-09-22，`clauses = S-1 / S-2 / S-35`）。[包入口](README.md)同步 | **无新增义务**；它校准的是**采用面的读法**。**catalog 与本页不互为依据**：登记在 [registry](../../../registry/README.md)，本页只如实转述当日的登记内容 |

  **PF-002 的依据 rev 也在本轮校准**，复核结论单列如下。
- **已执行：PF-002 升到 rev 9 的复核**（2026-09-22，
  [PF-002 changelog rev 9](../../../product/PF-002-assets-settings-and-permissions/design.md)）。
  **复核结论：不受影响，语义与表示都没变，不出新版本。**
  rev 9 **只动了两处，都在 `flows.md`**——
  [§1.1](../../../product/PF-002-assets-settings-and-permissions/flows.md#11-给组织加一个资产) 第 1 步的触发者、
  [§3.1](../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)「加入」「禁用」两行的前置——
  把已被 PF-001 rev 13 裁掉的「管理资格」改成**该范围的管理者（组织层是超级管理员，租户层是本人）**。
  **本契约引的是 PF-002 的另外三节**：
  [§5.2](../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)（配值资格来自持有）、
  [§4 工作区](../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)、
  [§5.8](../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)（工作区不是一重身份），
  **三节 rev 9 一个字也没改**，锚点逐条重核**仍然全部解析得到**。
  本契约**从来不定「谁能加入或禁用一个资产」**——那是资产领域契约的授权前置，
  本契约只给它做键的那些身份值（[CS-1](v1/contract.md#cs-1-资产持有的键与属性配值)）。
  **[设计依据表](v1/contract.md#设计依据)的三行与[消费者表](v1/contract.md#消费者)的资产领域行已由 rev 8 改标 rev 9**；
  **对证据的影响：一条也没有。**
- **已执行：评审轮三修订**（2026-09-22）。
  第三轮独立评审对本契约 v1 提出阻断 1 条、非阻断 7 条，处置由主线按「判得对吗、合理吗、本阶段必需吗」三问裁定
  （处置表在本次任务区，不进设计链），逐条落在 v1 上——
  **本契约仍是 `candidate`，未接受、未冻结，[不可原地覆盖的是已发布规格](../../README.md)，因此不发布第二个版本。**
  **条款号一个没动**：S-1～S-35 原样保留，本轮不新增、不重排、不删除任何条款。
  **本轮有一处改变了 [S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 的语义**（撤销「一次性」与「绑定一次尝试」），其余是规范工件互斥的订正、归属与口径。

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 性质 4 撤销「一次性」与「绑定一次尝试」**（跨包同改第 1 条） | 性质 4 改为：两个实例**只绑定 AccountId**，**不绑定尝试、本版不作废**；重放安全由核实方在自己提交里的前置现读承担（`capability.account-identity · v1 #S-14 ③`／`#S-38 ②③`）。理由逐实例写在新小节[「性质 4 在两个实例上为什么站得住」](v1/contract.md#性质-4-在两个实例上为什么站得住)：两个实例断言的事实在本版**一经成立不再变假**（个人组织只有清除这一条终结路径且只对已过期记录成立；被清除后再也建不出来），核实方又本来就现读自己的状态前置，**重放造不成任何错误效果**，作废是一份无收益的运行时状态。旧小节「性质 4 在两个实例上各自是什么」与实例表里的「一次性」行**整体删去**；性质 6 与实例表同时写明**非对称**（见下一行）。同步改动：机制表的登记项由 `(值 → 标识, 尝试)` 改 `(值 → 标识)`；[P-14](v1/contract.md#性质) 的性质句与反例句；[Schema 管得到什么](v1/contract.md#schema-管得到什么)的 S-35 行；Schema `$defs/HandoffWarrant` 的 `description`／`$comment`；[`examples.md` 第 11 节](v1/examples.md#11-handoffwarrant)引注 | **[V-13](#证据义务) 第三支翻了方向**：「带一份上一次尝试的凭证」从「必须被拒」改为「**核实通过**，被守卫的那一步由核实方的现读定收场，任何交错下不产生错误效果」——观察对象从凭证核实挪到了核实方的前置现读。**义务数不变。**评审轮二那一行记的「一次性」判据**由本行取代**。**Schema 形状不变**（`HandoffWarrant` 仍是非空字符串），[形状自检](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)**仍然有效**。**组合与账号契约那侧的「绑定本次尝试」措辞**（`composition.account-registration · v1 #S-8` 激活依据一节、`capability.account-identity · v1 #S-14` 第 2 条）**由其 owner 同轮对齐**；本契约已写明「同一次尝试内产出即用」若保留，是组合对自己动作链的流程规则，不由凭证承载 |
  | **[S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 性质 6 写明非对称**（N-1） | 旧句「核实通过只说明产出方在它自己的提交里做到了」对激活依据不成立——它的产出方是**被守卫的组合本身**，组合没有自己的提交，[S-14](../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 只核签发方。改为：核实通过只证明「由该产出方签发」；产出方是一条操作（清除依据）时等于「在自己提交里做到了」，产出方是被守卫的组合（激活依据）时，「只在事实成立时才签发」由 `composition.account-registration · v1 #S-8 ②` 承担。实例表「绑定与核实」一列逐实例写死 | **无新增义务。**它改变的是 [V-13](#证据义务) 演练结果的**解释**：激活依据那一侧，核实通过**不**证明「个人组织存在」，那条事实的证据在组合契约的行为模型，不在本包 |
  | **Schema `$defs/MembershipStandingResult.description` 与 [S-10](v1/contract.md#s-10-membershipstanding) 互斥**（B-1） | 评审轮二把 S-10 的「唯一的读面」改成「准入判定必须用的那个读面」，但 Schema 的 description 仍写「本版唯一的成员资格读面」——同版本两份规范工件说了两样话。description 改为与 S-10 同句，并点名 `#S-59`／`#S-27` 的返回不得作准入依据；[轮二那一行](#变化的影响)的「本包内已同步」加订正 | **Schema 形状不变**——`description` 不参与校验，[形状自检](#已执行schema-形状自检2026-09-22评审轮一修订后重跑)**仍然有效**。**无新增义务** |
  | **[S-10](v1/contract.md#s-10-membershipstanding) 不再自列 S-26 的返回和**（N-3） | 旧文「因此 S-26 的返回是一个闭合和…恰两项，没有第三项」是在本契约里复述另一份契约的返回形状，与 [S-4](v1/contract.md#s-4-organizationkind) 不自列治理契约条款的先例相反。改为带坐标引用 `capability.organization-governance · v1 #S-26`，本契约只留自己拥有的那句：**右项恰两支**、表示层拒绝在本类型之外、消费者先分和再分右项。[CS-10](v1/contract.md#cs-10-成员资格读不到) 同步 | **无新增义务**，[V-14](#证据义务) 的 CS-10 走查三分支不变。去掉的是一份会随 S-26 改动而过期的副本 |
  | **「引用即消费」判据落到[消费者表](v1/contract.md#消费者)**（N-4，跨包同改第 2 条） | 主线定判据：**正文以坐标引用某条款即登记为消费，只有否定式提及不登**。account-identity 行的 [S-30](v1/contract.md#s-30-跨边界须重新验证) 由「引用不是消费」改为列入消费，**共七条**；[包入口](README.md)同步。catalog 的 `clauses` 已按七条登记（登记在 [registry](../../../registry/README.md)，本页只转述） | **无新增义务。**评审轮二那一行记的「S-30 不含于 clauses」**由本行取代** |

  **对证据的影响汇总**：形状自检仍然有效；V-13 第三支判据改向、义务数不变；没有新增或删除任何义务行。
- **[G-01](v1/contract.md#十已知缺口) 被裁决**（会话级作用域层身份的标识表示定下来）：
  [S-11](v1/contract.md#s-11-scopelayeridentity) 获得第三个变体，**表示改变，须发布新版本**；
  本版的 V-1 结果只保留其两变体范围，不得外推。
- **[G-04](v1/contract.md#十已知缺口)／[G-05](v1/contract.md#十已知缺口) 被裁决**（标识词法、标量键编码）：
  值语义不变，但 Schema 会收紧（pattern、maxLength）⇒ **表示改变，须发布新版本**；
  V-1 须按新形状重跑，旧实例中依赖宽松形状的那些要重新判。
- **跨进程演化启动**：V-7 从「无法演练」转为**必须演练**；
  [第六节](v1/contract.md#六装配给与协议给) 右列**写着「须由协议兑现」的那十一项**（评审轮二补 S-19 之后）从「待兑现」转为「须由协议兑现」。
  **本版的全部证据只保留其单机范围，不得外推。**

结果不改写规范。发现语义问题回到来源设计（PF-001／PF-002／PF-003／PF-015／PF-007），
不在这里改契约。
