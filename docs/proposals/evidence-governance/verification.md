# 本轮验证

对象为[治理设计](README.md)及其规范、skills、角色和目录入口投影，基线 `59139bb`。
验收范围：目录准入与九对局部入口、需求到性质的推导、证明门槛、接受/消费边界、
证据与变更传播、计划的生产及组合责任、五个 skills 和八对角色的同步。

## 已执行的静态检查

环境为本工作树 `uv sync --locked`，Python 3.12.13，锁文件未变。

| 检查 | 实际结果 |
|---|---|
| `make docs-check` | 301 份 Markdown 的链接、需求身份、决定来源、skill 镜像及冻结检查通过 |
| skill-creator 的 `quick_validate.py` | 五个 skills 的双端共十次检查通过 |
| `render_pair.py --source .agents/roles/<角色> --output . --check` | 八对生成一致性通过；先在临时目录生成再同步 |
| TOML/YAML 配置解析比较 | 八对角色的非提示正文字段与 `59139bb` 一致，包括模型、effort 和权限配置 |
| 目录入口检查 | 九个直接子目录均有 AGENTS，CLAUDE 精确为同级 `@AGENTS.md` 引用 |
| `git diff --check` | 通过 |

skill 验证脚本实际路径为
`/data/qiwei/.codex/skills/.system/skill-creator/scripts/quick_validate.py`，SHA-256
为 `ee6dba90f44d37171c5a6edb8095979c54919ff6822c1a907afca2e78c48738c`，
以本工作树 `uv run --locked python` 执行。脚本属于会话环境，复现需取得同一
内容；它不是本仓库新增的工具。检查对象及原始输出暂存本轮任务证据，交付时
绑定最终受审修订。

九份局部 AGENTS 各 21–24 行，根→docs→局部的完整继承链为 180–183 行、
9692–9757 字符。长度仅说明常驻成本，认知效果待独立任务探针核对。

## 尚待完成与局限

当前规范及角色投影尚待最终独立评审和场景推演，本记录不把上述静态结果视为
语义通过。未运行产品构建、插件装卸、形式模型或演绎证明工具；未变更检查器、
生成器代码、产品契约或冻结表。没有实际证明产品性质，未测试原生宿主发现/加载、
Claude 调用、权限强制或长期模型行为。
