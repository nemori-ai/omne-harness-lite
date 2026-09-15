# Agent 编译工具

本轮实现从一个 `agents/` 源根按宿主策略编译四处目录，并提供独立的相对软链接工具。
`projection.py` 解析源和适配并产生内存产物，`compile_agents.py` 负责 CLI 与预检写入，
`link_agents.py` 暴露项目入口。没有安装更新器、发布事务或知识图谱依赖。

## 使用

需要 Python 3.12+ 与 PyYAML；运行测试另需 pytest。选择已准备好这些依赖的解释器，
以下命令从明确的 `.meta_harness` 工作区根运行。若执行仓库已提供锁定环境，
可以使用该环境的 `uv run --locked python` / `uv run --locked pytest`，不从父目录猜测环境。

```sh
python tooling/src/compile_agents.py --source agents --output .
python tooling/src/compile_agents.py --source agents --output . --check
PYTHONDONTWRITEBYTECODE=1 pytest -p no:cacheprovider \
  tooling/tests agents/skills/design-subagents/canonical/scripts
```

输出根必须显式指定，正常产物留在 `.meta_harness/`。可用 `--host codex` 或
`--host claude-code` 单独生成，默认 `all`。不同宿主原生目录分别保留在输出根下。
相同内容与权限可重复生成；不同内容或权限的既存文件会使
整个预检失败，不覆盖、不删除。修改源后使用新的暂存目录比较。`--check` 只读检查
应生成文件是否存在且一致；它不把输出目录中的其他文件当成本工具所有，不检查或删除它们。

输出根可包含源目录（如 `.meta_harness/agents`），但具体生成路径不得与源重叠；
输出根不得放在源内。工具拒绝源/目标符号链接和越界输出；所有源与目标冲突先预检。
写入过程中发生磁盘等故障仍可能留下部分新文件，不承诺四个目录跨文件事务；
失败会非零退出，重跑或检查可发现未完成的输出。

## Skill 策略

每个所选宿主都需要 `agents/skills/<name>/adapters/<host>/strategy.yaml`：

```yaml
version: 1
host: codex
skill: example-skill
mode: copy
slots:
  "{{HOST_GUIDANCE}}": slots/host-guidance.md
```

`slots` 可省略。替换文件相对当前 adapter，不能越界；仅替换 canonical 中 Markdown 的
大写 `{{NAME}}` slots，做一遍替换，不递归执行模板。维护者入口 `AGENTS.md`、`CLAUDE.md`、
`.design/`、`evals/` 与缓存不进入产物。脚本保留可执行性，普通文件规范为 0644、可执行文件为 0755。

`mode: unsupported` 必须提供非空 `reason`，使所选宿主构建失败并说明缺口；
不是自动丢弃或发一个看似可用的空 skill。当前仅支持这两种模式；未知字段、版本、模式和
身份不匹配均拒绝。本轮不实现 cc-master 的 stub、partial overlay 或完整发布事务。

## 根软链接

先生成完整 all 产物，再在允许接入的产品根运行：

```sh
python .meta_harness/tooling/src/link_agents.py --project-root .
python .meta_harness/tooling/src/link_agents.py --project-root . --check
```

工具预检三个目标后，创建 `.claude`、`.agents`、`.codex` 到 `.meta_harness/` 内同名目录的
相对链接；正确链接可重复运行，其他链接或实体路径一律拒绝，不删除、不搬迁、不覆盖。
当前承载 worktree 的旧实体已单独留档退役，并实际完成三个链接，见
[接入记录](../agents/evaluation/host-entry-retirement/README.md)。工具本身仍不迁移既存内容；
其他目标根若有实体目录，须按相应任务授权先处理来源与退役。创建、冲突保护、只读核对和
整体目录移动后的相对链接有效性另有临时夹具验证。

三个链接不是跨文件事务；并发创建或磁盘故障可能留下部分新链接，错误不会伪报成功。
重新运行或 `--check` 可检查剩余工作；正式安装更新器仍未实现。

## 复用边界

角色编译复用工作区内部 `agents/skills/design-subagents/canonical/scripts/render_pair.py`，
通过其 `render(source)` 接口取得原生内容；支持记录随该 skill 完整保留，生成算法不另写副本。
默认相对本工具所属 `.meta_harness` 定位；`--role-renderer PATH` 可显式提供同接口的 Python 模块。
该参数是可信的本地编译器代码，不是供不可信输入动态加载的插件接口。

只有存在角色源时才加载角色生成器。整个工作区移到不含原仓库的目录后，生成与只读检查
通过独立夹具验证；代码和运行资源已闭合，但 Python 依赖环境仍需明确准备，并未新增安装更新器。

## 验收边界

- 无 slot 的 skill 文本及二进制资源在两端逐字节一致，局部 slot 只改变所选宿主的声明片段。
- 临时角色夹具同时生成两端原生配置，保留共享正文、引号、Unicode 与权限字段。
- 全部源预检、输出冲突、重名、路径逃逸与只读检查具有可重复测试。
- 可执行资源可以直接执行；模式漂移被只读检查发现。
- 相对链接可重入、可随项目一起搬动；既有根目录不会被链接工具替换。
- 产物留在本工作区；当前 worktree 根入口已接入，产品需求、设计和 spec 正文没有整体迁移。

这些是静态生成与文件操作证据，不证明宿主已发现配置、权限已生效或模型行为符合预期。
