# DSH agent source baseline

`upstream-baseline.json` is the immutable upstream inventory consumed by the package checker.
It records DeepSeek Harness commit `c291e7961a515f6d7af9304e7fd1d257929aef26` and official
archive SHA-256 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`.

The file moved byte-for-byte from
`docs/proposals/agent-runtime/source-baseline/upstream-baseline.json` so cleanup of legacy design
documents cannot silently disable provenance validation. The executable comparison is
[`check-dsh-sources.py`](../../scripts/check-dsh-sources.py). This evidence describes selected
upstream source bytes; it does not establish OMNE contract adoption or provider conformance.
