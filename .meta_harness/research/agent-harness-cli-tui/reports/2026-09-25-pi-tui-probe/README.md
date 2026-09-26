# pi-tui 0.86.1 合成终端观察

2026-09-25；消费者为CLI-TUI治理切片的终端适配候选。对象沿2026-09-21原研究的`@earendil-works/pi-tui@0.86.1`，npm官方tarball元数据和完整锁文件在本目录；同时取得当日latest为0.87.1的元数据，不把latest作为本次运行版本。

Node24.21.0 macOS arm64，独立临时npm项目，安装时关闭脚本。`probe.mjs`使用上游Input/TuiMainScreen与合成Terminal，5000个中英字符粘贴、焦点及resize后值不变，硬件光标标记没有直接透到输出；本轮记录render约7.76ms、累计817输出字节。数值是单次合成观测，不是实际终端首帧分布或性能上界。

构造反例：把OSC52序列放进bracketed paste，原Input.render仍含OSC控制字节。断言和原输出在探针中。因此不能从采用Input推出“原始文本输出不会触发终端控制序列”；这条观测不决定本项目怎么实现过滤或输入提示。

上游公开InputOptions只有prompt/placeholder/placeholderStyle，没有秘密输入选项；所读发行包Input还持有编辑撤销与kill-ring状态。本观察不声称所有上游组件均不能实现密码输入，也不把未看到字段当作安全证明。

尚未检查真实PTY、真实IME候选窗、三类终端宿主、Linux、断网清洁安装或整个应用分发。该探针不满足原E1/E3，不构成技术采用或生产准入。上游版本/组件实现变化时重跑。
