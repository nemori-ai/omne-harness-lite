# 来源与可复核观察

## 基线与取得方式

- 原始来源：本仓库设计正文，作者自述的产品与规范承诺；不是外部实现测量。
- 精确输入：Git `68377643b02ab90d2069de5279499edc2e9dccfe`。版本可由 `git show 68377643:<路径>` 恢复；下列相对链接供日常阅读，历史判断以该提交为准。
- 取得方式：读取十份 PF 的本轮增量、`registry/catalog.json`、`covers.json` 的坐标和消费条款，回读下列规范和节点；对受影响输入作静态场景对照。架构与规格分别作过独立只读评审，关键发现均回核原文。
- 支持范围：判断设计承诺之间是否一致；未执行 Schema 样例、模型、源码行为或 IO 测试。文中反例是依据条款推演，未伪称实际失败运行。
- 版本后续变化：任何所列条款或产品输入变化，须重新核对对应结论；本轮未发布新版本。

## 身份与清单

产品依据：[PF-002 rev24](../../design/product/PF-002-assets-settings-and-permissions/design.md)、[PF-015 rev13 §6.13](../../design/product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空)、[PF-020 rev21](../../design/product/PF-020-workspace/design.md) 的关系、实例与资产段落。

| 精确来源 | 实际观察 | 对新产品的影响 |
|---|---|---|
| [identity-values/v1 S-22、CS-6](../../design/spec/data/identity-values/v1/contract.md#s-22-路径是地址不是钥匙) | 同目录不同 TenantId 是两份互不可见工作区；TenantId 是身份必需分量 | 与同工作区／同实例可跨租户使用冲突；不能仅按成员有效推出参与资格 |
| [asset-model/v3 S-17](../../design/spec/data/asset-model/v3/contract.md#s-17-工作区键)、S-19；v2 同条款 | WorkspaceKey 为 tenant＋directory；carrier 资产记录由该键与能力标识导出，所有者是挂上它的租户 | 逻辑工作区与实例／求值上下文混为同一键；变更会传到 carrier 及持有 |
| [asset-model/v3 S-24](../../design/spec/data/asset-model/v3/contract.md#s-24-工作区承载清单)；v2 同条款 | 单 `.omne/workspace.json`，三个必填列表，显式列举、不扫描；符号链接处理只要求解析后不逃逸 | 不承载默认目录发现、双来源、嵌套 glob 与一律排除软链接 |
| [asset-evaluation/v3 S-7](../../design/spec/capabilities/asset-evaluation/v3/contract.md#s-7-输入的一致性条件)、S-16／PRE-5；v2 同条款 | C3 核工作区键租户与求值租户；前提是工作区归会话租户持有 | 原键不能代表共享身份；现有租户核对也不能直接删除来宣称支持共享 |
| [asset-evaluation/v3 S-27、S-28](../../design/spec/capabilities/asset-evaluation/v3/contract.md#s-27-清单列的资产变成工作区那一格的持有)；v2 同条款 | 未列资产不存在；指向未列资产的配置以 `unknown_asset` 丢弃 | 单独读 local 配置会丢掉只针对 shared 资产的覆盖；直接拼接又可能违反能力唯一条件 |
| [AM 节点](../../design/realization/packages/core/asset-model/design.md)、[AE 节点](../../design/realization/packages/core/asset-evaluation/design.md) | 公开解析、键、记录导法和读入投影沿上述规则；当前 README 记已采用 v3 | 旧 core 验证不覆盖新工作区语义；纯模块不拥有真实目录发现 |

上述冲突的判定不依赖文件系统是否已实现；同一规则要求“未列不存在”和“根约定目录可自动发现”已经足以区分两个承诺。

## 重载与求值时点

来源：[asset-registry/v2](../../design/spec/capabilities/asset-registry/v2/contract.md)、[节点设计](../../design/realization/packages/tools/asset-registry/design.md)。

- S-23④⑧：按类别建候选目标表，检查通过、装配清单追加成功才提交；无法读入或解析时表不换。
- S-24②：工作区内容使用最近一次装配或 reload 读入的那份，明确不在每次尝试重读；此刻变化的是治理持有、配值等。
- S-28：只对资产治理的通知收窄命令，不是工作区文件监听或全表重填。
- S-25、S-33：旧快照／重启重建取不回对应工作区正文时答不可用，不能偷用新正文。
- 节点 A-2：求值输入读面仍缺接口／提供者，CLI 的 C-3 同样登记此边界。

支持“显式 reload、先校验后替换已有规则”的结论；不支持“真实来源读入已交付”或“所有旧内容总能恢复”。

## 兼容与技能

- [PF-020 同工作区第三方资产](../../design/product/PF-020-workspace/design.md#同工作区的第三方资产)：原位置读取、候选仍进工作区层；来源开关默认关闭，开启不等于运行授权。
- [hooks-import/v2 S-2、S-5、S-11](../../design/spec/capabilities/hooks-import/v2/contract.md#s-2-本契约不拥有什么)：导入只翻译显式输入值，不读目录、不写资产。来源种类含工作区与用户／托管来源，不意味着工作区开关可访问用户目录。
- [hooks-import/v2 S-9](../../design/spec/capabilities/hooks-import/v2/contract.md#s-9-工作区来源的-hook导入即禁用)、P-6、G-8：落地在租户格，以该格 disabled 启用；[AE3 S-17](../../design/spec/capabilities/asset-evaluation/v3/contract.md#s-17-第一步之一先按禁用滤) 明文沿用“导入成租户格持有”。与原位置候选进入工作区层不一致；事件翻译表 S-23／S-24 本身无本轮引起的变更。
- [hooks 节点 HI-N5](../../design/realization/packages/agent-loop/hooks-import/design.md#实施缺口与消费者影响)：导入者到资产治理落地的链尚缺，且叙述落地在治理中心；不能直接充当新的工作区发现链。
- [skill-package/v3 S-9～S-11、S-21、CS-3／CS-4、P-4](../../design/spec/data/skill-package/v3/contract.md)、v2 对应条款：包内路径、读取不执行、脚本必须声明、目录形态仍成立。P-4 理由引用的“资源不在文件系统视野里”已被 PF-007 rev19 修订；没有发现强制文件不可见的规范操作。

这些观察支持分开演进落地交接与兼容发现，不能推出要重做 hook 映射表、允许任意脚本或放宽文件访问权限。

## 既有窄口与应用范围

| 来源 | 实际承诺／排除 | 本轮判断的范围 |
|---|---|---|
| [asset-governance/v2 S-9](../../design/spec/capabilities/asset-governance/v2/contract.md#s-9-持有本契约写得到的两层与写不到的两层)、[asset-transfer/v2](../../design/spec/capabilities/asset-transfer/v2/contract.md) | 写面针对组织／租户层资产，不写工作区文件持有 | PF-003 的范围澄清不要求放宽原私有资产流转 |
| [session-tenancy/v2 S-1、S-2](../../design/spec/capabilities/session-tenancy/v2/contract.md#s-2-本契约不拥有什么) | 稳定读取会话持有的租户；工作区等其余事实不归该窄口 | 跨租户实例不意味着会话本身改变租户归属 |
| [execution-environments/v2 S-1、S-2](../../design/spec/capabilities/execution-environments/v2/contract.md#s-2-本契约不拥有什么) | 宿主落点、进程组；沙箱完整生命周期、会话其余部分不收 | 不把目录定位当工作区授权，也未承诺工作区管理 |
| [assembly-manifest/v2](../../design/spec/capabilities/assembly-manifest/v2/contract.md)、[store 节点](../../design/realization/packages/assets/assembly-manifest-store/design.md) | 装配记录存取，不拥有工作区发现和关系 | 保留提交纪律，不自动补上完整 PF-004 |
| [slash-command/v2](../../design/spec/data/slash-command/v2/contract.md) | 命令数据与绑定，reload 业务归注册表 | 无须将 reload 改成完整重新装配；非完整 intake 技术交付 |
| [CLI 节点](../../design/realization/apps/cli/README.md)及其 [C-3／C-4／C-8／C-13](../../design/realization/apps/cli/design.md) | 已有治理入口；据点输入、未来中心资产边、完整 runtime／受理、会话契约各有缺口 | 当前治理 CLI 验证未覆盖工作区 attach 与关系生命周期 |
| [tenancy-host 节点](../../design/realization/apps/tenancy-host/README.md) | 已有身份／组织治理入口与部署；本轮产品修订提示明确不提升工作区状态 | Git 托管位置不能从治理部署进程／存储推断 |

取得方式为正文边界核对，并沿现有投影与 registry 找消费者；不是全仓实现测试或不存在性证明。
