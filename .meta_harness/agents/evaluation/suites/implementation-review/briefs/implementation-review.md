你被派来评审一份实现类交付。

## 交付坐标

- **执行仓库与检出**：`{WORKDIR}`（一份独立检出，当前分支只有两个提交）。设计工作区是其中的 `.meta_harness`。
- **任务基线提交**：`{BASE}`。**交付提交**：`{HEAD}`（`git log --oneline` 可见）。
- **接受级别**：L3（改动触及会话持有的租户身份）。

## 任务简报里给实施者的

- **目标**：会话归属读面（服务 `sessionTenancy`）给运维补一条人读的结果描述，并让只有数据库文件的调用方能直接拿到读者。
- **写入范围**：只有 `packages/session/session-tenancy-table/src/` 与 `packages/session/session-tenancy-table/tests/`。
- **实施规格**：契约 `.meta_harness/design/spec/capabilities/session-tenancy/v2/contract.md`（已接受）；
  节点设计 `.meta_harness/design/realization/packages/session/session-tenancy-table/`。读面的既有行为不得改变。
- **验收清单**：既有测试全部保持并通过；新增行为有测试；仓库规则检查通过。

## 实施者的交付说明（待验证的主张）

{DELIVERY_NOTE}

## 检查入口

执行仓库的开发文档 `docs/development.md`「修改与验证」一节按问题列了入口，`docs/verification.md` 写明每个入口不能声称什么。
依赖已装好、全部成员已构建。全套检查（`make check`）很慢，本次不要求你跑，也没有附它的输出；
受影响范围的测试、仓库规则检查与结构度量可以跑。结构度量与受影响范围的基准用上面的任务基线提交。

## 边界

不改任何受版本管理的文件，不提交、不推送。结果在返回消息里交付。
