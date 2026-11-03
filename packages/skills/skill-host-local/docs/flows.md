# 关键流程

本文件写本包的两个流程。行为条款归 [SPEC.md](../SPEC.md)，失败映射归 [README「Behavior」](../README.md#behavior)。

## 取快照

```text
调用方 ──snapshot({kind:'directory', root})──▶ directory-source
  directory-source ──collect(fs, root)──▶ walk
    walk ──realpath(root)──▶ DirectoryFs          失败：ROOT 表
    walk：根名为空 ─────────────────────────────▶ package-not-found
    walk ──readdir(根)──▶ DirectoryFs             失败：ROOT 表
    对每个名字（码元序）：
      链接   ──realpath──▶ 根内判定 ──lstat──▶ 文件：readFile；目录：下降
      目录   ──（不在祖先中）readdir──▶ 下降
      文件   ──isPackagePath──▶ readFile         失败：READ 表
      其他   ─────────────────────────────────────▶ entry-unreadable
    第一个失败结束遍历
  directory-source ──sealSnapshot(rootName, files)──▶ 快照或缺陷映射
调用方 ◀── 快照，或一种来源失败
```

前提：遍历期间目录不变。目录被并发修改时，快照可能混合新旧内容，见 [SPEC「所有权、失败与生命周期」](../SPEC.md#所有权失败与生命周期)。

## 读条目

```text
调用方 ──open({kind:'directory', root}, digest, path)──▶ directory-source
  directory-source ──readEntry(fs, root, path)──▶ walk
    walk ──realpath(root)──▶ 根                  失败：ROOT 表
    walk ──realpath(根/path)──▶ 目标              失败：OPEN 表
    目标不在根内 ─────────────────────────────────▶ outside-package
    walk ──readFile(目标)──▶ 字节                 失败：OPEN 表
调用方 ◀── 此刻的字节，或一种来源失败
```

`open` 不使用 `digest`，也不比较字节与快照。调用方 `@omne-harness/skill` 按条目内容摘要核对字节，不符时报 `version-changed`，见[组工程设计「读取」](../../docs/architecture.md#读取)。
