# 能力边界

消息流是客户端交付能力：一订阅一 Session，每订阅独立 cursor。事实来自各能力的耐久记录，
投影由读面拥有，授权由对象 owner 逐帧判定；消息流只安装完整事实批次并推进 cursor。通知丢失
通过 projection reconcile 恢复，transient 可丢但必须给 gap，且永不进入 cursor/replay。
