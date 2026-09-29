# OpenAI closeout 固定实现证据

2026-09-29，源码/研究基线 e66ddc9d。无模型HTTP、凭据、账本读取。

- source-manifest.json 固定16个源文件及许可。pi/DSH来自主检出已有归档解包；pi实际fork基线为0.86.1@3390bd9。OpenRouter AI SDK Provider从公开仓库只读clone，固定1b22b053。omne-next所列文件在6263fed工作区无局部修改。
- sources/ 保留本轮实际读取版本，附各源许可。omne_harness token估计文件仅本地阅读，尚未核其独立许可，不是可复制采用声明。
- probe.mjs：Node24自带stripTypeScriptTypes执行pi estimate、Chat reasoning纯helper、DSH estimate及OpenRouter SDK usage纯函数。切片受源SHA校验，不启动任何SDK客户端。
- omne-probe.py：Python3.12 AST仅抽取三项reasoning helper。合成反例不声称上游真实会产生该输入。
- probe-result.json／omne-probe-result.json：9+3项实际通过，不是模型认证或完整SDK测试。
- openai-reasoning-tool.json／openrouter-reasoning-tool.json：滚动第一方文档的工具抽取载荷，非原站HTTP字节。OR markdown原始获取尝试返回403；浏览工具成功。

在本目录运行：

```sh
node --disable-warning=ExperimentalWarning probe.mjs
python3.12 omne-probe.py
```

环境实际Node v24.18.0、Python3.12.13。首次裸python不可用；首次系统python3是3.8，不能解析源文件PEP695语法，失败后改用独立3.12.13解释器；没有通过修改上游源码消除错误。Python仅用stdlib，不借别树venv或产品依赖。Node探针没有依赖安装。

可支持：具体上游纯函数行为、复用的边界和反例。不可支持：真实OR内部渲染、精确tokenizer、Pro上下文scope、opaque O→I准确率、生产full/φ/δ、public/service、缓存命中、工具执行或模型认证。
