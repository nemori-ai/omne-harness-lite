# ASD-STE100：本地维护入口

本 skill 提供全工作区文档写作与修订的表达规范，供 agent、工具调用者和读者理解。
英文采用简明技术英语规则，中文采用可跨语言的清晰性原则；独立改写功能不用于创意或营销文案。

## 来源与完整性

完整引入 [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill)
的 `0.4.0`，固定上游提交
[`7d4a135a199a5d7447c4886bcd7ffe742a627bc9`](https://github.com/danyuchn/asd-ste100-skill/tree/7d4a135a199a5d7447c4886bcd7ffe742a627bc9)。
上游全部 7 个受 Git 管理的文件均进入 `canonical/`，包括 README、许可、规则说明、示例和检查器。
这是本仓库维护的源码副本；Git 历史由上游提交定位，不引入嵌套仓库或 submodule。

本地 `SKILL.md` 将上游 `version` 放入 `metadata.version`，以满足宿主校验；
写作要求与适用范围由本地参考页维护。更新时对照上游修订和当前本地差异，
不维护引入事件、逐文件迁移哈希或历史验证账本。

上游采用 [MIT 许可](canonical/LICENSE)，保留原版权与许可全文。
`canonical/README.md` 是保留的上游说明；本仓库的维护、生成与验证入口以本页为准。
这里不使用上游 README 的 `npx skills update` 更新本地源。

## 能力与边界

- **Strict**：用于程序步骤、工具描述、错误消息和 agent 指令，执行句长与结构规则。
- **STE-flavored**：用于 README、PR 描述和说明文，保持结构纪律，词汇规则作为建议。
- 改写保留事实、条件、范围、数字和语气强度；不能把 “may have failed” 改成确定失败。
- 默认只返回改写结果；请求解释时提供原文、改写与对应规则的表格。

规则基于 ASD-STE100 Issue 9 的类别摘要，不包含 ASD 的官方受控词典，也不承诺正式 STE 合规。
确定性检查器只检测部分结构模式；零违规不能证明语义保真。
它采用 25 词句长上限，无法自动区分指令所需的 20 词上限；名词簇和一条一句等要求仍需人工或模型判断。
被动语态、复合时态只产生 advisory；数字、条件和语气强度需要对照原文复核。

## 本仓库的写作要求

负责人要求所有后续文档写作遵循本 skill。
适用范围、中英文规则与其他写作方法的组合方式统一归
[文档写作的采用范围](canonical/references/documentation.md)，随 skill 一起分发。
本地演进增加了这份参考文、入口触发与组合说明；上游原写作规则、示例及检查器继续保留。

## 源与宿主产物

```text
asd-ste100/
├── README.md                  本地维护入口，不分发
├── canonical/                 唯一运行源
│   ├── SKILL.md
│   ├── README.md              上游原说明
│   ├── LICENSE
│   ├── references/writing-rules.md
│   ├── references/documentation.md   本地文档写作要求
│   ├── examples/before-after.md
│   ├── examples/linter-edge-cases.md
│   └── scripts/ste-lint.py
└── adapters/
    ├── codex/strategy.yaml
    └── claude-code/strategy.yaml
```

两端均采用显式 `copy` 策略，生成内容一致。按
[编译工具](../../../tooling/README.md#agent-编译)生成到 `.meta_harness/`；
根目录的既有软链接暴露 `.agents/skills/asd-ste100/` 与 `.claude/skills/asd-ste100/`。
只修改 `canonical/` 和必要的适配，不手改宿主生成物。

可显式调用 `$asd-ste100`，例如：

```text
Use $asd-ste100 to rewrite this tool description. Preserve every condition and modal verb. Show the before/after table.
```

自动发现保持默认策略。生成与静态检查成功不代表当前宿主会话已经加载新增 skill。

## 修改与验证

下列命令从执行仓库根运行。检查器只依赖 Python 标准库。

```sh
python3 .meta_harness/agents/skills/asd-ste100/canonical/scripts/ste-lint.py --selftest
python3 .meta_harness/agents/skills/asd-ste100/canonical/scripts/ste-lint.py --json path/to/text.md
make agents-check
make docs-check
```

`--selftest` 运行上游内置回归，包括语气保留、Markdown 列表与表格单元格。
`--json` 输出结构化发现；hard 违规超过 `--baseline`（默认 0）时退出 1，advisory 不使运行失败。
`--disable` 可关闭指定规则，报告时保留实际配置，不把关闭规则后的零违规当成完整检查。
`examples/linter-edge-cases.md` 是故意不合规的夹具，应报告两条 `dangling-conjunction` 并退出 1。

新增或修改 skill 时继续使用官方 `skill-creator` 的 `quick_validate.py`，
按其实际安装路径校验 canonical 和两端生成入口。
修改源后先生成到暂存目录比较；编译器拒绝覆盖不同内容的旧产物，更新步骤归编译工具说明。

后续上游变化作为可选输入：对照固定提交与本地源码评估差异，保留许可，运行自测、
相关复现、skill 校验与生成检查，再记录采用的新上游修订及本地差异。
本地改写规则的行为验证应对照原文检查语义；检查器的正则检测结果不能替代该判断。
