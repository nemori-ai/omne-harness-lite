# sharp 0.35.3 有限离线运行观察

2026-09-29；原执行者为本项目 image-preparation 工作流。本包归档其原件并逐项复核 SHA256；归档者没有把接收原结果表述为自己重新执行。环境和完整 native 版本在 [result.json](result.json)，依赖固定于 [package-lock.json](package-lock.json)，可复跑脚本为 [probe.mjs](probe.mjs)。在隔离目录执行 `npm ci` 后 `node probe.mjs`；脚本只生成合成图像并操作本机 codec，无模型 HTTP。

r2 八项本机观察通过：

- 5,890,980 字节 PNG 物理缩放／重编码为 1200×1200、826,780 字节 JPEG；说明本例超限原图可以形成较小派生图，不代表任意图片都能满足任意字节预算。
- 本机同输入、相同 codec 参数得到相同编码字节；不推断跨版本／平台确定性。
- PNG alpha 128 保留；EXIF orientation 6 的 40×20 图片自动旋转为 20×40，并去掉 orientation 标记。
- 实际两色 GIF 的 metadata.pages 为 2；未因此证明所有格式、截断或多帧格式接受集合。
- 明确 pixel limit 和截断后的实际像素 decode 均拒绝对应样本。
- abort 发出时 native process 计数仍为 1；等待约 5.23 秒后队列和 process 都为 0，再结束本次任务。AbortController 自身不强制终止 sharp。本例验证等待本次 native 作业结束后的排空，不提供即时取消或全局并发作业排空保证。

原 r1 使用同色重复帧，编码器合并后动画断言失败；[r1-result.json](r1-result.json) 与原脚本／日志保留。r2 改用两色帧验证实际 pages=2，没有通过放松 pages 断言掩盖失败。

本观察没有运行本产品的转换链、Cordis 生命周期、HTTPS 发送，也未覆盖全格式、严格 EOF、恶意图像安全或生产资源隔离。结果支持继续评估共享图像预处理候选；它不是依赖采用、产品尺寸默认值或契约变更决定。原件哈希见 [MANIFEST.json](MANIFEST.json)。
