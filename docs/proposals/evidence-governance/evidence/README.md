# 固定评审与静态测量原件

[归档](review-and-checks.tar.gz)及[清单](manifest.json)保留判断所需的 11 份原件，
共 54,765 bytes。它们分别支持[评审处置](../review.md)与
[验证范围](../verification.md)，不是新增治理或产品接受记录。

`reviewed-snapshot.json` 的 73 份 tracked 输入逐项对应
`424fb79e8e9d289928c945d36177b047c0d6dde1`；有限修订对象是 `732856c`。
四份 review 原件保留具体独立意见，task-probes 保留 14 个实际阅读推演，
static/projection/final 结果、原测量脚本及 entry-chains 保留声明的检查与长度依据。
原文内的工作树路径、命令和临时计划哈希是历史测量值，不是当前读取入口。

原临时计划的 SHA-256 为
`8060959d8a6ad4762b82b4161e13ae3734a5a1fbfb1f2099e702862a0a29696c`；
它只标识当时 plan-reviewer 的对象，具体排期和生成预览没有长期准入价值。
本归档不含计划全文，不能据此宣称其排期已重新审阅。`check_projections.py`
末尾还会读取并写入原临时计划的 snapshot，因此本归档不是该脚本完整运行环境；
tracked 输入身份、配置比较逻辑及原输出可单独复核。环境级 skill 验证器也不在
归档中，只保留原路径、哈希与结果，未宣称后来能原样重跑环境或模型行为。
