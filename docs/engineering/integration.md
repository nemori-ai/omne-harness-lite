# 多层分支集成

本页拥有工程路线、双基线与权限规则。精确工具行为归[集成工具契约](../../tools/ts-checks/src/integration/SPEC.md)，命令归其[README](../../tools/ts-checks/src/integration/README.md)。任务仍归[现有交付协议](delivery.md)，不新增活动队列或自动接受规则。

## 采用状态

采用事实以正式tag和实际bootstrap读回为准。PanQiWei已授权首次采用，[工程启用任务](https://github.com/nemori-ai/omne-harness-lite/issues/195)保存实际检查和具名决定。未提交文件、skill 可见、日期或测试通过都不启用机制。正式采用须在本次工作树全部正式成果提交后，由具名负责人确认 construction 完整性、实际平台接入及独立验证，再创建不可覆盖的采用 tag。现有GitHub delivery的启用与集成机制采用分别管理。

正式接入须保护采用 tag 命名空间，禁止覆盖和删除。positive-absence 只证明当次完整查询没有采用 refs，不证明历史上从未采用。已有采用线索时缺失来源仍为 unknown。新 clone 和权威仓库同时失去所有历史线索时，Git 无法区分首次未采用与历史丢失；具名 owner 必须核对初次采用依据或恢复责任，不能仅凭空查询授权启用。

## 分支与任务

main 保存完整集成结果。任意数量的 integration/<track> 保存已登记责任轨道。stable 指向 main 中经过完整检查的既有 checkpoint。轨道和 stable 不加用户名；工作及临时分支遵守人的署名约定。

任务从真实 Issue 的 revision 和当前 attempt 开始。指定调度者记录并读回人的责任、分支、route、不可变 taskBase、写范围与条件定位。普通任务进入登记轨道；cross-track 或 global 完整单元进入 main，并具名受影响责任。目录不能自动决定路线。

## 完整集成

工作分支向轨道运输完整源前缀。FI 将 main 的完整前缀带到轨道。RI 将轨道未被 main 覆盖的完整单元提升到 main。joint 将多个完整源组合成一个候选。破坏性跨轨道修改同时交付定义、提供者、真实消费者与测试。选择性 cherry-pick 不构成正式 RI。

每次共享发布同时创建 immutable unit tag。RI 自动从这些事实推导完整任务集合，保留每卡自己的 revision、attempt、taskBase 和 taskSource。运输层改变不自动新建卡或提高交付修订。

## 两条基线

候选固定目标 B 和源 S。除 stable checkpoint 外，C 第一父为 B；stable 直接使用已有 main C，只要求旧 stable 是其祖先。B 用于影响面与组合检查。每张卡原始 taskBase 用于到 taskSource 的逐提交审计，仍检查先改后改回及所有相关合并父。FI 或最新目标不能重写任务原起点。全局 main 趋势仍使用 main。

## 权限、候选与恢复

共享集成由明确的集成拥有者执行。工具从已采用提交运行 checker，候选 C 只提供被测输入。候选必须提交且干净，真实命令前后 HEAD 和 tree 不变。验证回执不是任务接受。

发布读取具名 owner 的真实 Issue comment 决定，并再读每卡当前输入和 integration 条件。目标更新比较 expected B，先证明 B 是 C 祖先。branch 和不可覆盖 tag 同一事务更新。目标变化要求重建候选和复验，不能退回普通快进或强推。

超时先观察实际 refs。已发布但 Issue 投影失败时，由原正文单写者修复技术记录，不重放 Git。进入轨道、main、stable、交付接受与关闭分别记录。工具不修改 Stage、接受或关闭。

## 稳定点与轨道演进

stable 选择已有 main 提交，只要求旧 stable 是其祖先。首次创建固定 audit 起点。full profile 及约定的 startup、install、migration、主路径检查归采用 policy。main 后续前进不改变选定 checkpoint。

轨道 registry 记录稳定 ID、owner、来源、状态、initial main anchor 与必要检查。新增或修改 registry 由 owner 提交并按当前受信规则验证后显式采用。bootstrap 用 expected absent 创建初始 ref 和 unit。暂停轨道拒绝新任务。owner 更换先交接未提升 prefix 与活动任务。

退役只形成并核清单。删除 ref、工作树或唯一临时材料仍按[工作约定](workflow.md#责任与协作交接)和[发布边界](publication.md)取得明确授权。Git revert 不撤销外部副作用。

## 未来启用

未来采用前，负责人须核对完整已提交 construction、clean HEAD、必要检查、可信 main 上的 descriptor、已启用 delivery、真实具名决定、现有树 legacy 清单及远端 atomic/Rulesets 资格。新 clone 显式 bootstrap；缺 anchor 或 context 返回 unknown，不回退 main。legacy 仅适用于登记的旧树和旧任务。

工具 README 提供实际命令。规则、模板、生成与本地 bare 测试不能证明 GitHub Rulesets、Actions 或真实宿主已生效。

## 同步与提升的节奏

以事件触发为主。开工或重新接活时，owner 比较工作任务、来源轨道和 main 的实际 SHA；RI 前及 main 有破坏性变更后，再核需要的 FI/task-sync。活跃轨道以完整小批量及时提升，避免长时间累积漂移。空闲轨道在恢复活动时同步，不按日历给所有轨道增加全量构建或付费模型预算。

RI 后，来源轨道若还要继续工作，先检查 main 是否包含新的组合修正或其他轨道前缀；需要这些变化时执行 FI。轨道已包含同一 main 内容时不为流程制造空同步。其他活跃轨道按受影响契约同步；破坏性公共变更由集成 owner 协调相关 owner，在继续依赖工作前闭合。空闲轨道保留已知漂移，恢复时处理。

冲突由本次候选的集成 owner 在独立 candidate worktree 解决，涉及含义的取舍交相应语义 owner。worker 提供来源和测试，不修改共享目标解决冲突。重新封存的 C 需要实际组合验证；各源单独通过不能代替它。

## Issue 与 Project 的配合

每卡声明 completionTarget，并按同一条件表记录 start、integration、acceptance。integration 可限定目标层或实际 ref；未声明为 all。只要求进入 main 前满足的条件，不阻 work→track。最终“main/stable 已包含本结果”属于 acceptance，不作为自身运输前置。

完成 track 即可接受的卡，后续仍可能随完整 prefix 进入 main/stable。历史 unit 保留原 revision/attempt；新的操作由有权 owner 精确重核历史与当前输入、确认未撤销和适用性并重新验证 C。旧 work 操作在任务输入变化后失效，不把接受或关闭当作所有未来运输的拒绝或自动许可。

Project 可由原单投影写者维护可选 Integration target 与 Integration progress 视图，来源为 Issue 的声明和实际 Git unit/checkpoint。视图只报告 declared/observed 及 unknown/inconsistent，不能作第二可编辑队列、改变 Stage 或产生 Accepted/Closes。未配置真实字段时不造字段 ID；本工具不写平台。

## 清理与政策接续

每操作保留固定输入、冲突树、receipt、intent 和观察。先核 Git 已发布、各卡剩余接受/投影责任已交接、唯一 tmp 有去向，再按现有权限清理。unknown 或分裂 ref 时保留证据，不盲重建或重试。

政策或轨道 registry 升级先由旧 adopted runner 验证已经提交的新 main。具名采用决定绑定精确工作树/context 交接清单；旧 context 和 operation 随 anchor 更换失效。其他 clone 的待发布操作由 owner 一并交接并 bootstrap，新树按新的真实派发接续。工具不自动改历史记录、删除旧树或给予旧候选新资格。

历史聚合以完整稳定 Issue identity、revision、attempt 为键。同一卡不同历史 tuple 分别保留 taskBase/taskSource 和原 unit 包含关系，不代表多个当前绑定；同 tuple 的完整 binding 不一致或 source ancestry 分叉仍拒绝。RI/joint/checkpoint 为每个过期 tuple 分别取得 exact owner 重核并审计，不能取最新 taskBase 吞掉旧历史。

政策升级的具名 owner 从 handoff 开始冻结各 clone 的发布，核清在途操作，在新采用与任务接续后恢复。变更入口重读完整权威采用链，旧 anchor 拒绝并要求 bootstrap。该读回与 branch CAS 不是跨 ref 原子事务；升级与发布的串行关系由这次明确交接保证，不宣称同凭据操作者无法绕过。

## 首次接入范围与操作入口

首次policy登记PanQiWei为owner，development轨道从已确认main基线建立，普通独立任务使用该轨道；global和跨轨道结果继续明确进入main。首次采用的legacy清单为空，旧任务不因树或分支保留而取得豁免。

采用前的完整construction通过PR提交到main，再从干净的精确main检出执行activation-check、具名adopt决定和activate。construction进入main但adoption未成功期间，普通检查返回unknown；这是受控接入窗口，不能把提交当采用。

已采用检出先bootstrap，工作树再依据真实Issue派发取得context。main没有任务context时，不直接运行带任务基线的check-plan或make check，也不伪造Issue绑定；通过checkpoint prepare和verify运行完整检查。无需发布stable时可停在verified，checkpoint发布另受实际任务授权约束。

当前full profile验证工程工具入口启动、runner/subject锁定依赖安装、真实Git采用与模板迁移场景、开发者上下文查询及工程静态检查。首次启用只执行这一组检查；此前已验证且输入未变的行为证据沿用原记录。`packages.0.0.1.legacy/`与`apps.0.0.1.legacy/`不进入工程静态扫描，也不执行封存产品的全量构建、类型、测试或验收。工具自身必需的依赖安装、构建不代表验证旧产品。新packages/apps仍是产品骨架，产品传感器没有输入时如实报告无数据，工程检查通过不代替产品质量结论。新版产品的startup、数据迁移及严格产品传感器门槛须由未来真实成员提供证据。

平台前提为仓库规则24926783对adoption和unit标签禁止更新、删除及非快进修改，无bypass。Actions仍沿现有手动、本地验证政策；本次不声称启用自动Actions或验证所有coding agent宿主。实际采用与接续命令归工具README。
