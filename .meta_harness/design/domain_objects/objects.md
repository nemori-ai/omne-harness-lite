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
- **依据**：[PF-001 §4 账号](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#账号)（rev 26）；[PF-001 §4 未激活的账号记录不会永久占着那个名字](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)（rev 26）；[PF-001 flows §3.1](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)（rev 26）

### UL-login-state · 登录状态

- **宿主**：[账号](#ul-account--账号)——它是以这个账号的身份通过鉴权的一次登录。账号本版无注销，「账号没了它怎么办」正文无从谈起
- **身份**：正文未述靠什么标识；只写明彼此分得出——重新登录是新的一个，多处登录各是一个，退出只失效被退出的那一个。**属于签发它的那个[治理中心](#ul-governance-center--治理中心)**，那是它身份的一部分（[PF-016 §4 治理中心](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#治理中心)，rev 13）。**同账号的有效登录状态能被逐个列出（每一个带签发时间）并逐个指定撤销**，可分辨到这个程度
- **生灭**：（无）→ 有效（登录；前置：账号已激活、凭据正确）→ 已失效（退出、被撤销、达到最长或空闲时限，或本账号主动更换凭据成功；不可逆，重启不重算期限，恢复不能使其重新可用）。独立撤销动作仍逐个
- **依据**：[PF-001 §4 登录状态](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)（rev 26）；[PF-001 flows §3.2](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态)（rev 26）；[PF-001 flows §1.2](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#12-登录)（rev 26）

### UL-organization · 组织

- **宿主**：—
- **身份**：正文未述
- **生灭**：由已激活账号创建，创建者同时成为超管、其租户同时产生，一次提交，不存在无管理员的中间态 → 存续；**团队组织本版无终结路径**（不要求解散）；**个人组织唯一的消失路径是随未激活[账号](#ul-account--账号)到期清除**——它在注册第 2 步随账号记录一并建起，账号记录到期被清时随之消失
- **依据**：[PF-001 §4 组织](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#组织)（rev 26）；[PF-001 §4 个人组织](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)（rev 26）；[PF-001 §4 未激活的账号记录不会永久占着那个名字](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)（rev 26）；[PF-001 flows §1.4](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#14-创建组织)（rev 26）

### UL-invitation · 邀请

- **宿主**：[组织](#ul-organization--组织)——**发出它的那个组织**：它不存在了，这份邀请随即自动过期。它指向一个账号，但那个账号在接受之前对它没有任何持有；个人组织发不出邀请
- **身份**：正文未述
- **生灭**：发出，**带一个到期时刻** → 被接受（成员关系建立，[租户](#ul-tenant--租户)随之产生）；接受之前可以被撤回，也会过期——邀请这一类有默认时长、发出时发起者可指定这一份的，发出它的组织不存在了则自动过期（**这一分支本版无触发源**：[没有任何邀请指向个人组织——个人组织发不出邀请，而团队组织无终结路径](#ul-organization--组织)）；撤回、过期或接收账号拒绝都不产生成员关系；若再合作须另发一份
- **依据**：[PF-001 flows §1.5](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#15-邀请与加入)（rev 26）；[PF-001 flows §2](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)（rev 26）；[PF-001 §4 两种邀约都会过期](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)（rev 26）

- **本轮依据复核**：[PF-001 接收方拒绝](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#接收方可以明确拒绝待处理邀约)（rev 26）增加终结分支；宿主、身份与接受结果不变，不新增对象。

### UL-affiliation-request · 隶属请求

- **宿主**：正文未述。由一个[组织](#ul-organization--组织)的超级管理员发出、指向另一个组织；个人组织不参与隶属关系，既发不出也收不到
- **身份**：正文未述
- **生灭**：发起，**带一个到期时刻** → 被接受（下级组织的「上级组织」属性有了值，**不产生租户**）；接受之前可以被撤回，也会过期——隶属请求这一类有默认时长、发出时发起者可指定这一份的，它指向的组织不存在了则自动过期（**这一分支本版无触发源**：[没有任何隶属请求指向个人组织——个人组织不参与隶属关系，而团队组织无终结路径](#ul-organization--组织)）；撤回、过期或接收组织超管拒绝都不建立隶属；若再合作须另发一份
- **依据**：[PF-001 §4 隶属关系怎么建立与解除](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#隶属关系怎么建立与解除)（rev 26）；[PF-001 §4 两种邀约都会过期](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)（rev 26）；[PF-001 flows §1.7](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#17-建立与解除组织隶属)（rev 26）；[PF-001 flows §2](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)（rev 26）
- **未裁**：**宿主是发起方组织还是接收方组织**。两端都是组织，而正文只写了「它**指向的**那个组织不存在了则自动过期」——发起方组织没了它怎么样，正文没说。归 PF-001 的 owner，[已记入该 topic 的「已知的来源问题」](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md)

- **本轮依据复核**：[PF-001 接收方拒绝](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#接收方可以明确拒绝待处理邀约)（rev 26）增加终结分支；宿主、身份与接受结果不变，不新增对象。

### UL-tenant · 租户

- **宿主**：—（身份由[组织](#ul-organization--组织)与[账号](#ul-account--账号)共同确定）
- **身份**：（组织, 账号）二元组；不含角色。同一账号在两个组织里是两个租户
- **生灭**：账号加入组织即产生（注册时随个人组织产生第一个；创建组织时创建者的随之产生；接受邀请时产生）→ 加入到退出之间有效，角色可调 → 解除后不再有效，其租户级私有部分不可达但不销毁，历史记录照旧引用它 → 再次被邀请加入同一组织即重新有效，**回来的是同一个租户**，私有部分原样可用。身份由（组织, 账号）确定，不因断续而变；**已激活账号的租户本版无销毁路径**；**从未激活的账号到期清除时，随账号一起产生的第一个租户随之消失**
- **依据**：[PF-001 §4 租户](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#租户)（rev 26）；[PF-001 §4 退出之后再加入，回来的是同一个租户](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#退出之后再加入回来的是同一个租户)（rev 26）；[PF-001 §4 未激活的账号记录不会永久占着那个名字](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)（rev 26）；[PF-001 flows §3.3](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)（rev 26）
- **并入**：「成员关系」——design 只定义租户，flows 却把「无 → 成员 → 无」的状态机挂在成员关系名下；二者同一身份，成员关系是租户「此刻有没有效」那一面。**分界：身份是值，有效性是记录**——(组织, 账号) 这一组合不生不灭、被显式携带；「此刻有没有效」才有状态、有写路径、有并发约束。**这不改变它是一个对象**，只是提醒不要把整体当成有状态的东西

### UL-tenant-workspace-relation · 租户—工作区关系

- **宿主**：关联一个租户与一个工作区；独立宿主及租户端终止时的处理正文未述；中心托管工作区确认销毁后删除其全部租户关系，地址不可达不自动表示关系失效
- **身份**：记录某租户对某工作区的当前关系；仅 Omne Host 托管工作区具有治理所有者关系，登记外部仓库的所有接入租户（包括首次登记者）均为参与者；精确标识与唯一性约束正文未述
- **生灭**：正文列明创建、邀请、导入或公开资源登记等来源，关系存在时可为有效、暂停等状态；解除关系即删除条目。在未重新显式登记前，该租户的会话使用原本地目录时按普通目录处理，目录中的工作区来源不参与装配，不连带删除其他租户关系。参与者可退出自身关系；登记外部仓库的首次参与者不取得移除他人、授予工作区超管或销毁外部资源的特权。仅对 Omne Host 托管工作区：确认销毁后删除全部关联租户关系；工作区超管可退出自身参与关系，创建者或工作区超管可移除参与租户；创建者可撤回超管权限但保留参与关系，工作区超管不可转授；工作区存在时唯一治理所有者关系不可单独删除，本版不提供所有权移交。公开地址被发现不自动建立关系；关系有效也不代替组织参与限制。组织限制启用时外部仓库不作为受限租户的工作区附着或装配来源，但不因此删除既有关系、全局工作区身份或本地实例，也不热重判正在运行的会话；普通目录及底层资源访问仍沿原权限
- **依据**：[PF-020 租户—工作区关系](../product.0.0.1.legacy/PF-020-workspace/design.md#租户工作区关系)（rev 22）；[PF-020 治理关系解除与中心销毁](../product.0.0.1.legacy/PF-020-workspace/design.md#治理关系解除与中心销毁)（rev 22）；[PF-020 组织对参与范围的限制](../product.0.0.1.legacy/PF-020-workspace/design.md#组织对参与范围的限制)（rev 22）

## 作用域与求值

### UL-workspace · 工作区

- **宿主**：寿命宿主正文未述。Omne Host 托管工作区的治理所有者为一个[租户](#ul-tenant--租户)，登记外部仓库的工作区则无 Omne 治理所有者、各接入租户均为参与者；治理归属及参与关系不据此成为寿命宿主
- **身份**：工作区自身的持久逻辑身份；具体格式和命名尚未由正文确定。工作区地址不是身份，工作区实例是它在部署节点上的装载对象
- **生灭**：跨会话和实例持续存在；Omne Host 托管工作区仅可由创建者或其明确授予工作区超管权限的租户销毁；确认销毁后全部租户关系删除，本地实例内容保留。登记外部仓库的首次参与者不取得销毁外部资源的特权，外部工作区的终结规则正文未述。一次实例卸载或地址不可达不等于工作区消失；组织限制启用时，受限租户装配不认定外部仓库为工作区、不加载其来源，但不因此销毁全局工作区身份、租户关系或本地实例，不热重判正在运行的会话，普通目录访问仍沿原权限
- **依据**：[PF-020 工作区](../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）；[PF-020 工作区实例](../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）；[PF-020 工作区地址](../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）；[PF-002 工作区资产层](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#工作区)（rev 32）

### UL-workspace-instance · 工作区实例

- **宿主**：部署节点上的一次工作区装载，可接入用户已有的本地目录；它代表一个工作区，但不拥有工作区
- **身份**：与工作区和部署节点关联的具体实例，不固定绑定一个租户，可被多个租户的会话共用；关系与治理条件按各会话装配时的租户身份求值。精确身份形式正文未述
- **生灭**：装载/物化后可供会话与 agent 使用，也可由用户显式选择已有目录首次登记并附着而接入；可先于会话独立存在；也可指定本地路径先装载再创建会话。会话结束不自动卸载实例，卸载不删除逻辑工作区。不用时不再附着即可；中心销毁不连带清理本地实例，不要求治理中心另设本地清理流程。精确状态规则正文未述。实例目录下承载 `.omne` 与实例本地 `.omne.local`，共用实例不保证该物理目录跨租户私有。Git worktree 创建不自动建立实例关联，显式作为工作区使用时再关联；同一会话可以组织多个 worktree 供 subagent 并行
- **依据**：[PF-020 工作区实例](../product.0.0.1.legacy/PF-020-workspace/design.md)（rev 22）

### UL-runtime-context-registration · 运行时 context 注册

- **宿主**：它所属的作用域；本版的作用域持有者是[会话](#ul-session--会话)，作用域结束它随之结束
- **身份**：作用域加块键
- **生灭**：作用域创建时持有者固定必需项 → 可选项可增删，必需项不可移除 → 随作用域结束；移除一项只停止该作用域后续使用，不删共享来源
- **依据**：[运行感知与一次模型请求 §2.4](../product/runtime-context/design.md#24-注册读取资格与绑定读者) · [§2](../product/runtime-context/design.md#2-来源会话选择和历史分别生效)（rev 4）
- **并入**：封存 PF-015 §6.18 的「注册声明」——同一身份、同一生灭，当时按属性登记，现按对象立条

### UL-context-block · runtime context 块

- **宿主**：[运行时 context 注册](#ul-runtime-context-registration--运行时-context-注册)——注册移除或作用域结束，它就退出
- **身份**：作用域引用加块键
- **生灭**：随注册进入作用域 → 值就地更新（供给块由生产者发布，状态块由步提交）→ 随注册移除或作用域结束退出；能否恢复按块声明的恢复方式
- **依据**：[运行感知与一次模型请求 §2.1](../product/runtime-context/design.md#21-两类块供给块与状态块)（rev 4）

### UL-context-block-descriptor · 块声明

- **宿主**：发布它的包，即值的语义拥有者；不随作用域
- **身份**：块键，全系统唯一
- **生灭**：随包发布存在；不在运行期创建或销毁，无删除
- **依据**：[运行感知与一次模型请求 §2.2](../product/runtime-context/design.md#22-块声明归语义拥有者)（rev 4）

### UL-producer-handle · 生产者句柄

- **宿主**：登记供给的那个生产者所在的插件；插件卸载它随之撤销
- **身份**：代际，登记时取得
- **生灭**：生产者登记 → 发布新值、使当前值失效 → 撤销或插件卸载；旧代际晚到的发布不被采用
- **依据**：[运行感知与一次模型请求 §2.2](../product/runtime-context/design.md#22-块声明归语义拥有者)（rev 4）

### UL-bound-reader · 绑定读者

- **宿主**：建立它的那份读取资格；资格撤销或失效它就结束
- **身份**：一次绑定；正文未述标识形式
- **生灭**：按资格建立 → 读取、取快照、按游标取变化 → 资格撤销或失效结束；游标在授权范围变化、生产者换代、进程重建后失效
- **依据**：[运行感知与一次模型请求 §2.4](../product/runtime-context/design.md#24-注册读取资格与绑定读者)（rev 4）

### UL-step-commit · 步提交

- **宿主**：它所属的作用域
- **身份**：作用域加步引用
- **生灭**：步边界由持有者合并该步全部上下文更新产生 → 写成作用域事实 → 无删除
- **依据**：[运行感知与一次模型请求 §2.5](../product/runtime-context/design.md#25-状态块的更新与步提交)（rev 4）

## 能力与构成

### UL-asset · 资产

- **宿主**：—
- **身份**：两级——上层是[能力标识，即「类别 ＋ name」](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)，求值的产出是「每个能力标识一个生效资产」；下层是具体资产，同一标识下可并存 official、组织自定义、租户自定义、复制进来的多份。具体资产自身靠什么标识，正文未述
- **生灭**：创作出草稿 → 修订 → 发布（该版本自此不可变）→ 再改成新版本；从租户范围提升到组织范围不可逆，**只换所有者、不动任何一份持有**；删除被分享出去的须先告知受影响方，不默认级联。删除之后如何，正文未述
- **依据**：[PF-002 §4 八类资产](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#八类资产)（rev 32）；[PF-002 §4 身份是「类别 ＋ name」](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)（rev 32）；[PF-001 §4 资产的种类](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 26）；[PF-001 §6.7](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)（rev 26）；[PF-002 flows §3.3](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)（rev 32）

### UL-asset-version · 资产版本

- **宿主**：[资产](#ul-asset--资产)——每一份资产有自己独立的一条版本线
- **身份**：所属的那份资产 ＋ 它在那条版本线上的序号。版本线从 v1 起各数各的：复制过去的资产落在目标侧自己的线上，源侧的 v7 在那边可能是 v2
- **生灭**：草稿（反复修订，还不是版本）→ 发布 → 已发布，自此不可变；再改只能在它之上发新版本。复制与分享只认已发布的。版本有没有终结，正文未述
- **依据**：[PF-002 flows §3.3](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)（rev 32）；[PF-003 §6.4](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)（rev 6）

### UL-model-profile · 模型档案

- **宿主**：—。建在出厂默认、组织或租户自己那一层；它不是资产，「用哪个模型」那项设置记的是路由名，同名的几条在范围链上按层取最具体一格的那一条（租户 > 组织 > 官方）
- **身份**：**（所在范围, 路由名）**——同一个范围里一个路由名只对应一条（在册的、已撤回的都算），不同范围里可以各有一条同名的；路由名一旦定下不可改，改了就是另一条档案
- **生灭**：建档（建档者持有该范围的配置资格，且这个范围里还没有同路由名的）→ 在册 ⇄ 已撤回（**没有终态**：撤回不删行，那一行永远保留；恢复在册的还是原来那一条，谁撤得了谁恢复得了）。在册期间自建档案可以修订，**路由名与来源除外**——换路由名就是另建一条、撤回旧的。「这个范围不再允许它」不是它的状态转移，是作用域求值的结果变了
- **依据**：[PF-013 §4 模型档案](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#模型档案)（rev 17）；[PF-013 §4 档案的身份](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（rev 17）；[PF-013 flows §3.1](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（rev 17）；[PF-013 flows §四](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)（rev 17）；[PF-013 §6.4](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)（rev 17）

### UL-meta-capability · meta 能力

- **宿主**：正文未述。已采用并提供的元入口在 Agent 装配后各占一个常驻槽位
- **身份**：按入口名称，由产品定义及采用范围确定；装配方不能增删必需绑定，候选和占位不计作已提供入口
- **生灭**：装配 → 在位，没有别的状态；不可禁用、不可替换、不可移除。门自身无状态，「门后的东西有状态」
- **依据**：[元能力：meta](../product/meta-capabilities/design.md#使用者与范围)（rev 4）；[元能力：产品规则](../product/meta-capabilities/design.md#必需入口常驻与命令可用性)（rev 4）
- **未裁**：它与工具及资产的精确关系尚未裁定；采用多命令形态不自动决定其对象或资产身份。归元能力与工具产品拥有者

## 流转与授权

### UL-copy-notice · 复制通知

- **宿主**：正文未述。由源组织的超级管理员发起、指向目标组织；它指向的那份资产不存在了它随即过期，但正文没说它的寿命跟着哪一头的组织走
- **身份**：正文未述；只写明逐份可辨——接收方看得见每一份，确认的是那一份，重新发起产生的是新的一份
- **生灭**：（无）→ 发起（带一个到期时刻：发起时指定的，或这一类的默认值）→ 待确认 → 已确认（目标组织那一层新增或更新一份资产）· 结束（发起方撤回 / 到期 / 它指向的那份资产不存在了；三者收场相同，什么都没建立，不可再确认）。本人型复制不产生它
- **依据**：[PF-003 flows §3.4](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)（rev 6）；[PF-003 §6.14](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)（rev 6）；[PF-003 §4 资产复制](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#资产复制)（rev 6）
- **并入**：「待确认的复制通知」——正文这么写时指的是它在「待确认」态的那一份，同一物

### UL-sharing-invitation · 分享邀请

- **宿主**：正文未述。由分享方发起、指向接收方（一个组织，或一个租户）；它指向的那份资产不存在了它随即过期
- **身份**：正文未述；只写明逐份可辨——接收方看得见每一份，确认的是那一份，重新发起产生的是新的一份
- **生灭**：（无）→ 发起（带一个到期时刻）→ 待确认 → 已确认（使用权建立，[分享关系](#ul-sharing-relationship--分享关系)进入分享中）· 结束（分享方撤回 / 到期 / 它指向的那份资产不存在了；三者收场相同，不曾建立过任何使用权）。本人型分享不产生它
- **依据**：[PF-003 flows §3.4](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)（rev 6）；[PF-003 §6.14](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)（rev 6）；[PF-003 §4 分享](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#分享)（rev 6）
- **并入**：「待确认的分享邀请」「组织内分享的邀请」——正文当同一物用
- **未裁**：它的「待确认」与[分享关系](#ul-sharing-relationship--分享关系)的「待确认」是同一段时间的两个视角（flows §3.4 与 §3.2 各画了一份状态机）；这一段是一份记录还是两份，正文未述。归系统架构设计

### UL-sharing-relationship · 分享关系

- **宿主**：正文未述。它建立在某层关系上——两个组织的隶属关系，或任一方作为租户的成员关系——那层关系断了它就结束，但正文没说它寄宿于分享方还是接收方
- **身份**：正文未述；只写明「再分享一次是新的一段」，即同一对当事人、同一份资产可以先后有两段，彼此分得开
- **生灭**：（未分享）→ 待确认（本人型没有这一段，发起即进入分享中）→ 分享中（分享方发新版本，被分享方自动跟随；没有暂停、不过期）→ 结束（分享方撤销 / 被分享方移除 / 两个组织的隶属关系解除 / 任一方是租户时它的成员关系解除；待确认那一段另有撤回、到期、资产不存在三个出口）。**结束是终点，不复活**——关系断了又接上不回来，再分享是新的一段
- **依据**：[PF-003 flows §3.2](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/flows.md#32-一段分享关系)（rev 6）；[PF-003 §6.12](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)（rev 6）；[PF-003 §6.10](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)（rev 6）
- **并入**：「一段分享关系」——正文这么写时指的就是它的一个实例

## agent 运行回路

### UL-session · 会话

- **宿主**：—（归属于[租户](#ul-tenant--租户)：**创建那一刻捕获并持有的那个租户身份**，此后不随这个账号切换而变）
- **身份**：会话的身份标识。**agent 的身份标识恒等于它**，换 agent runtime 也不变，agent 之间互相寻址靠它。所选 AgentDefinition 身份固定、同身份内容按运行装配边界热重载；会话设置、context 注册与已知能力记录为其属性；能力身份合法纳入后保留，当前数据、实现与可用性分别求值，不新增独立对象
- **生灭**：创建/初始化 → 运行/活跃 ⇄ 休眠（往返无上限）→ 归档（租户手动，或按出厂时限自动）→ 撤销归档回休眠。**无删除、无过期、无回收**；「运行/活跃」只看日志上最新那次运行完结没有
- **依据**：[PF-015 §4 会话的生命周期](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话的生命周期)（rev 21）；[PF-015 §5.1](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#51-四个状态怎么走)（rev 21）；[PF-015 §6.1](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#61-会话不会消失)（rev 21）；[PF-015 §6.12](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)（rev 21）；[PF-015 §6.16–6.19](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#616-会话组成与创建输入)（rev 21）
- **补充依据**：[PF-015 §6.22](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#622-会话作用域的输入与供给)（rev 21）
- **并入**：「会话内的那个 agent」——身份恒等、一对一，没有独立于会话的身份机制，是会话的一个面

### UL-run · 运行

- **宿主**：[会话](#ul-session--会话)（附着在恰好一个会话上）
- **身份**：有身份，且「身份在数据里，不在进程里」；铸新身份是「新一次运行」的专属权利。标识形式正文未述。开始条目可带一个「延续自哪次运行」的链接
- **生灭**：有仍具待处理资格的未承接输入、且没有未终结的运行，并满足当前准入与适用的登录确认 → 落一条开始条目（写明承接了哪些）→ 在跑 ⇄ 停着等（模型调用在途 / 卡片未答完 / 动作结果没齐；此时可以一副协程都没有）→ 落终态：完成 · 失败 · 被取消。终态是吸收态；会话未归档时，之后回来的有效待处理输入在满足新 Run 当前准入与登录确认后可开下一次运行，归档期间迟到事实仅留痕不入队；不存在「先排着」。**系统为已发生的中断追补的提醒本身不取得待处理资格，不开新运行**。终结之后不再为它发起新动作，**尝试被取代或运行终结前已发起的那些，响应体与账迟到了照样落、归这个运行、标明迟到**。同一会话任一时刻至多一个未终结的运行
- **依据**：[PF-012 §4 Run](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#run)（rev 25）；[PF-012 §4 边界](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#边界什么让它开始什么让它结束)（rev 25）；[PF-012 §4 Run 是三样东西的归属单位](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)（rev 25）；[PF-012 §5.13](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#513-run-拥有什么归属的判据)（rev 25）；[PF-012 §5.1](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#51-run-与-agent-loop-是一体两面)（rev 25）；[PF-012 §6.17 I-11](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（rev 25）

### UL-agent-runtime · agent runtime

- **宿主**：会话路径中是[会话](#ul-session--会话)；独立调用（不创建会话）时，产品正文未述，已接受的 Agent 对象模型写装配者创建它，宿主发布并撤登记，见补充依据。所推进的是 [Agent 执行](#ul-agent-execution--agent-执行)，会话路径中该执行对应 Run 的一段推进；Model／Tool runtime 不寄宿于它
- **身份**：正文未述它自己的标识方式；它与[执行尝试](../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)不一一对应——执行尝试是会话一侧拥有的视图，(哪次运行, 第几次) 从日志里那条尝试开始记录派生，不另立对象，Agent 一侧不要求它
- **生灭**：照一份装配清单起 → 反复求值、在 await 点挂起与恢复 → 一次 Agent 执行结束后回到空闲并保持登记，可承接下一次 Agent 执行，执行之间不沿用主体、授权、取消状态、输入队列与结果游标 → 灭（系统崩了 / 停住等时被回收 / 自身捕获组成变了交接后照新清单另起）。停止分两级：优雅取消、强制停止；仅结束实例不终结 Run，业务取消时由会话侧确保运行终结；持有句柄随实例释放，不结束所引用执行；显式 reload 可在同一 Run 安全交接并开启新尝试；独立 Model／Tool runtime 不随其退役终止
- **依据**：[产品页 使用场景](../product/agent-progression/design.md#使用场景)（rev 2）；[PF-012 §4 agent runtime](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#agent-runtime)（rev 25）；[PF-012 §6.13](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 25）；[PF-012 §6.14](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#614-停止有两级)（rev 25）；[PF-012 装配与交接](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#618-agent-runtime-的装配与重装配交接)（rev 25）
- **补充依据**：已接受的 Agent 契约的[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)（AgentRuntime 的身份、构造、状态与销毁，[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)）
- **未裁**：空闲复用的依据是词条现行词义与已接受系统页 Agent runtime，产品页没有写这一点

### UL-agent-execution · Agent 执行

- **宿主**：—（换执行挂接或换 agent runtime 接续仍是同一次，不随 [agent runtime](#ul-agent-runtime--agent-runtime) 或执行挂接的更替而没；会话路径中它与运行的对应由外部协调者维护，Agent 一侧不要求）
- **身份**：正文未述标识方式；只要求换执行挂接或换 agent runtime 接续的是原执行，并能与新开的一次区分——每个新的 Agent 逻辑执行经过一次执行开始之后位置，接续原执行不再经过
- **生灭**：新开一次逻辑执行 → 推进，可换执行挂接、换实例而仍是同一次 → Agent 在必要检查成立后结束自己的执行。终态取值与标识的具体写法正文未述
- **依据**：[产品页 使用场景](../product/agent-progression/design.md#使用场景)；[扩展检查与权限](../product/agent-progression/design.md#扩展检查与权限)；[人的决定与等待](../product/agent-progression/design.md#人的决定与等待)；[J-AG05](../product/agent-progression/design.md#j-ag05-完成工作或停止指定目标)（rev 2）
- **补充依据**：已接受的 Agent 契约的[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)给出标识（调用方在受理前分配）与状态（reconciling、advancing、waiting、settling、suspended、ended，ended 不复活），[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)
- **未裁**：会话路径中与运行、执行尝试的对应不归 Agent，由外部协调者的设计维护

### UL-execution-attachment · 执行挂接

- **宿主**：[Agent 执行](#ul-agent-execution--agent-执行)——挂接是为某一次执行取得的承接。产品正文未述挂接的寿命，已接受的 Agent 对象模型称终止后的围栏记录保留到所属执行的保留期结束，见补充依据
- **身份**：产品正文未述标识方式；只要求换执行挂接接续的是原执行，而不是新开一次。标识、围栏代次与授予方式见补充依据
- **生灭**：产品正文只写重挂接与实例换代时，为同一次执行换一次新的执行挂接，不再经过执行开始之后位置；挂接自身的状态产品正文未述。已接受的 Agent 对象模型给出有效、被取代、已脱离三种状态，见补充依据
- **依据**：[产品页 扩展检查与权限](../product/agent-progression/design.md#扩展检查与权限)（rev 2）；[产品页 使用场景](../product/agent-progression/design.md#使用场景)（rev 2）；[J-AG06](../product/agent-progression/design.md#j-ag06)（rev 2）
- **补充依据**：已接受的 Agent 契约的[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)与[恢复与接管](../../../packages/agent/agent-contract/SPEC.md#恢复与接管)，[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)；形态判为对象的理由见 [C-59](../ubiquitous_language/conflicts.md#c-59执行挂接的形态)

### UL-agent-registration · Agent 登记

- **宿主**：产品正文未述它的寿命跟着谁。已接受的 Agent 对象模型称撤除之后仍保留身份记录，使同一次撤除可认回，见补充依据
- **身份**：产品正文未述。已接受的 Agent 对象模型给登记自己的身份，实例重新发布时产生后继登记取代旧登记，见补充依据
- **生灭**：产品正文未述。已接受的 Agent 对象模型给出已发布、撤除中、已撤除三种状态，见补充依据
- **依据**：[产品页 使用场景](../product/agent-progression/design.md#使用场景)（rev 2）；[J-AG06](../product/agent-progression/design.md#j-ag06)（rev 2）
- **补充依据**：已接受系统页 [Agent runtime 实例、执行与执行挂接](../../../docs/architecture/runtime/agent-runtime.md#实例执行与执行挂接)（保持空闲和注册）；已接受的 Agent 契约的[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)与 [SPEC 创建、登记与复用](../../../packages/agent/agent-contract/SPEC.md#创建登记与复用)，[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)
- **未裁**：出处缺口：依据所列两节只写推进实例的更换和用户不需要按实例的生灭重建协作，都没有写登记。“agent runtime 保持登记”来自已接受系统页与用户决定，产品正文没有原文。由产品负责人在 Agent 产品页写出登记，或裁定登记不是产品概念。登记的身份、状态与保留，产品正文与已接受系统页都未定义，由已接受的 Agent 对象模型给出

### UL-assembly-manifest · 装配清单

- **宿主**：—（为恰好一个[会话](#ul-session--会话)求值）
- **身份**：正文未述标识方式；定位属性是「为哪个会话求的」与「依据的定义版本」，装配时确定、此后不变。同一会话先后可有多份
- **生灭**：（没有）→ 求值中 → 有效（可复用；增量装载时追加一条，仍有效）→ 失效，下次需要时重新求值出新的一份。缺必需的东西则明确失败，不产生半份。只可追加、不可改写 同一 Run 可经显式 reload 安全交接先后采用不同清单；旧清单不改写。
- **依据**：[PF-004 §4 装配清单](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#装配清单)（rev 20）；[PF-004 §6.7](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#67-装配清单的生与失效)（rev 20）；[PF-004 flows §3.1](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/flows.md#31-一份装配清单)（rev 20）；[PF-004 装配与交接](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#610-重装配触发与生效矩阵)（rev 20）

## 落地与隔离

### UL-execution-environment · 执行环境

- **宿主**：—
- **身份**：正文未述；每个具体的执行环境要声明自己提供哪几种设施
- **生灭**：总体正文未述，按各种分别规定。「执行环境永远存在」说的是**每次执行都算得出一个落点或明确被拒**，不是某个实例永生
- **依据**：[PF-005 §4 执行环境](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#执行环境)（rev 9）；[PF-005 §5.1](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 9）；[PF-005 §6.1](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 9）；[PF-004 §4 执行环境](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#执行环境)（rev 20）

### UL-sandbox-implementation · 沙箱实现

- **宿主**：正文未述——正文只说它是**装配时可选装配**的，没说装配之后它的寿命跟着谁
- **身份**：正文未述；只要求它**自报提供哪几种设施、可绑定哪几个层级**，运行时据此匹配
- **生灭**：装配时装进来（可选，可以一个都不装）→ 在场，按声明被匹配到就起出一个沙箱。撤下与替换正文未述
- **依据**：[PF-005 §4 沙箱实现](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#沙箱实现)（rev 9）；[PF-005 §6.1](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 9）

### UL-stateless-sandbox · 无状态沙箱

- **宿主**：一次[工具执行](#ul-tool-execution--工具执行)
- **身份**：正文未述
- **生灭**：一次调用开始 → 存在 → 调用结束即无；没有闲置态，没有回收问题
- **依据**：[PF-005 §5.1](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 9）；[PF-005 flows §3.1](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/flows.md#31-无状态沙箱)（rev 9）

### UL-session-sandbox · 会话级沙箱

- **宿主**：[会话](#ul-session--会话)
- **身份**：正文未述；同一会话先后、同时都可有多个，同时并存的理由是设施不同
- **生灭**：会话首次需要时创建、开始计时 → 存在 → 到最大连续存活时间直接销毁，数据不留存；仍有动作在跑则按退役方式收口 → 下次要用重建一个空的、重新计时，并以一条提醒告知 agent
- **依据**：[PF-005 §6.3](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 9）；[PF-005 flows §3.2](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/flows.md#32-会话级沙箱)（rev 9）
- **未裁**：会话归档时连不连带处置它，正文未述。归 PF-005 与 PF-015

### UL-tenant-sandbox · 租户级沙箱

- **宿主**：[租户](#ul-tenant--租户)
- **身份**：正文未述；一个租户可否有多个未明说
- **生灭**：首次需要 → 运行中 ⇄ 停机 / 换节点 → 在别处重新起来。数据迁移失败不算迁移完成，不以空数据冒充成功。终结正文未述
- **依据**：[PF-005 §5.2](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 9）；[PF-005 §6.4](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#64-租户级沙箱共享的工作空间)（rev 9）

### UL-sandbox-data · 沙箱数据

- **宿主**：[租户](#ul-tenant--租户)（寿命上）；[租户级沙箱](#ul-tenant-sandbox--租户级沙箱)（归属上）
- **身份**：正文未述；是整体一份还是可细分寻址，未述
- **生灭**：随使用积累；沙箱本体停机或迁移期间必须仍可取回，之后接回；须可备份、可迁移。终结正文未述
- **依据**：[PF-005 §4 沙箱内的数据](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#沙箱内的数据)（rev 9）；[PF-005 §5.2](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 9）

### UL-terminal-session · 终端会话

- **宿主**：[执行环境](#ul-execution-environment--执行环境)（环境销毁，里面的终端会话全没）
- **身份**：可以同时存在多个，各有身份；标识何时给出正文未述；指定已关闭或不存在的终端会话必须明确失败
- **生灭**：`create_session` → 开着 → 关闭（agent `close_session`）· 随环境消失（agent 必须被告知）
- **依据**：[元能力：Shell 终端会话](../product/meta-capabilities/design.md#meta-shell)（rev 4）

### UL-facility-descriptor · 设施声明

- **宿主**：发布它的那种设施的拥有者；登记到撤除
- **身份**：设施键，全系统唯一
- **生灭**：拥有者登记 → 在场，提供者据此声明支持 → 撤除；撤除后该键取不到设施
- **依据**：[执行环境：环境、落点与资源的概念](../product/execution-environments/design.md#环境落点与资源的概念)（rev 2）

### UL-environment-acquisition · 获取

- **宿主**：发起它的集成方的耐久账本；账本关闭它不再推进
- **身份**：集成方给的幂等键
- **生灭**：落点成立 → 获取中 → 临时回执 → 核验通过签发采用记录（或核验失败释放／待处置）→ 已获取 → 失效或释放中 → 已释放，或待处置并可同一操作重试
- **依据**：[执行环境：环境、落点与资源的概念](../product/execution-environments/design.md#环境落点与资源的概念)（rev 2）

### UL-environment-lease · 租约

- **宿主**：它所属的[获取](#ul-environment-acquisition--获取)；提供者退役、作用域释放、执行环境关闭、寿命到期回收、实例丢失或换代使它失效
- **身份**：获取加实例代
- **生灭**：核验通过交付 → 使用（每操作过守卫）→ 失效可观察 → 释放，结果已释放或待处置；共享环境不随一次释放销毁
- **依据**：[执行环境：环境、落点与资源的概念](../product/execution-environments/design.md#环境落点与资源的概念)（rev 2）

### UL-managed-resource · 受管资源

- **宿主**：造出它的[环境提供者](#ul-environment-provider--环境提供者)；耐久部分在集成方账本
- **身份**：键加提供者加 JSON 引用
- **生灭**：计划 → 许可 →（接续）→ 运行 → 已停（确认）或已停（未确认）；未确认保留处置责任与查询入口
- **依据**：[执行环境：环境、落点与资源的概念](../product/execution-environments/design.md#环境落点与资源的概念)（rev 2）

### UL-environment-provider · 环境提供者

- **宿主**：登记它的插件；卸载即撤除
- **身份**：名加代
- **生灭**：登记 → 在场，被匹配、获取、恢复 → 退役：先拒新租约，再排空，结果排空完成或待处置
- **依据**：[执行环境：环境、落点与资源的概念](../product/execution-environments/design.md#环境落点与资源的概念)（rev 2）
- **并入**：[沙箱实现](#ul-sandbox-implementation--沙箱实现)是它的一种——正文把沙箱实现当可装配的提供者用；宿主机提供者是另一种

### UL-file-batch · 文件批次

- **宿主**：造出它的[环境提供者](#ul-environment-provider--环境提供者)的文件设施；清单在集成方账本
- **身份**：批次编号加代
- **生灭**：全批预检 → 清单计划并取得许可 → 暂存 → 逐路径发布 → 已提交，或未知；恢复只识别完整、部分、中断、冲突、待确认，不续发布不回滚
- **依据**：[执行环境：环境、落点与资源的概念](../product/execution-environments/design.md#环境落点与资源的概念)（rev 2）

### UL-session-base · 会话据点

- **宿主**：正文未述——正文只给了一条消失路径「这一处的那份数据被清除」，没说身份里那个账号那一头没了它怎么办（账号本版无注销，那一问正文无从谈起）。**它不寄宿于任何进程**：「此刻有没有进程在服务它」与「它在不在」是两件事
- **身份**：**（哪一处 · 哪个[治理中心](#ul-governance-center--治理中心) · 哪个账号）**这一组合；「一处」是位置概念，**命令行交付形态把它落成一台机器**——换一台机器一定是另一处。标识形式正文未述。**有意不带**[登录状态](#ul-login-state--登录状态)（同账号登录两次看到同一批会话）与[租户](#ul-tenant--租户)（一个账号的多个租户身份共用这一份据点，租户隔离在它里面成立）
- **生灭**：这个账号**在这一处第一次登录到某个治理中心成功**那一刻产生 → 存在（装着这个账号在这一处开的全部[会话](#ul-session--会话)及其[日志](#ul-session-log--会话日志)、这些会话里等着人的[卡片](#ul-decision-card--决策卡片)、正在跑的[运行](#ul-run--运行)；**没人开着屏时照常运转**，机器关机才是停机）→ **这一处的那份数据被清除**时消失。**不随任何一次使用生灭**；成员资格无效期间里面那些会话不呈现，**也不删**
- **依据**：[PF-016 §4 会话据点](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#会话据点)（rev 13）；[PF-016 §5.2](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#52-一个账号在一处怎么被装起来)（rev 13）；[PF-016 §5.6](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)（rev 13）；[PF-016 §6.10](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#610-成员资格无效期间本机那些会话不呈现也不删)（rev 13）；[PF-016 §6.16](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#616-没人开着屏这一处照常发生事)（rev 13）
- **并入**：「用户本机上那个后台进程」（交付面草案里的「本机节点」）——**PF-016 的答案是那个「本机上的东西」不是进程**：会话、日志、卡片与运行所在的**那一处**才是对象，它不随进程起落而生灭；靠什么让它在无人开屏时运转，归技术设计

### UL-governance-center · 治理中心

- **宿主**：—（独立于任何人的机器。会话据点的身份里带着它，那是**据点依赖它**，不是它寄宿于谁）
- **身份**：**一次部署就是一个**；**身份不是它的地址**——地址只是够到它的方式，可以变，同一个中心换了地址，账号与组织一条不变。[登录标识「部署内唯一」](../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)里的那个「部署」就是它——两个治理中心上的同名标识**是两个[账号](#ul-account--账号)**。**可比较的东西是[治理中心标识](../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)**：首次启动定下、不变、跟着数据走；两个地址后面读到同一个标识就是同一个中心（[PF-017 §6.12](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)，rev 7）
- **生灭**：[运维者](../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)**第一次启动成功那一刻**产生（[治理中心标识](../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)在这一刻定下，里面零账号、零组织）→ **运行中 ⇄ 停着**（升级、换部署密钥、换机器换地址都在停着时做；同一份数据就是同一个中心）→ **本版没有销毁**；从零重立的是另一个中心，从备份恢复的仍是原来那个；普通崩溃、操作系统重启与断电不改变已确定的中心身份，灾备恢复须核对后再开放（[PF-017 flows §三](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/flows.md#三状态流转)，rev 7）
- **依据**：[PF-016 §4 治理中心](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#治理中心)（rev 13）；[PF-016 §5.1](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#51-三处地方各自拥有什么)（rev 13）；[PF-016 §5.6](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)（rev 13）；[PF-017 §5.2 中心的一生](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#52-中心的一生)（rev 8）；[PF-017 §6.12](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)（rev 8）；[PF-017 flows §三 状态流转](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/flows.md#三状态流转)（rev 8）
- **并入**：「治理事实所在的那个中心」（交付面草案里的「中心治理节点」）——同一处：[账号](#ul-account--账号)、[组织](#ul-organization--组织)、[租户](#ul-tenant--租户)与成员资格、角色、[邀请](#ul-invitation--邀请)与[隶属请求](#ul-affiliation-request--隶属请求)，以及组织层与租户层的那些范围化对象都在它那里，**而它不知道任何会话**

## 执行与收场

### UL-tool-execution · 工具执行

- **宿主**：[会话](#ul-session--会话)（前后台都是；它有自己独立的 runtime）——前台只说明当前步骤仍须等它的结果，[agent runtime](#ul-agent-runtime--agent-runtime) 在场时通过句柄等待，那一笔记在 Run 里
- **身份**：可持久恢复的执行身份，关联会话、原发起 Run／尝试及实际输入依据；具体标识格式未述
- **生灭**：发起（同一会话里同一工具同时在执行的超过并发上限时，超出的先排队、按发起先后轮到）→ 前台/后台 × 执行中/等待（本版要等应答的只在前台等）→ 完成 · 失败 · 被中断 · 等不到应答。前台到后台单向，「转后台」是前台那次调用的收场，后台那段另有收场；发起时就在后台的，前台那次调用当场以转后台收场。agent runtime 被回收、销毁或替换及句柄释放不影响它；工具自己的 runtime 失去连续性即停机、不重来、算失败，不设例外。被中断的来处：用户叫停（含插队）、这次运行被取消时它还在前台、agent 掐掉自己发起的后台执行、不许后台的跑到前台上限、会话被归档（不论前后台，不可逆）。参数说完了却解析不了的调用**不起执行**，那一次调用直接以失败回给 agent
- **依据**：[PF-006 §4 Tool Execution](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#tool-execution)（rev 24）；[PF-006 §5.5](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)（rev 24）；[PF-006 §6.5](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)（rev 24）；[PF-006 §6.6](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（rev 24）；[PF-006 §6.12](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)（rev 24）；[PF-012 §6.13](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 25）
- **并入**：「工具执行运行时」「一次工具调用」——正文当同一物用

### UL-model-call · 一次模型调用

- **宿主**：[会话](#ul-session--会话)；主流程、拓展件与压缩调用归所属 Run，旁路提问等 Run 外调用直接归会话。Agent runtime 只持有句柄，销毁不取消执行。**转换件本版不发起模型调用**
- **身份**：可持久恢复的调用身份，关联会话、所属 Run（若有）、原发起尝试及实际输入依据；具体标识格式未述
- **生灭**：待发出 → 在途（可在本层换一家或退避）→ 说话中（首 token 到，不可逆）→ 完整一份。三个终态：完整一份 · 上交 · 被中断。完整一份在落盘前被否决，**这次调用仍停在「完整一份」**，记下被谁否决，loop 另起新调用。恢复先查询原执行：存活则重取句柄，完成则读结果；确认模型执行自身失联才看首 token，之前可重发，之后一律不重发、收场原因记为运行时失联。结果已由消费方确认处理后，模型侧无用输入/结果副本进入清理直至释放；原身份、三个终态与账不随副本删除，旧引用仍明确确认/清理状态
- **依据**：[PF-013 flows §3.2](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)（rev 17）；[PF-013 §5.2](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#52-这一层的四要素填-pf-011-那一格)（rev 17）；[PF-013 §5.13](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（rev 17）；[PF-013 §6.19](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#619-消费方确认结果后清理模型侧不再需要的副本)（rev 17）
- **并入**：「模型请求的运行时」（PF-013 §5.13 的叫法，指执行这一次调用的那个协程——**不是规格里以「模型请求运行时」为名的那项能力**，见 [C-31](../ubiquitous_language/conflicts.md#现有冲突)）「模型请求」「进行中的模型响应」——正文没给它们各自的身份，是这一个对象的运行时面。**一次调用里的每一次[发出](../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)不另立对象**：它是过程，留下的是[模型响应体](#ul-model-response--模型响应体)

### UL-model-response · 模型响应体

- **宿主**：[会话日志](#ul-session-log--会话日志)——它是一条效力为留痕的[记录条目](#ul-record-entry--记录条目)的载荷，随日志留着；试过又失败的那几条不进方程、不进模型的上下文
- **身份**：正文未述；只要求分得出是哪次[模型调用](#ul-model-call--一次模型调用)的哪一次发出——哪一家、什么时候、上游回了什么状态码
- **生灭**：已确认的模型请求责任收场（成了 · 断了 · 被中断，含登记后发送前取消）时写下 → 写下后不改，要补靠追加（费用晚到的补一条）→ 随会话日志留着；发前拒绝尚未登记责任的没有它，记录本身不证明实际发送；首 token 之后这次调用不再有下一次发出
- **依据**：[PF-013 §5.5 试过又失败的那几次，留痕，不进方程](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)（rev 17）；[PF-013 §5.13 停机之后](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)（rev 17）；[PF-000 §4 条目效力](../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#条目效力--entry-standing)（rev 1）
- **并入**：「留痕」（PF-013 §5.5 对试过又失败的那几次的叫法）——正文当同一物用：每一家一条、哪一家、什么时候、状态码
- **未裁**：正文只对失败的那几次说「每一家一条留痕」；成功那一次「实际用了哪条档案、带了什么参数」的留痕，正文放在「那次请求的可追溯组成」里（[PF-004 §6.6](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)，rev 15；[PF-013 §4 模型档案](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#模型档案)，rev 12）——两者是不是同一条记录，正文未述；规格 `data.model-response` 按「每一次发出恰一条」把两样合在一条上。归 PF-013 的 owner；本轮未记入其 decisions

### UL-attachment · 附件

- **宿主**：产出它的那次[工具执行](#ul-tool-execution--工具执行)；实际存放在工具定义声明的那个存储里
- **身份**：靠地址——消息里告诉 agent 地址，由它自己去取；地址形态与唯一范围正文未述
- **生灭**：工具执行跑完时产出并存进存储；留存与清理正文未述
- **依据**：[PF-006 §4 工具的产出](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#工具的产出)（rev 24）；[PF-006 §6.4](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#64-依赖声明与解析)（rev 24）
- **未裁**：它存进的那个[存储](pending.md#存储)全系统没有定义；宿主因此也只是推断

### UL-offloaded-result · 被卸载的原始结果

- **宿主**：正文未述。它由一次[工具执行](#ul-tool-execution--工具执行)产出，却从来没进过[会话日志](#ul-session-log--会话日志)——日志里只有那条占位；物理存放归属未述；原始全文持续可回取，不因卸载、压缩、Run 结束或会话归档过期
- **身份**：正文未述。只要求占位里写得出「有多大、怎么取全文」，agent 据此分页取回
- **生灭**：工具结果落成消息之前判定太大 → 原始结果存起来，消息里换成带摘要的占位；之后可被分页取回，取回是往后追加两条新消息，不把占位换回去。当前没有删除或到期回收规则，不能自行缩短全文可回取承诺
- **依据**：[PF-006 §4 卸载](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#卸载)（rev 24）；[PF-006 §6.10](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 24）；[PF-012 §5.10](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)（rev 25）
- **并入**：「原始结果」「全文」——正文当同一物用。「工具原件」只在 PF-015 出现一次，且「原件」在 PF-013 另有所指，词条已列为弃用
- **未裁**：它存进的[存储](pending.md#存储)同样没有定义

### UL-schedule · 日程

- **宿主**：正文未述；系统或租户归属不等于生命周期宿主
- **身份**：可区别的一份日程安排，内含无独立身份的工作例程数据及日期处理／补跑／重叠／通知声明；包含系统自用与租户安排，精确标识正文未述
- **生灭**：一次创建包含工作描述与时间的安排，可用于一次性或重复工作；创建成功启用；暂停可恢复、结束不恢复；修改内容与策略只影响以后接受的作业，本版保留业务历史
- **依据**：[PF-021 §4 日程](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#日程)（rev 8）；[PF-021 §4 系统日程与出厂内容](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#系统日程与出厂内容)（rev 8）
- **未裁**：身份细化归系统架构与规格；生效、结果与业务历史要求沿 PF-021；精确状态转移及存储宿主归系统架构与规格，日期、漏跑重叠及通知政策沿产品 §6.11～6.13。

### UL-scheduled-job · 定时作业

- **宿主**：正文未述；与来源日程和执行会话的关联不等于随它们消失
- **身份**：区分某份日程的某一次到期工作；精确去重身份与标识正文未述
- **生灭**：预算和预览不是作业；最新依据校验后接受本次工作才产生，固定采用内容、来源时刻、依据与策略，承担执行、通知或执行并通知并留下处置结果；按实际执行与通知结果判定，未开始可单次取消且不再启动，已开始沿停止结果推进；运行内部恢复不另建作业，本版保留业务历史
- **依据**：[PF-021 §4 定时作业](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#定时作业)（rev 8）；[PF-021 §6.14 单次取消](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#614-取消单次-job)（rev 8）
- **未裁**：身份细化归系统架构与规格；生效、结果与业务历史要求沿 PF-021；精确状态转移及存储宿主归系统架构与规格，日期、漏跑重叠及通知政策沿产品 §6.11～6.13。


## 交互与派发

### UL-dispatch-report · 派发报告

- **宿主**：它所属的那次派发
- **身份**：每次派发至多一份
- **生灭**：子干完时交出 → 派发者的等待结束，这次派发随之终结。此后留存多久正文未述
- **依据**：[元能力：一次报告与后续消息](../product/meta-capabilities/design.md#一次报告与后续消息)（rev 4）
- **未裁**：`handoff` 有没有自主报告，正文未述。其派发调用只确认创建、不等报告；自主报告范围归元能力产品拥有者

### UL-decision-card · 决策卡片

- **宿主**：[会话](#ul-session--会话)（归属）；被它阻塞的是一次[工具执行](#ul-tool-execution--工具执行)或一次[运行](#ul-run--运行)
- **身份**：正文未述；一张卡片只能被答一次，会话里与决策池里看到的是同一张
- **生灭**：工具执行进入等待态，或放行判断算出某个动作要人点头，或一件拓展件出卡 → 等着（无超时出口）→ 被答复 · 被拒答 · 随运行被中断清掉 · 随会话被归档 · **它等的那次执行已终局（Tool 已可靠确认连续性丢失后落失败、原因「异常中断」）而在恢复对账时被关成「已作废」**——卡片上不落答案。**写不出卡时不产生它**：那些动作当作被拒、不执行，人被告知
- **依据**：[PF-008 §4 决策卡片](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#决策卡片)（rev 7）；[PF-008 §5.3](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思)（rev 7）；[PF-008 §6.1](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)（rev 7）；[PF-008 §6.8](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)（rev 7）；[PF-008 flows §3.1](../product.0.0.1.legacy/PF-008-human-in-the-loop/flows.md#31-一张决策卡片)（rev 7）

### UL-session-authorization-context · 会话授权上下文

- **宿主**：[会话](#ul-session--会话)（与会话同寿，归档不丢，撤销归档后原样还在）
- **身份**：每个会话一份
- **生灭**：空 → 攒着几笔 → 里面有撤回；只追加，不回头改，不归零
- **依据**：[元能力：会话授权上下文](../product/meta-capabilities/design.md#会话授权上下文)（rev 4）；[PF-015 §5.7](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#57-三个作用域在同一份数据里)（rev 21）

### UL-authorization-expression · 授权表达

- **宿主**：[会话授权上下文](#ul-session-authorization-context--会话授权上下文)——作用域为「这一次」「本会话」的那些落在它里面；**作用域为「全局」的那一笔不落在这里**，由具备资格的主体[按规则写入租户层权限设置](../product/meta-capabilities/design.md#会话授权上下文)，表达不等于设置已生效
- **身份**：正文未述；只要求**有先后**、**分得出是哪一笔**
- **生灭**：用户表达出来即追加一笔 → 此后不改、不删；**撤回是往后再追加一笔**，不是擦掉先前那笔
- **依据**：[元能力：一笔授权表达有三个维度](../product/meta-capabilities/design.md#会话授权上下文)（rev 4）；[元能力：产品规则](../product/meta-capabilities/design.md#动作放行与环境准入)（rev 4）
- **并入**：「决策记录」——[产品负责人 2026-09-22 裁为一物两名](../ubiquitous_language/conflicts.md)，正文当同一物用

### UL-inbound-arrival · 入站到达

- **宿主**：[会话](#ul-session--会话)（恰好一个；没有「飘着的到达」）
- **身份**：完整持久受理时成为可指认事实；同次提交的查询／重试返回原事实，不按正文相同合并不同提交。提交标识在租户、会话与来源范围内识别；具体标识格式正文未述
- **生灭**：送到 → 资格与目标会话检查 → 去重 → [消息准入](../ubiquitous_language/terms/agent-runtime-loop.md#ul-message-admission--消息准入--message-admission)（外部输入按来源校验，被拒收时发送方得到拒收结果；产品暂不为这一步设扩展位置） → 完整持久提交入站事实与去处责任 → 按去处三分：待处理消息 · 卡片答复 · 就地处置；实际生效另判。未提交由发送方保留并重试，提交后由系统恢复；回执未知须查明，不作未受理事实。消费或明确关闭留痕，原历史保留
- **依据**：[产品页 模型回复与工具结果](../product/agent-progression/design.md#模型回复与工具结果)（rev 2）；[PF-014 §4 入站到达](../product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#入站到达)（rev 14）；[PF-014 §4 三个去处](../product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#三个去处)（rev 14）；[PF-014 §6.1](../product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#61-先落账再谈别的)（rev 14）；[PF-014 §6.8](../product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#68-停机不会让一条入站到达永远悬着)（rev 14）
- **未裁**：它与[消息](#ul-message--消息)、[记录条目](#ul-record-entry--记录条目)是不是同一条日志记录的几种读法——「大多数入站到达会成为一条消息，但不是全部」，正文没有说透。归 PF-014 与 PF-009

## 记录与上下文

### UL-record-entry · 记录条目

- **宿主**：它声明的寿命宿主——首批取值是会话 · 运行 · 执行尝试 · agent runtime · 租户，默认会话，取值表未封板
- **身份**：正文未述；每条无条件携带寿命宿主、租户身份、出处、因果先后
- **生灭**：由一件发生的事产出（零条、一条或多条）→ 写下后不可变，要改靠追加 → 随寿命宿主一起消亡
- **依据**：[PF-000 §4 记录条目](../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#记录条目)（rev 1）；[PF-000 §5.5](../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)（rev 1）；[PF-000 §6.2](../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#62-k2依据的寿命不得短于要靠它重建的那个对象)（rev 1）

### UL-session-log · 会话日志

- **宿主**：[会话](#ul-session--会话)（归会话，不归运行）
- **身份**：一个会话一份
- **生灭**：随会话存在；只往后加，不回头改，不删；运行结束了它还在；归档、撤销归档、重新加载后一条不少
- **依据**：[PF-012 §4 会话日志](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#会话日志)（rev 25）；[PF-012 §5.2](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源)（rev 25）

### UL-message · 消息

- **宿主**：[会话日志](#ul-session-log--会话日志)——**`SystemMessage` 除外**：它不落日志，每次组装时按装配时定下的成分现算，没有落盘之后的那一段生灭
- **身份**：会话在受理时铸造，不能从会变的文本、时间戳或日志位置算出。类型是确定的，不靠解析内容。精确编码见[会话与工作](../../../docs/domains/sessions-and-work/README.md#模块角色与事实归属)
- **生灭**：流式到达期间只是「正在长的块」→ 长成一条完整消息落盘，或按「流断在半路」收场 → 落盘后不改不删；**消息之间没有取代**，状态类提醒也一律追加。后来的压缩若把它放进覆盖范围而不保留，模型之后只看到摘要；那是算出来的，消息本身一字不动。一次工具执行的那条 `ToolInternalMessage` 不论执行怎么收场都照常收尾，一块都没交付过的就没有这条
- **依据**：[PF-009 §4 消息](../product.0.0.1.legacy/PF-009-context-message-types/design.md#消息)（rev 9）；[PF-009 §4 半条消息不是消息](../product.0.0.1.legacy/PF-009-context-message-types/design.md#半条消息不是消息)（rev 9）；[PF-009 §5.4](../product.0.0.1.legacy/PF-009-context-message-types/design.md#54-提醒说的是现在什么样还是刚才发生了什么)（rev 9）；[PF-009 §5.6](../product.0.0.1.legacy/PF-009-context-message-types/design.md#56-流断在半路)（rev 9）；[PF-009 §5.8 执行帧就是这条消息的到达增量](../product.0.0.1.legacy/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)（rev 9）；[PF-009 §6.4](../product.0.0.1.legacy/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加)（rev 9）；[运行感知与一次模型请求 §7](../product/runtime-context/design.md#7-压缩保留历史与未完工作)（rev 4）
- **并入**：「排队的消息」——待处理与已承接是从日志派生的读法，不另立事实权威，持久投影仍可维护

### UL-content-block · 内容块

- **宿主**：[消息](#ul-message--消息)
- **身份**：正文未述
- **生灭**：开一个块（说明这块怎么填：追加片段 / 整体替换）→ 往里填 → 封口交出完整一块 → 落盘后块与它的两个标注都不再变；所在消息被压缩摘要后模型不再看到它，那是算出来的，不回写
- **依据**：[PF-009 §4 消息的内容是一串块](../product.0.0.1.legacy/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)（rev 9）；[PF-009 §4 每个块带两个标注](../product.0.0.1.legacy/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗)（rev 9）；[PF-009 §5.5](../product.0.0.1.legacy/PF-009-context-message-types/design.md#填有两种模式开块的时候说明是哪一种)（rev 9）

### UL-request-candidate · 请求候选

- **宿主**：持有它的调用方（会话路径上是发起请求的协调者）；正文未述它在调用方内的寿命边界
- **身份**：候选编号加输入摘要；同一组输入再算一次给同一份候选
- **生灭**：一次组装产生 → 被协调者固定成请求、被新候选取代，或被丢弃；装不下的不成为候选
- **依据**：[运行感知与一次模型请求 §6.1](../product/runtime-context/design.md#61-request-context-的派生计算)（rev 4）

### UL-compaction-plan · 压缩计划

- **宿主**：它所属的[请求候选](#ul-request-candidate--请求候选)；一个候选身份至多一个计划
- **身份**：计划编号
- **生灭**：装入裁定为需要压缩时给出 → 逐步执行，进度每步加一 → 压缩转换提交，或宣告装不下；步数上界定下后不变
- **依据**：[运行感知与一次模型请求 §7.1](../product/runtime-context/design.md#71-压缩计划与步骤)（rev 4）

### UL-prompt-contribution · 提示词贡献

- **宿主**：登记它的贡献者；贡献者卸载它随之撤销
- **身份**：名字加作用域；同层重名拒绝
- **生灭**：贡献者登记即生效 → 作用域内的遮蔽全局的 → 贡献者卸载撤销；无另外的删除动作
- **依据**：[运行感知与一次模型请求 §6.1](../product/runtime-context/design.md#61-request-context-的派生计算)（rev 4）

### UL-todo-item · 待办条目

- **宿主**：[会话](#ul-session--会话)——它活在一次会话里，不跨会话继承
- **身份**：正文只要求「每条待办有自己的身份」，在一次会话内分得出这一条与那一条，否则去掉与标成做完都指不准；靠什么标识，正文未述
- **生灭**：加一条 → 未完成 → 标成做完（做完了还留着）；或被去掉（不做了才去掉）。两者必须分得出。加一条不会让系统去做它。会话被归档时它怎么办，正文未述
- **依据**：[元能力：产品规则](../product/meta-capabilities/design.md#meta-todo)（rev 4）；[PF-015 §5.6](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 21）

### UL-business-calendar · 业务日历

- **宿主**：正文未述
- **身份**：以可指认的日历及适用范围区分，不将国家名称当作唯一性规则
- **生灭**：由日历服务供应并持续更新版本；本版不提供下架与自动清理动作
- **依据**：[PF-021 §4 业务日历与版本](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#业务日历与版本)（rev 8）
- **未裁**：身份细化归系统架构与规格；生效、结果与业务历史要求沿 PF-021；精确状态转移及存储宿主归系统架构与规格，日期、漏跑重叠及通知政策沿产品 §6.11～6.13。

### UL-business-calendar-version · 业务日历版本

- **宿主**：正文未述；所属业务日历可追溯，未规定随其退出而删除
- **身份**：同一业务日历内可区别的发布版本；精确版本标识正文未述
- **生灭**：校验通过后发布为不可变版本，后续新版本不原地改写它；本版不自动清理已发布版本
- **依据**：[PF-021 §4 业务日历与版本](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#业务日历与版本)（rev 8）
- **未裁**：身份细化归系统架构与规格；生效、结果与业务历史要求沿 PF-021；精确状态转移及存储宿主归系统架构与规格，日期、漏跑重叠及通知政策沿产品 §6.11～6.13。
