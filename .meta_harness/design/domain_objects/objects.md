# 对象条目

**每条一个有身份的对象**：宿主、身份靠什么、怎么生怎么灭，各指回产品正文的哪一节。
格式与对账规矩见 [conventions](conventions.md)；总表是派生的[领域对象地图](../views/domain-object-map.md)。

> **这里的每一句都该指得回「依据」。与依据不一致时，以依据为准，改这里。**
> 「正文未述」是照实写的缺口，不是待填的空。

按[统一语言](../ubiquitous_language/index.md)的分卷排——那是全链里唯一不随对象重新分解而搬家的维度。
**这不是能力边界，也不是限界上下文**；那是系统架构设计的事。

## 主体与归属

### UL-account · 账号

- **宿主**：—
- **身份**：登录标识，整个部署内唯一，注册时确定
- **生灭**：（不存在）→ 未激活（标识已占用）→ 已激活（前置：个人组织已存在；不可逆）。未激活那一条**有留存期限**（按部署配置）：期限内同标识同凭据重来认回的是它，**到期记录清除、登录标识释放，连同为它建的[个人组织](#ul-organization--组织)与[第一个租户](#ul-tenant--租户)一起消失**，回到（不存在）。**已激活之后本版无注销、终止、恢复**
- **依据**：[PF-001 §4 账号](../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)（rev 16）；[PF-001 §4 未激活的账号记录不会永久占着那个名字](../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)（rev 16）；[PF-001 flows §3.1](../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)（rev 16）

### UL-login-state · 登录状态

- **宿主**：[账号](#ul-account--账号)——它是以这个账号的身份通过鉴权的一次登录。账号本版无注销，「账号没了它怎么办」正文无从谈起
- **身份**：正文未述靠什么标识；只写明彼此分得出——重新登录是新的一个，多处登录各是一个，退出只失效被退出的那一个。**属于签发它的那个[治理中心](#ul-governance-center--治理中心)**，那是它身份的一部分（[PF-016 §4 治理中心](../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)，rev 3）。**同账号的有效登录状态能被逐个列出（每一个带签发时间）并逐个指定撤销**，可分辨到这个程度
- **生灭**：（无）→ 有效（登录；前置：账号已激活、凭据正确）→ 已失效（退出或被撤销；不可逆，且重启之后依然成立）。本版不做全设备退出
- **依据**：[PF-001 §4 登录状态](../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)（rev 16）；[PF-001 flows §3.2](../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)（rev 16）；[PF-001 flows §1.2](../product/PF-001-identity-scope-and-agent-constraints/flows.md#12-登录)（rev 16）

### UL-organization · 组织

- **宿主**：—
- **身份**：正文未述
- **生灭**：由已激活账号创建，创建者同时成为超管、其租户同时产生，一次提交，不存在无管理员的中间态 → 存续；**团队组织本版无终结路径**（不要求解散）；**个人组织唯一的消失路径是随未激活[账号](#ul-account--账号)到期清除**——它在注册第 2 步随账号记录一并建起，账号记录到期被清时随之消失
- **依据**：[PF-001 §4 组织](../product/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 16）；[PF-001 §4 个人组织](../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)（rev 16）；[PF-001 §4 未激活的账号记录不会永久占着那个名字](../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)（rev 16）；[PF-001 flows §1.4](../product/PF-001-identity-scope-and-agent-constraints/flows.md#14-创建组织)（rev 16）

### UL-invitation · 邀请

- **宿主**：[组织](#ul-organization--组织)——**发出它的那个组织**：它不存在了，这份邀请随即自动过期。它指向一个账号，但那个账号在接受之前对它没有任何持有；个人组织发不出邀请
- **身份**：正文未述
- **生灭**：发出，**带一个到期时刻** → 被接受（成员关系建立，[租户](#ul-tenant--租户)随之产生）；接受之前可以被撤回，也会过期——邀请这一类有默认时长、发出时发起者可指定这一份的，发出它的组织不存在了则自动过期（**这一分支本版无触发源**：[没有任何邀请指向个人组织——个人组织发不出邀请，而团队组织无终结路径](#ul-organization--组织)）；三种收场相同，只能重新发一份
- **依据**：[PF-001 flows §1.5](../product/PF-001-identity-scope-and-agent-constraints/flows.md#15-邀请与加入)（rev 16）；[PF-001 flows §2](../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)（rev 16）；[PF-001 §4 两种邀约都会过期](../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)（rev 16）

### UL-affiliation-request · 隶属请求

- **宿主**：正文未述。由一个[组织](#ul-organization--组织)的超级管理员发出、指向另一个组织；个人组织不参与隶属关系，既发不出也收不到
- **身份**：正文未述
- **生灭**：发起，**带一个到期时刻** → 被接受（下级组织的「上级组织」属性有了值，**不产生租户**）；接受之前可以被撤回，也会过期——隶属请求这一类有默认时长、发出时发起者可指定这一份的，它指向的组织不存在了则自动过期（**这一分支本版无触发源**：[没有任何隶属请求指向个人组织——个人组织不参与隶属关系，而团队组织无终结路径](#ul-organization--组织)）；三种收场相同，只能重新发起一份
- **依据**：[PF-001 §4 隶属关系怎么建立与解除](../product/PF-001-identity-scope-and-agent-constraints/design.md#隶属关系怎么建立与解除)（rev 16）；[PF-001 §4 两种邀约都会过期](../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)（rev 16）；[PF-001 flows §1.7](../product/PF-001-identity-scope-and-agent-constraints/flows.md#17-建立与解除组织隶属)（rev 16）；[PF-001 flows §2](../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)（rev 16）
- **未裁**：**宿主是发起方组织还是接收方组织**。两端都是组织，而正文只写了「它**指向的**那个组织不存在了则自动过期」——发起方组织没了它怎么样，正文没说。归 PF-001 的 owner，[已记入该 topic 的「已知的来源问题」](../product/PF-001-identity-scope-and-agent-constraints/decisions.md#四已知的来源问题)

### UL-tenant · 租户

- **宿主**：—（身份由[组织](#ul-organization--组织)与[账号](#ul-account--账号)共同确定）
- **身份**：（组织, 账号）二元组；不含角色。同一账号在两个组织里是两个租户
- **生灭**：账号加入组织即产生（注册时随个人组织产生第一个；创建组织时创建者的随之产生；接受邀请时产生）→ 加入到退出之间有效，角色可调 → 解除后不再有效，其租户级私有部分不可达但不销毁，历史记录照旧引用它 → 再次被邀请加入同一组织即重新有效，**回来的是同一个租户**，私有部分原样可用。身份由（组织, 账号）确定，不因断续而变；**已激活账号的租户本版无销毁路径**；**从未激活的账号到期清除时，随账号一起产生的第一个租户随之消失**
- **依据**：[PF-001 §4 租户](../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)（rev 16）；[PF-001 §4 退出之后再加入，回来的是同一个租户](../product/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)（rev 16）；[PF-001 §4 未激活的账号记录不会永久占着那个名字](../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)（rev 16）；[PF-001 flows §3.3](../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)（rev 16）
- **并入**：「成员关系」——design 只定义租户，flows 却把「无 → 成员 → 无」的状态机挂在成员关系名下；二者同一身份，成员关系是租户「此刻有没有效」那一面。**分界：身份是值，有效性是记录**——(组织, 账号) 这一组合不生不灭、被显式携带；「此刻有没有效」才有状态、有写路径、有并发约束。**这不改变它是一个对象**，只是提醒不要把整体当成有状态的东西

## 作用域与求值

### UL-workspace · 工作区

- **宿主**：[租户](#ul-tenant--租户)——工作区由租户持有；换一个租户身份挂上同一个目录，那是另一份
- **身份**：（租户, 承载目录）——**租户内按承载目录唯一**：同一租户下同一个目录被两个会话挂上，看到的是同一份。**它不是目录**：目录是承载，路径是指认它的地址、不是它的身份依据；靠什么标识那个目录，正文未述。目录之外的承载形态本版未定义
- **生灭**：会话创建时显式指定哪一份才有哪一份，不指定这一级为空；挂上后在装配时自动解析承载目录里的特定文件；会话没了，同一租户的下一个会话挂上来还看得见。创建与终结的明确动作正文未述
- **依据**：[PF-002 §4 工作区](../product/PF-002-assets-settings-and-permissions/design.md#工作区)（rev 10）；[PF-002 §4 工作区不是目录](../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录)（rev 10）；[PF-002 §4 它是会话选用的，不指定就是空](../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空)（rev 10）；[PF-002 §5.7](../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)（rev 10）；[PF-002 §5.8 三条层序](../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)（rev 10）；[PF-002 §6.4 禁用是逐层配的布尔设置](../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)（rev 10）；[PF-015 §6.13](../product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空)（rev 9）

## 能力与构成

### UL-asset · 资产

- **宿主**：—
- **身份**：两级——上层是[能力标识，即「类别 ＋ name」](../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)，求值的产出是「每个能力标识一个生效资产」；下层是具体资产，同一标识下可并存 official、组织自定义、租户自定义、复制进来的多份。具体资产自身靠什么标识，正文未述
- **生灭**：创作出草稿 → 修订 → 发布（该版本自此不可变）→ 再改成新版本；从租户范围提升到组织范围不可逆；删除被分享出去的须先告知受影响方，不默认级联。删除之后如何，正文未述
- **依据**：[PF-002 §4 八类资产](../product/PF-002-assets-settings-and-permissions/design.md#八类资产)（rev 10）；[PF-002 §4 身份是「类别 ＋ name」](../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)（rev 10）；[PF-001 §4 资产的种类](../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 16）；[PF-002 flows §3.3](../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)（rev 10）

### UL-asset-version · 资产版本

- **宿主**：[资产](#ul-asset--资产)——每一份资产有自己独立的一条版本线
- **身份**：所属的那份资产 ＋ 它在那条版本线上的序号。版本线从 v1 起各数各的：复制过去的资产落在目标侧自己的线上，源侧的 v7 在那边可能是 v2
- **生灭**：草稿（反复修订，还不是版本）→ 发布 → 已发布，自此不可变；再改只能在它之上发新版本。复制与分享只认已发布的。版本有没有终结，正文未述
- **依据**：[PF-002 flows §3.3](../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)（rev 10）；[PF-003 §6.4](../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)（rev 4）

### UL-model-profile · 模型档案

- **宿主**：—。建在组织或租户自己那一层；它不是资产，「用哪个模型」那项设置的取值是对它的引用
- **身份**：路由名，同一范围内唯一，一旦定下不可改——改了就是另一条档案
- **生灭**：建档（建档者持有该范围的配置资格）→ 在册 → 已撤回（终态，不可逆）；撤回不删行，那一行永远保留。「这个范围不再允许它」不是它的状态转移，是作用域求值的结果变了
- **依据**：[PF-013 §4 模型档案](../product/PF-013-model-profiles-and-invocation/design.md#模型档案)（rev 4）；[PF-013 flows §3.1](../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（rev 4）；[PF-013 §6.4](../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)（rev 4）

### UL-meta-capability · meta 能力

- **宿主**：正文未述。只说每个 agent 装配起来之后，十三个各恒定占一个常驻槽位
- **身份**：按名字，全系统固定十三个；有哪十三个由产品决定，装配方不能增删
- **生灭**：装配 → 在位，没有别的状态；不可禁用、不可替换、不可移除。门自身无状态，「门后的东西有状态」
- **依据**：[PF-007 §4 meta](../product/PF-007-meta-capabilities/design.md#meta)（rev 15）；[PF-007 flows §3.1](../product/PF-007-meta-capabilities/flows.md#31-十三扇门本身)（rev 15）
- **未裁**：它与「工具」是什么关系——用的是多命令范式、别处直接叫它 meta tool，却不满足资产的判据、不是工具的变体。归 PF-007 与 PF-006

## agent 运行回路

### UL-session · 会话

- **宿主**：—（归属于[租户](#ul-tenant--租户)：**创建那一刻捕获并持有的那个租户身份**，此后不随这个账号切换而变）
- **身份**：会话的身份标识。**agent 的身份标识恒等于它**，换 agent runtime 也不变，agent 之间互相寻址靠它
- **生灭**：创建/初始化 → 运行/活跃 ⇄ 休眠（往返无上限）→ 归档（租户手动，或按出厂时限自动）→ 撤销归档回休眠。**无删除、无过期、无回收**；「运行/活跃」只看日志上最新那次运行完结没有
- **依据**：[PF-015 §4 会话的生命周期](../product/PF-015-session-lifecycle-and-ownership/design.md#会话的生命周期)（rev 9）；[PF-015 §5.1](../product/PF-015-session-lifecycle-and-ownership/design.md#51-四个状态怎么走)（rev 9）；[PF-015 §6.1](../product/PF-015-session-lifecycle-and-ownership/design.md#61-会话不会消失)（rev 9）；[PF-015 §6.12](../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)（rev 9）
- **并入**：「会话内的那个 agent」——身份恒等、一对一，没有独立于会话的身份机制，是会话的一个面

### UL-run · 运行

- **宿主**：[会话](#ul-session--会话)（附着在恰好一个会话上）
- **身份**：有身份，且「身份在数据里，不在进程里」；铸新身份是「新一次运行」的专属权利。标识形式正文未述。开始条目可带一个「延续自哪次运行」的链接
- **生灭**：有还没被承接的输入、且没有未终结的运行 → 落一条开始条目（写明承接了哪些）→ 在跑 ⇄ 停着等（卡片未答完 / 动作结果没齐；此时可以一副协程都没有）→ 落终态：完成 · 失败 · 被取消。终态是吸收态，之后再回来的东西开下一次运行；不存在「先排着」。同一会话任一时刻至多一个未终结的运行
- **依据**：[PF-012 §4 Run](../product/PF-012-agent-loop-and-run/design.md#run)（rev 7）；[PF-012 §4 边界](../product/PF-012-agent-loop-and-run/design.md#边界什么让它开始什么让它结束)（rev 7）；[PF-012 §4 Run 是三样东西的归属单位](../product/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)（rev 7）；[PF-012 §5.13](../product/PF-012-agent-loop-and-run/design.md#513-run-拥有什么归属的判据)（rev 7）；[PF-012 §5.1](../product/PF-012-agent-loop-and-run/design.md#51-run-与-agent-loop-是一体两面)（rev 7）

### UL-agent-runtime · agent runtime

- **宿主**：正文未指定；由「一个会话任一时刻至多一个活跃的 agent runtime」推断为[会话](#ul-session--会话)
- **身份**：正文未述它自己的标识方式；每次尝试重新起一个，是「新的一个」。**从运行那一侧指得到它**——(哪次运行, 第几次) 从日志里那条尝试开始记录派生，那是[执行尝试](../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)（视图，不另立对象）
- **生灭**：照一份装配清单起 → 反复求值、在 await 点挂起与恢复 → 灭（系统崩了 / 停住等时被回收 / 构成变了被优雅取消后照新清单另起）。停止分两级：优雅取消、强制停止；强制停止之后由会话这一侧替那次运行写终结条目
- **依据**：[PF-012 §4 agent runtime](../product/PF-012-agent-loop-and-run/design.md#agent-runtime)（rev 7）；[PF-012 §6.13](../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 7）；[PF-012 §6.14](../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)（rev 7）

### UL-assembly-manifest · 装配清单

- **宿主**：—（为恰好一个[会话](#ul-session--会话)求值）
- **身份**：正文未述标识方式；定位属性是「为哪个会话求的」与「依据的定义版本」，装配时确定、此后不变。同一会话先后可有多份
- **生灭**：（没有）→ 求值中 → 有效（可复用；增量装载时追加一条，仍有效）→ 失效，下次需要时重新求值出新的一份。缺必需的东西则明确失败，不产生半份。只可追加、不可改写
- **依据**：[PF-004 §4 装配清单](../product/PF-004-agent-definition-and-assembly/design.md#装配清单)（rev 9）；[PF-004 §6.7](../product/PF-004-agent-definition-and-assembly/design.md#67-装配清单的生与失效)（rev 9）；[PF-004 flows §3.1](../product/PF-004-agent-definition-and-assembly/flows.md#31-一份装配清单)（rev 9）

## 落地与隔离

### UL-execution-environment · 执行环境

- **宿主**：—
- **身份**：正文未述；每个具体的执行环境要声明自己提供哪几种设施
- **生灭**：总体正文未述，按各种分别规定。「执行环境永远存在」说的是**每次执行都算得出一个落点或明确被拒**，不是某个实例永生
- **依据**：[PF-005 §4 执行环境](../product/PF-005-execution-environments-and-sandboxes/design.md#执行环境)（rev 5）；[PF-005 §5.1](../product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 5）；[PF-005 §6.1](../product/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 5）；[PF-004 §4 执行环境](../product/PF-004-agent-definition-and-assembly/design.md#执行环境)（rev 9）

### UL-sandbox-implementation · 沙箱实现

- **宿主**：正文未述——正文只说它是**装配时可选装配**的，没说装配之后它的寿命跟着谁
- **身份**：正文未述；只要求它**自报提供哪几种设施、可绑定哪几个层级**，运行时据此匹配
- **生灭**：装配时装进来（可选，可以一个都不装）→ 在场，按声明被匹配到就起出一个沙箱。撤下与替换正文未述
- **依据**：[PF-005 §4 沙箱实现](../product/PF-005-execution-environments-and-sandboxes/design.md#沙箱实现)（rev 5）；[PF-005 §6.1](../product/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 5）

### UL-stateless-sandbox · 无状态沙箱

- **宿主**：一次[工具执行](#ul-tool-execution--工具执行)
- **身份**：正文未述
- **生灭**：一次调用开始 → 存在 → 调用结束即无；没有闲置态，没有回收问题
- **依据**：[PF-005 §5.1](../product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 5）；[PF-005 flows §3.1](../product/PF-005-execution-environments-and-sandboxes/flows.md#31-无状态沙箱)（rev 5）

### UL-session-sandbox · 会话级沙箱

- **宿主**：[会话](#ul-session--会话)
- **身份**：正文未述；同一会话先后、同时都可有多个，同时并存的理由是设施不同
- **生灭**：会话首次需要时创建、开始计时 → 存在 → 到最大连续存活时间直接销毁，数据不留存；仍有动作在跑则按退役方式收口 → 下次要用重建一个空的、重新计时，并以一条提醒告知 agent
- **依据**：[PF-005 §6.3](../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 5）；[PF-005 flows §3.2](../product/PF-005-execution-environments-and-sandboxes/flows.md#32-会话级沙箱)（rev 5）
- **未裁**：会话归档时连不连带处置它，正文未述。归 PF-005 与 PF-015

### UL-tenant-sandbox · 租户级沙箱

- **宿主**：[租户](#ul-tenant--租户)
- **身份**：正文未述；一个租户可否有多个未明说
- **生灭**：首次需要 → 运行中 ⇄ 停机 / 换节点 → 在别处重新起来。数据迁移失败不算迁移完成，不以空数据冒充成功。终结正文未述
- **依据**：[PF-005 §5.2](../product/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 5）；[PF-005 §6.4](../product/PF-005-execution-environments-and-sandboxes/design.md#64-租户级沙箱共享的工作空间)（rev 5）

### UL-sandbox-data · 沙箱数据

- **宿主**：[租户](#ul-tenant--租户)（寿命上）；[租户级沙箱](#ul-tenant-sandbox--租户级沙箱)（归属上）
- **身份**：正文未述；是整体一份还是可细分寻址，未述
- **生灭**：随使用积累；沙箱本体停机或迁移期间必须仍可取回，之后接回；须可备份、可迁移。终结正文未述
- **依据**：[PF-005 §4 沙箱内的数据](../product/PF-005-execution-environments-and-sandboxes/design.md#沙箱内的数据)（rev 5）；[PF-005 §5.2](../product/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 5）

### UL-terminal-session · 终端会话

- **宿主**：[执行环境](#ul-execution-environment--执行环境)（环境销毁，里面的终端会话全没）
- **身份**：各自有标识，`create_session` 时返回；给一个不存在的标识必须明确失败
- **生灭**：`create_session` → 开着 → 关闭（agent `close_session`）· 随环境消失（agent 必须被告知）
- **依据**：[PF-007 §6.4](../product/PF-007-meta-capabilities/design.md#64-shell通向命令行)（rev 15）；[PF-007 flows §3.2](../product/PF-007-meta-capabilities/flows.md#32-终端会话可以有多个各自独立)（rev 15）

### UL-session-base · 会话据点

- **宿主**：正文未述——正文只给了一条消失路径「这一处的那份数据被清除」，没说身份里那个账号那一头没了它怎么办（账号本版无注销，那一问正文无从谈起）。**它不寄宿于任何进程**：「此刻有没有进程在服务它」与「它在不在」是两件事
- **身份**：**（哪一处 · 哪个[治理中心](#ul-governance-center--治理中心) · 哪个账号）**这一组合；「一处」是位置概念，**命令行交付形态把它落成一台机器**——换一台机器一定是另一处。标识形式正文未述。**有意不带**[登录状态](#ul-login-state--登录状态)（同账号登录两次看到同一批会话）与[租户](#ul-tenant--租户)（一个账号的多个租户身份共用这一份据点，租户隔离在它里面成立）
- **生灭**：这个账号**在这一处第一次登录到某个治理中心成功**那一刻产生 → 存在（装着这个账号在这一处开的全部[会话](#ul-session--会话)及其[日志](#ul-session-log--会话日志)、这些会话里等着人的[卡片](#ul-decision-card--决策卡片)、正在跑的[运行](#ul-run--运行)；**没人开着屏时照常运转**，机器关机才是停机）→ **这一处的那份数据被清除**时消失。**不随任何一次使用生灭**；成员资格无效期间里面那些会话不呈现，**也不删**
- **依据**：[PF-016 §4 会话据点](../product/PF-016-cli-tui-delivery-surface/design.md#会话据点)（rev 3）；[PF-016 §5.2](../product/PF-016-cli-tui-delivery-surface/design.md#52-一个账号在一处怎么被装起来)（rev 3）；[PF-016 §5.6](../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)（rev 3）；[PF-016 §6.10](../product/PF-016-cli-tui-delivery-surface/design.md#610-成员资格无效期间本机那些会话不呈现也不删)（rev 3）；[PF-016 §6.16](../product/PF-016-cli-tui-delivery-surface/design.md#616-没人开着屏这一处照常发生事)（rev 3）
- **并入**：「用户本机上那个后台进程」（交付面草案里的「本机节点」）——**PF-016 的答案是那个「本机上的东西」不是进程**：会话、日志、卡片与运行所在的**那一处**才是对象，它不随进程起落而生灭；靠什么让它在无人开屏时运转，归技术设计

### UL-governance-center · 治理中心

- **宿主**：—（独立于任何人的机器。会话据点的身份里带着它，那是**据点依赖它**，不是它寄宿于谁）
- **身份**：**一次部署就是一个**；**身份不是它的地址**——地址只是够到它的方式，可以变，同一个中心换了地址，账号与组织一条不变。[登录标识「部署内唯一」](../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)里的那个「部署」就是它——两个治理中心上的同名标识**是两个[账号](#ul-account--账号)**。**可比较的东西是[治理中心标识](../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)**：首次启动定下、不变、跟着数据走；两个地址后面读到同一个标识就是同一个中心（[PF-017 §6.12](../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)，rev 1）
- **生灭**：[运维者](../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)**第一次启动成功那一刻**产生（[治理中心标识](../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)在这一刻定下，里面零账号、零组织）→ **运行中 ⇄ 停着**（升级、换部署密钥、换机器换地址都在停着时做；同一份数据就是同一个中心）→ **本版没有销毁**；从零重立的是另一个中心，从备份恢复的仍是原来那个 **断电或操作系统崩溃把数据退回到首启之前不是一条转移**——那是历史回退，下次起来的是另一个中心（[PF-017 §6.12](../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)、[flows §三](../product/PF-017-governance-center-as-deployable-application/flows.md)，rev 2）
- **依据**：[PF-016 §4 治理中心](../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)（rev 3）；[PF-016 §5.1](../product/PF-016-cli-tui-delivery-surface/design.md#51-三处地方各自拥有什么)（rev 3）；[PF-016 §5.6](../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)（rev 3）；[PF-017 §5.2 中心的一生](../product/PF-017-governance-center-as-deployable-application/design.md#52-中心的一生)（rev 2）；[PF-017 §6.12](../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)（rev 2）；[PF-017 flows §三 状态流转](../product/PF-017-governance-center-as-deployable-application/flows.md#三状态流转)（rev 2）
- **并入**：「治理事实所在的那个中心」（交付面草案里的「中心治理节点」）——同一处：[账号](#ul-account--账号)、[组织](#ul-organization--组织)、[租户](#ul-tenant--租户)与成员资格、角色、[邀请](#ul-invitation--邀请)与[隶属请求](#ul-affiliation-request--隶属请求)，以及组织层与租户层的那些范围化对象都在它那里，**而它不知道任何会话**

## 执行与收场

### UL-tool-execution · 工具执行

- **宿主**：前台时是 [agent runtime](#ul-agent-runtime--agent-runtime)；转后台即换成[会话](#ul-session--会话)
- **身份**：正文未给标识；只要求记得下「哪一次运行、哪个 agent runtime 发起、属于哪个会话」
- **生灭**：发起 → 前台/后台 × 执行中/等待 → 完成 · 失败 · 被中断 · 等不到。前台到后台单向。停机后不重来，算失败；会话被归档时随之收场，不可逆
- **依据**：[PF-006 §4 Tool Execution](../product/PF-006-tools-and-skills/design.md#tool-execution)（rev 14）；[PF-006 §6.5](../product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)（rev 14）；[PF-006 §6.6](../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（rev 14）；[PF-012 §6.13](../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 7）
- **并入**：「工具执行运行时」「一次工具调用」——正文当同一物用

### UL-model-call · 一次模型调用

- **宿主**：[agent runtime](#ul-agent-runtime--agent-runtime)（永远；转不了后台）
- **身份**：正文未述；每次调用要留下「实际用了哪条档案」的留痕
- **生灭**：待发出 → 在途（可在本层换一家或退避）→ 说话中（首 token 到，不可逆）→ 完整一份。三个终态：完整一份 · 上交 · 被中断。停机恢复看首 token：之前可重发，之后一律不重发
- **依据**：[PF-013 flows §3.2](../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)（rev 4）；[PF-013 §5.2](../product/PF-013-model-profiles-and-invocation/design.md#52-这一层的四要素填-pf-011-那一格)（rev 4）；[PF-013 §5.13](../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（rev 4）
- **并入**：「模型请求运行时」「模型请求」「进行中的模型响应」——正文没给它们各自的身份，是这一个对象的运行时面
- **未裁**：不属于任何运行的那种模型调用（旁路提问）宿主是谁，正文未述。归 PF-012 与 PF-015

### UL-attachment · 附件

- **宿主**：产出它的那次[工具执行](#ul-tool-execution--工具执行)；实际存放在工具定义声明的那个存储里
- **身份**：靠地址——消息里告诉 agent 地址，由它自己去取；地址形态与唯一范围正文未述
- **生灭**：工具执行跑完时产出并存进存储；留存与清理正文未述
- **依据**：[PF-006 §4 工具的产出](../product/PF-006-tools-and-skills/design.md#工具的产出)（rev 14）；[PF-006 §6.4](../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)（rev 14）
- **未裁**：它存进的那个[存储](pending.md#存储)全系统没有定义；宿主因此也只是推断

### UL-offloaded-result · 被卸载的原始结果

- **宿主**：正文未述。它由一次[工具执行](#ul-tool-execution--工具执行)产出，却从来没进过[会话日志](#ul-session-log--会话日志)——日志里只有那条占位；它自己「存起来」在哪、寿命跟着谁，没有说
- **身份**：正文未述。只要求占位里写得出「有多大、怎么取全文」，agent 据此分页取回
- **生灭**：工具结果落成消息之前判定太大 → 原始结果存起来，消息里换成带摘要的占位；之后可被分页取回，取回是往后追加两条新消息，不把占位换回去。留多久、何时清理，正文未述
- **依据**：[PF-006 §4 卸载](../product/PF-006-tools-and-skills/design.md#卸载)（rev 14）；[PF-006 §6.10](../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 14）；[PF-012 §5.10](../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)（rev 7）
- **并入**：「原始结果」「全文」——正文当同一物用。「工具原件」只在 PF-015 出现一次，且「原件」在 PF-013 另有所指，词条已列为弃用
- **未裁**：保留多久没有答案——[PF-015 §9](../product/PF-015-session-lifecycle-and-ownership/design.md#九未决项) 列为未决；它存进的[存储](pending.md#存储)同样没有定义

## 交互与派发

### UL-dispatch-report · 派发报告

- **宿主**：它所属的那次派发
- **身份**：每次派发至多一份
- **生灭**：子干完时交出 → 派发者的等待结束，这次派发随之终结。此后留存多久正文未述
- **依据**：[PF-007 §6.8 报告与消息是两样东西](../product/PF-007-meta-capabilities/design.md#报告与消息是两样东西)（rev 15）；[PF-007 §6.8 报告终结的是这次派发，不是那个会话](../product/PF-007-meta-capabilities/design.md#报告终结的是这次派发不是那个会话)（rev 15）
- **未裁**：`handoff` 有没有报告，正文未述。归 PF-007

### UL-decision-card · 决策卡片

- **宿主**：[会话](#ul-session--会话)（归属）；被它阻塞的是一次[工具执行](#ul-tool-execution--工具执行)或一次[运行](#ul-run--运行)
- **身份**：正文未述；一张卡片只能被答一次，会话里与决策池里看到的是同一张
- **生灭**：工具执行进入等待态，或放行判断算出某个动作要人点头 → 等着（无超时出口）→ 被答复 · 被拒答 · 随运行被中断清掉 · 随会话被归档
- **依据**：[PF-008 §4 决策卡片](../product/PF-008-human-in-the-loop/design.md#决策卡片)（rev 4）；[PF-008 §5.3](../product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思)（rev 4）；[PF-008 §6.8](../product/PF-008-human-in-the-loop/design.md#68-两种来源的卡片同一个形状选项与记录不同)（rev 4）

### UL-session-authorization-context · 会话授权上下文

- **宿主**：[会话](#ul-session--会话)（与会话同寿，归档不丢，撤销归档后原样还在）
- **身份**：每个会话一份
- **生灭**：空 → 攒着几笔 → 里面有撤回；只追加，不回头改，不归零
- **依据**：[PF-007 §4 会话授权上下文](../product/PF-007-meta-capabilities/design.md#会话授权上下文)（rev 15）；[PF-007 flows §3.5](../product/PF-007-meta-capabilities/flows.md#35-会话授权上下文)（rev 15）；[PF-015 §5.7](../product/PF-015-session-lifecycle-and-ownership/design.md#57-三个作用域在同一份数据里)（rev 9）

### UL-authorization-expression · 授权表达

- **宿主**：[会话授权上下文](#ul-session-authorization-context--会话授权上下文)——作用域为「这一次」「本会话」的那些落在它里面；**作用域为「全局」的那一笔不落在这里**，它[落成租户层的权限设置值](../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)
- **身份**：正文未述；只要求**有先后**、**分得出是哪一笔**
- **生灭**：用户表达出来即追加一笔 → 此后不改、不删；**撤回是往后再追加一笔**，不是擦掉先前那笔
- **依据**：[PF-007 §4 一笔授权表达有三个维度](../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)（rev 15）；[PF-007 §5.6](../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)（rev 15）
- **并入**：「决策记录」——[产品负责人 2026-09-22 裁为一物两名](../ubiquitous_language/conflicts.md)，正文当同一物用

### UL-inbound-arrival · 入站到达

- **宿主**：[会话](#ul-session--会话)（恰好一个；没有「飘着的到达」）
- **身份**：受理的那一刻成为一条可以被指着说「就是它」的事实；去重时返回已受理的那一条。具体标识正文未述
- **生灭**：送到 → 资格与目标会话检查 → 去重 →「消息落盘之前」拓展点 → 受理并落盘，一步，不可逆 → 按去处三分：进队列 · 落到卡片上 · 就地生效
- **依据**：[PF-014 §4 入站到达](../product/PF-014-inbound-intake-and-queueing/design.md#入站到达)（rev 3）；[PF-014 §4 三个去处](../product/PF-014-inbound-intake-and-queueing/design.md#三个去处)（rev 3）；[PF-014 §6.1](../product/PF-014-inbound-intake-and-queueing/design.md#61-先落账再谈别的)（rev 3）
- **未裁**：它与[消息](#ul-message--消息)、[记录条目](#ul-record-entry--记录条目)是不是同一条日志记录的几种读法——「大多数入站到达会成为一条消息，但不是全部」，正文没有说透。归 PF-014 与 PF-009

## 记录与上下文

### UL-record-entry · 记录条目

- **宿主**：它声明的寿命宿主——首批取值是会话 · 运行 · 执行尝试 · agent runtime · 租户，默认会话，取值表未封板
- **身份**：正文未述；每条无条件携带寿命宿主、租户身份、出处、因果先后
- **生灭**：由一件发生的事产出（零条、一条或多条）→ 写下后不可变，要改靠追加 → 随寿命宿主一起消亡
- **依据**：[PF-000 §4 记录条目](../product/PF-000-occurrences-and-record-entries/design.md#记录条目)（rev 1）；[PF-000 §5.5](../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)（rev 1）；[PF-000 §6.2](../product/PF-000-occurrences-and-record-entries/design.md#62-k2依据的寿命不得短于要靠它重建的那个对象)（rev 1）

### UL-session-log · 会话日志

- **宿主**：[会话](#ul-session--会话)（归会话，不归运行）
- **身份**：一个会话一份
- **生灭**：随会话存在；只往后加，不回头改，不删；运行结束了它还在；归档、撤销归档、重新加载后一条不少
- **依据**：[PF-012 §4 会话日志](../product/PF-012-agent-loop-and-run/design.md#会话日志)（rev 7）；[PF-012 §5.2](../product/PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源)（rev 7）

### UL-message · 消息

- **宿主**：[会话日志](#ul-session-log--会话日志)
- **身份**：「一条消息有稳定的身份」，且不能从会变的文本或时间戳算出来；具体方式正文未述。类型是确定的，不靠解析内容
- **生灭**：流式到达期间只是「正在长的块」→ 长成一条完整消息落盘，或按「流断在半路」收场 → 落盘后不改不删；**消息之间没有取代**，状态类提醒也一律追加。它对模型可不可读，可被后来的压缩摘要点名而改变，但那是算出来的，消息本身一字不动
- **依据**：[PF-009 §4 消息](../product/PF-009-context-message-types/design.md#消息)（rev 4）；[PF-009 §4 半条消息不是消息](../product/PF-009-context-message-types/design.md#半条消息不是消息)（rev 4）；[PF-009 §5.4](../product/PF-009-context-message-types/design.md#54-提醒说的是现在什么样还是刚才发生了什么)（rev 4）；[PF-009 §5.6](../product/PF-009-context-message-types/design.md#56-流断在半路)（rev 4）；[PF-009 §6.4](../product/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加)（rev 4）
- **并入**：「排队的消息」——待处理与已消费是从日志派生的读法，不另存

### UL-content-block · 内容块

- **宿主**：[消息](#ul-message--消息)
- **身份**：正文未述；但压缩摘要的点名名单以块为单位，即块在消息内可被单独指到
- **生灭**：开一个块（说明这块怎么填：追加片段 / 整体替换）→ 往里填 → 封口交出完整一块 → 落盘后块与它的两个标注都不再变；之后可被点名而不再对模型可读，那是算出来的，不回写
- **依据**：[PF-009 §4 消息的内容是一串块](../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)（rev 4）；[PF-009 §4 每个块带两个标注](../product/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗)（rev 4）；[PF-009 §5.5](../product/PF-009-context-message-types/design.md#填有两种模式开块的时候说明是哪一种)（rev 4）

### UL-todo-item · 待办条目

- **宿主**：[会话](#ul-session--会话)——它活在一次会话里，不跨会话继承
- **身份**：正文只要求「每条待办有自己的身份」，在一次会话内分得出这一条与那一条，否则去掉与标成做完都指不准；靠什么标识，正文未述
- **生灭**：加一条 → 未完成 → 标成做完（做完了还留着）；或被去掉（不做了才去掉）。两者必须分得出。加一条不会让系统去做它。会话被归档时它怎么办，正文未述
- **依据**：[PF-007 §6.9](../product/PF-007-meta-capabilities/design.md#69-todoitems通向自己手上的待办)（rev 15）；[PF-015 §5.6](../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 9）
