# TS harness 图像处理：有限源码研究

本包区分图像传输形状、base64 词法验证、栅格解码、物理缩放和视觉 token 估算。研究原件正式归档；源码事实与采用决定区分，本包不接受任何替换设计。

- 调查日期：2026-09-29；抓取时间和逐文件 SHA256 见 manifest。
- 本项目冻结观察基线：HUB `6fb5138b6503739bf5cbe59cb32a157ff9f19797`；并行修改不读入结论。
- pi：采用来源 `earendil-works/pi` 0.86.1，`3390bd93630965a12a0a1a5c36ce890ec22f7e1d`。
- DSH：`deepseek-ai/deepseek-harness@639ed015397290b3745d163aafe02ffee4aa3f84`，attachment-local 0.2.0-rc.2。
- LangChain TS：main 解析并固定为 `17b6bba8343bdd3f3dfc5c59578e0b72337ec740`，@langchain/openai 1.6.0；不宣称本项目已采用该版本。
- sharp 补充：v0.35.3 → `1018449164723ba0203c1beffaba0e21f7829c18`；DSH 声明范围 ^0.35.3，不等于已核锁文件实际解析版本。
- 消费者：root、base64_validation_fix，以及 image meter 提供者设计/验证负责人。仅参考源码和底层库，不复用 DSH Agent 或完整附件系统。

## 准入核对

每家一个运行代码调用链，附固定 primary URL、函数位置和内容哈希。源码阅读不等于运行上游测试。首批源码研究只执行了一组本机短 base64 反例，未构建或安装依赖；后续收到的独立 sharp 离线探针见下。两批均未发模型请求，未读密钥/环境/账本。4 MiB 栈溢出复现属于并行 agent，不冒称本包运行结果。

| 问题 | 入口 |
|---|---|
| 事实与适用边界 | [research.md](research.md) |
| 具体来源与已执行观察 | [evidence.md](evidence.md) |
| 固定版本、URL、SHA256 | [source-manifest.json](source-manifest.json) |

本包按既定范围归档有限结论；采用由设计链另行决定，不继续泛化调查。


归档复核见 [五项固定 primary 字节复核](source-recheck.json)。采用前仍需实际库语义、同步接口和严格 EOF 接受集合的独立证据；现有 image-size 不因研究即被替换。

后续独立运行证据见 [sharp 0.35.3 八项有限离线观察](native-sharp-probe/README.md)：包括缩放、重编码、alpha、EXIF、动画、像素拒绝和等待 native 作业结束。保留首次失败原件，不把候选运行事实写成采用决定。
