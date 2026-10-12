# 开发工具的归属

这里维护帮助研发检查和维护仓库的工具。工具索引见 [README](README.md)，
依赖与源码位置归[workspace 规范](../docs/workspace.md)。

工具的可测试逻辑、格式资源与依赖随包维护；根开发环境引用成员，产品包不因此
依赖工具。跨目录自动化归 [scripts/](../scripts/README.md)，skill 的自带脚本随技能维护。

检查器执行 [docs/](../docs/README.md) 与 [spec/](../.meta_harness/design/architecture/README.md) 所拥有的规则；
发现实现与规则冲突时核对所属版本，不通过改检查器静默放宽要求。包内检查器格式
与被检查的业务契约有不同归属，工具修复不自动构成业务契约发布。

普通工具修改按[验证规范](../docs/verification.md)选择相关检查；
只有涉及新的产品保证或架构取舍时才展开架构设计材料。

实际架构抽取独立于意图声明，来源、未知、版本与范围必须可核对；不把结构图称作行为证明。
系统规则与采用范围从[架构入口](../docs/architecture/README.md)读取；尚未承接的技术专题从[保留源入口](../.meta_harness/design/architecture/README.md)定位。
