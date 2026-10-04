# Check the draft topic's links and anchors with the repo's own doc_support parser and slug,
# resolving each link as if the topic already lived at .meta_harness/research/fixed-schema-compile-cost/.
import sys
from pathlib import Path
from urllib.parse import urlsplit, unquote

REPO = Path('/data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation')
sys.path.insert(0, str(REPO / 'tools/spec-tools/src'))
from omne_harness_lite_spec_tools.doc_support import headings, markdown_links  # noqa: E402

DRAFT_ROOT = Path('/tmp/claude-1001/-data-qiwei-repos-omne-harness-lite/0d12f3b6-aa72-4661-a80c-d0422eb23a91/scratchpad/draft-65')
TOPIC_REL = Path('.meta_harness/research/fixed-schema-compile-cost')
draft_topic = DRAFT_ROOT / TOPIC_REL

bad = 0
count = 0
for md in sorted(draft_topic.rglob('*.md')):
    rel_in_topic = md.relative_to(draft_topic)
    virtual = (REPO / TOPIC_REL / rel_in_topic)
    for href in markdown_links(md):
        parts = urlsplit(href)
        if parts.scheme or parts.netloc:
            continue
        count += 1
        raw = unquote(parts.path)
        if raw.startswith('/'):
            print(f'ABSOLUTE {md.name}: {href}'); bad += 1; continue
        target_virtual = (virtual.parent / raw).resolve() if raw else virtual.resolve()
        try:
            inside = target_virtual.relative_to((REPO / TOPIC_REL).resolve())
            target = draft_topic / inside
        except ValueError:
            target = target_virtual
        if not target.resolve().is_relative_to(REPO.resolve()) and not target.resolve().is_relative_to(DRAFT_ROOT.resolve()):
            print(f'ESCAPES {md.name}: {href}'); bad += 1; continue
        if not target.exists():
            print(f'BROKEN {md.name}: {href} -> {target}'); bad += 1; continue
        frag = unquote(parts.fragment)
        if frag and target.suffix == '.md' and frag not in headings(target):
            print(f'ANCHOR {md.name}: {href}'); bad += 1
print(f'checked {count} local links, {bad} problems')
