# 根宿主入口接入与旧入口退役

2026-09-15，用户在 skills/roles 迁入后授权接入软链接和退役旧入口，取代先前“只做工具、暂不切换”的阶段限制。
执行范围是 `feat/meta-harness` 工作树；主检出未切换，没有提交、合并或推送。

## 采用关系

| 旧入口 | 当前拥有者与消费位置 |
|---|---|
| architecture-design、implementation-planning、spec-maintenance、engineering-taste、cordis-authoritative-docs | 有效方法选择性吸纳进 [harness-design-handbook](../../skills/harness-design-handbook/canonical/SKILL.md)，不再单独安装；取舍见该包 `.design/` |
| write-agents-md、design-subagents、worktree-discipline | [skills canonical 源](../../README.md#skills)及宿主适配；原资源与修改映射见各包 `.design/migration.json` |
| 原 `.agents/roles/` | [roles 源](../../roles/README.md)，历史验证材料归 [legacy-roles](../legacy-roles/README.md) |
| 三个根目录内的局部 AGENTS/CLAUDE | 随原件退役；产品入口由承载仓库根约定导航，源与生成边界由 [.meta_harness/AGENTS.md](../../../AGENTS.md)及[工具](../../../tooling/README.md)拥有 |

三个根路径现在分别是 `.meta_harness/.agents`、`.meta_harness/.claude`、`.meta_harness/.codex`
的相对软链接。生成的 Codex/Claude Code skills 各四个，原生角色各八个；共享角色源不另挂在 `.agents/roles/`。

## 原件保留与执行

[manifest.json](manifest.json)列出退役前全部 146 个文件的原路径、Git 修订、内容 SHA-256、权限和大小；
[roots.tar.gz](roots.tar.gz)保存完整三个实体目录。所有原文件都由 Git 跟踪，切换前与基线一致，
没有额外账户、设置或未登记本地文件。归档逐项核对路径集合、内容与权限后，才移出旧目录并运行链接工具。
链接创建和只读核对成功后，清理本次临时备份；归档长期保留，不作为宿主入口或当前方法资源。

如需核对原文，把归档解到明确的独立临时目录；不要解到当前根覆盖软链接。
记录中的历史路径指向归档原件，不表示该路径仍是维护源。旧试用与支持快照保留原对象和时间范围。

接入同时更新承载仓库的 AGENTS、CONTRIBUTING、开发指南、源码布局与受影响导航，
以及 Makefile、检查编排、Python 测试发现和 Markdown 检查范围。新需求 intake 与设计进入
`.meta_harness/design/`；旧产品需求、设计与 spec 正文仍按明确版本接续，没有整体迁移或新建同义登记表。

## 验证范围

实际对象与哈希见 [checks.json](checks.json)：归档 146 个原件、主检出对应文件及权限未变，
三个相对链接可达，完整 142 个预期产物的集合、内容和权限均匹配。

| 检查 | 实际结果与证据 |
|---|---|
| `make agents-check` | 142 个预期产物与三个根链接通过；[输出](agents-check.log) |
| `make docs-check BASELINE=55ac071ec2c41f90ec836b21cf43db32dc4abb5e` | 首轮发现 apps/packages 的两个旧 skill 断链，见[失败输出](docs-check.log)；修复后 943 份 Markdown 与冻结/归档核对通过，见[结果](docs-check-final.log) |
| 根 pyproject 的完整 Python 测试发现 | `PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest -q -p no:cacheprovider --basetemp=tmp/host-entry-retirement-tests`：118 passed，无清理警告；[输出](tests.log) |
| 脚本语法与 diff | `bash -n scripts/check.sh`、`git diff --check` 通过 |

独立普通 agent 从三个新根入口重做五题只读导航：局部链接修复、仅 intake 的新需求、
已发布契约与注释冲突、应用穿透提供者边界、同时维护角色与手册源。均到达对应拥有者与 skill，
没有将普通修复扩大为完整设计、选择未指定产品基线或把生成物当作源；所走路径未发现阻断矛盾。
输入、实读入口哈希、物理 prompt 行数与观察摘要见[导航试用](navigation-probes.json)；
这是返回结果的摘要，完整回答留在会话，不声称已独立采集全部工具轨迹或实际宿主继承内容。

原有迁移与模型试用记录不回写为本次根链接的证据；文件生成、相对链接和离线检查不证明
当前会话已重新发现原生角色、权限已生效或模型行为已验证。本次入口变更未运行产品或形式模型测试。
