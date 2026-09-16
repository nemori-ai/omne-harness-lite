# 租户与授权实现不变量：证据记录

- 消费对象：TG/AU/BG 覆盖判断、条款 lineage 与 provider gap
- 源：`docs/research/tenant-authorization-invariants.md`，固定提交 `e3573ca72d18bfe7ddd002df5025551b51eede46`，SHA-256 `e6e9372689299d9e1144b4dada85e2f7e5ca9fa4185d5321e3e1d126e26ed8fb`
- 取得：P0 固定源清单逐字节核对；源页内外部链接固定 omne-next 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`
- 实际观察：固定 omne-next 6263fed 的源码/测试观察支持 tenant/user 双凭据、active membership、deny override 与 fence；观察不等于本项目接受政策。
- 支持范围：只支持源页列出的文档/源码/测试事实及其明确局限
- 不支持：新 baseline 接受、运行符合、跨版本全面等价、未执行实验或未列出的产品政策

## 会影响实现的反例 D1～D8

| 编号 | 固定观察 | 对当前设计的约束 |
|---|---|---|
| D1 | Accepted 要求只有 owner 改角色、admin 不管理 admin/owner；旧 `change_role/remove_member/invite_member` 只过 owner/admin 通用门，测试还断言 admin 可把 member 升为 admin | TG 必须用显式操作资格；旧测试不是可继承验收 |
| D2 | removed 后 re-invite 保留同一 membership_id，测试明确要求复用；旧模型没有 joinedRevision | 重加入必须换资格 revision，旧 grant 不复活 |
| D3 | Accepted 要求 suspended/revoked/terminal tenant 阻止新业务；旧 resolver、member query、asset query 只查凭据/active membership，不读 Tenant status | tenant、membership、account 状态必须分别在当前门核验 |
| D4 | 旧撤权按 `(user_id,agent_id)` 分区，fence 另加 tenant；PermissionGrant 不表达精确 DefinitionRef 版本集 | 不能把旧 aggregate/version 当 AU-02 身份依据 |
| D5 | granular/open_all 是设备模式，detector unavailable 可转 HITL | 不证明 AU 的确认模式或四值求值存在 |
| D6 | 角色门读后撤权、再 load/write 仍可能过 CAS；PEP allow 后 `await audit`，撤权可发生在 inner invocation 前且无末门重检 | AU/CC 必须以 stamp、generation 与当前资格关闭 TOCTOU |
| D7 | 成员/设置管理读面和另一用户 Session 拒绝有局部证据，但无完整装配证明组织管理员不能读私人正文 | 管理资格与内容读取资格分别验证 |
| D8 | Accepted 组织创建要求同逻辑重试不重复；一般旧 create 缺 tenant_id 时会重新 mint，未见 operation-key 去重 | 创建重试须认回原操作，不能把个人槽位收敛外推 |

## 可恢复坐标与执行状态

所有路径固定 `nemori-ai/omne-next@6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，根为
`omne_harness/`。Q 是 Accepted requirement；S 是静态源码观察；T 是**未执行**测试源码。

| ID | 路径 / 符号 / 行 | 支持范围 |
|---|---|---|
| Q1/Q2 | `requirements/capabilities/tenant-personal-tenant-provisioning-and-active-tenant-selection.md:28-110`；`requirements/capabilities/tenant-organization-tenant-and-membership-lifecycle.md:31-189` | Accepted tenant/member 产品边界 |
| S07 | `libs/omne_harness_tenant_web_server/omne_harness_tenant_web_server/api/routers/membership_router.py:567-805` | D1、D6 member mutation 入口门 |
| S08 | `libs/omne_harness_tenant/omne_harness_tenant/application/services/membership.py:149-280` | D1 actor qualification 缺口 |
| S09/T4 | `libs/omne_harness_tenant/omne_harness_tenant/domain/tenant.py:454-512`；`libs/omne_harness_tenant/tests/unit/test_tenant_aggregate.py:154-197` | D2 rejoin ID；测试未运行 |
| S10/S11/S13 | `libs/omne_harness_tenant_web_server/omne_harness_tenant_web_server/authz.py:105-351`；`libs/omne_harness_tenant/omne_harness_tenant/application/services/active_tenant_resolution.py:71-155`；`libs/omne_harness_tenant/omne_harness_tenant/persistence/repositories/sql.py:921-992` | 管理可见性与 D3 |
| S12/S25 | `libs/omne_harness_tenant/omne_harness_tenant/application/services/asset_access_query.py:19-49`；`libs/omne_harness_tenant/omne_harness_tenant/domain/enums.py:31-91` | D3 tenant status/suspended 缺口 |
| S14/S17 | `libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/domain/aggregates.py:620-840`；`libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/policy/evaluator.py:65-255` | D4/D5 授权与模式边界 |
| S21/S22 | `libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/policy/guarded_tool.py:128-185`；`libs/omne_harness_tenant/omne_harness_tenant/persistence/repositories/sql.py:179-275` | D6 audit await/CAS 竞态 |
| S23/S24 | `libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/persistence/repositories/sql.py:938-1046`；`libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/policy/fence.py:34-211` | 撤权 authority 与缓存范围 |
| S26 | `libs/omne_harness_tenant/omne_harness_tenant/application/services/tenant_lifecycle.py:61-138` | D8 一般创建缺 operation key |
| T1/T3 | `tests/integration/single_node/test_single_node_owner_tenant_scoped_reads.py:134-192`；`libs/omne_harness_tenant_web_server/tests/unit/test_membership_write_router.py:247-274` | D7 与 admin 越权；均未运行 |

静态阅读没有启动旧产品，也没有执行上述测试、模型或真实 Cordis 组合；外围代码可能补齐的
保证仍未知。Accepted 要求、Draft/设计注释、源码行为和未执行测试断言始终分开。
