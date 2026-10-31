"""save_handback.py 从子代理记录里取出交回的报告。

夹具是从真实 Claude Code 子代理记录（subagents/agent-<id>.jsonl）裁出的最小形状：
一条 API 消息按内容块拆成多条 assistant 记录，共用 message.id；结尾是 end_turn 的文本。
真实记录里没有 SubagentHandback 调用，那一支的形状取自 roleeval/claude_host.py 已读的 `input.message`。
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import save_handback  # noqa: E402

SCRIPT = Path(save_handback.__file__)


def block_record(message_id, block, stop_reason, **extra):
    return {"type": "assistant", "isSidechain": True,
            "message": {"id": message_id, "role": "assistant", "stop_reason": stop_reason, "content": [block]},
            **extra}


def text(message_id, body, stop_reason="end_turn", **extra):
    return block_record(message_id, {"type": "text", "text": body}, stop_reason, **extra)


def tool_use(message_id, name, payload, stop_reason="tool_use"):
    return block_record(message_id, {"type": "tool_use", "id": f"toolu_{message_id}", "name": name,
                                     "input": payload}, stop_reason)


def noise():
    """Records of other kinds that sit between assistant records in a real transcript."""
    return [{"type": "user", "message": {"role": "user", "content": "go"}},
            {"type": "api-request", "agentId": "a1"}, {"type": "attachment"}]


def write_transcript(path, records, tail=""):
    path.write_text("\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n" + tail,
                    encoding="utf-8")
    return path


def run(transcript, out):
    return save_handback.main(["--transcript", str(transcript), "--out", str(out)])


def test_closing_message_is_saved_from_every_block_of_the_last_api_message(tmp_path):
    transcript = write_transcript(tmp_path / "agent-a1.jsonl", [
        *noise(),
        text("msg_1", "earlier turn that is not the report", stop_reason="tool_use"),
        block_record("msg_2", {"type": "thinking", "thinking": "", "signature": "x"}, "end_turn"),
        text("msg_2", "## 结论\n\n第一段。"),
        text("msg_2", "\n\n第二段。"),
    ])
    out = tmp_path / "reports/review.md"
    assert run(transcript, out) == 0
    assert out.read_text(encoding="utf-8") == "## 结论\n\n第一段。\n\n第二段。\n"


def test_last_handback_call_wins_over_earlier_calls_and_the_closing_text(tmp_path):
    transcript = write_transcript(tmp_path / "agent-a2.jsonl", [
        tool_use("msg_1", save_handback.HANDBACK, {"message": "first draft"}),
        tool_use("msg_2", "Read", {"file_path": "x"}),
        tool_use("msg_3", save_handback.HANDBACK, {"message": "final report\n"}),
        text("msg_4", "wrapper text, not the report"),
    ])
    out = tmp_path / "review.md"
    assert run(transcript, out) == 0
    assert out.read_text(encoding="utf-8") == "final report\n"


@pytest.mark.parametrize("records", [
    pytest.param([*noise()], id="no-assistant-message"),
    pytest.param([text("msg_1", "partial work", stop_reason="tool_use"),
                  tool_use("msg_2", "Bash", {"command": "ls"})], id="interrupted-on-a-tool-call"),
    pytest.param([text("msg_1", "API Error: Request rejected (429)", stop_reason="stop_sequence",
                       isApiErrorMessage=True)], id="host-error-message"),
    pytest.param([text("msg_1", "cut off mid-sentence", stop_reason="max_tokens")], id="turn-did-not-end"),
    pytest.param([text("msg_1", "  \n")], id="blank-closing-text"),
    pytest.param([tool_use("msg_1", save_handback.HANDBACK, {"message": ""})], id="empty-handback"),
    pytest.param([tool_use("msg_1", save_handback.HANDBACK, {"report": "wrong field"})], id="handback-without-message"),
])
def test_transcript_without_a_report_exits_non_zero_and_writes_nothing(tmp_path, capsys, records):
    transcript = write_transcript(tmp_path / "agent-a3.jsonl", records)
    out = tmp_path / "review.md"
    assert run(transcript, out) == save_handback.EXIT_NOT_FOUND
    assert not out.exists()
    assert "no handed-back report" in capsys.readouterr().err


def test_failed_run_leaves_an_existing_report_untouched(tmp_path):
    out = tmp_path / "review.md"
    out.write_text("kept\n", encoding="utf-8")
    transcript = write_transcript(tmp_path / "agent-a4.jsonl", [tool_use("msg_1", "Bash", {})])
    assert run(transcript, out) == save_handback.EXIT_NOT_FOUND
    assert out.read_text(encoding="utf-8") == "kept\n"
    assert [path.name for path in tmp_path.iterdir() if path.name.endswith(".tmp")] == []


def test_a_partial_last_line_of_a_live_transcript_does_not_hide_the_report(tmp_path, capsys):
    transcript = write_transcript(tmp_path / "agent-a5.jsonl", [text("msg_1", "report")], tail='{"type": "assis')
    out = tmp_path / "review.md"
    assert run(transcript, out) == 0
    assert out.read_text(encoding="utf-8") == "report\n"
    assert "ignored line 2" in capsys.readouterr().err


@pytest.mark.parametrize("separator", ["\u2028", "\u2029", "\u0085"])
def test_a_line_separator_inside_a_record_keeps_the_record_whole(tmp_path, separator):
    # Kept raw by ensure_ascii=False, as a host may write it; str.splitlines would split the record there.
    transcript = write_transcript(tmp_path / "agent-a7.jsonl", [
        text("msg_1", "## 摘要\n\n第一段。"),
        text("msg_1", f"\n\n第二段{separator}同一段。"),
    ])
    out = tmp_path / "review.md"
    assert run(transcript, out) == 0
    assert out.read_text(encoding="utf-8") == f"## 摘要\n\n第一段。\n\n第二段{separator}同一段。\n"


@pytest.mark.parametrize(("bad", "said"), [
    pytest.param('{"type": "assistant", "message": {', "line 2 is not valid JSON", id="broken-record"),
    pytest.param('["not", "an", "object"]', "line 2 is not a JSON object", id="not-an-object"),
])
def test_an_unreadable_line_before_the_last_stops_the_script(tmp_path, capsys, bad, said):
    path = tmp_path / "agent-a8.jsonl"
    lines = [json.dumps(text("msg_1", "first half"), ensure_ascii=False), bad,
             json.dumps(text("msg_1", "second half"), ensure_ascii=False)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out = tmp_path / "review.md"
    assert run(path, out) == save_handback.EXIT_UNUSABLE
    assert said in capsys.readouterr().err
    assert not out.exists()


def test_a_closing_message_that_a_later_prompt_follows_is_not_this_turns_report(tmp_path, capsys):
    out = tmp_path / "review.md"
    out.write_text("kept\n", encoding="utf-8")
    transcript = write_transcript(tmp_path / "agent-a9.jsonl", [
        text("msg_1", "report of the first turn"),
        {"type": "user", "message": {"role": "user", "content": "now check the second file"}},
    ])
    assert run(transcript, out) == save_handback.EXIT_NOT_FOUND
    assert "no report of this turn" in capsys.readouterr().err
    assert out.read_text(encoding="utf-8") == "kept\n"


def tool_result(message_id):
    return {"type": "user", "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": f"toolu_{message_id}", "content": "ok"}]}}


def test_a_handback_call_of_an_earlier_turn_is_not_this_turns_report(tmp_path):
    first_turn = [tool_use("msg_1", save_handback.HANDBACK, {"message": "first turn"}), tool_result("msg_1")]
    prompt = {"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": "again"}]}}

    transcript = write_transcript(tmp_path / "agent-a10.jsonl", [*first_turn, prompt, text("msg_2", "second turn")])
    out = tmp_path / "review.md"
    assert run(transcript, out) == 0
    assert out.read_text(encoding="utf-8") == "second turn\n"

    transcript = write_transcript(tmp_path / "agent-a11.jsonl", [*first_turn, prompt])
    assert run(transcript, tmp_path / "none.md") == save_handback.EXIT_NOT_FOUND
    assert not (tmp_path / "none.md").exists()

    # Its own tool result and a record the host adds do not start a turn.
    meta = {"type": "user", "isMeta": True, "message": {"role": "user", "content": "skill text"}}
    transcript = write_transcript(tmp_path / "agent-a12.jsonl", [*first_turn, meta])
    assert run(transcript, out) == 0
    assert out.read_text(encoding="utf-8") == "first turn\n"


def test_unreadable_transcript_is_a_distinct_failure(tmp_path, capsys):
    assert run(tmp_path / "missing.jsonl", tmp_path / "review.md") == save_handback.EXIT_UNUSABLE
    assert "cannot read transcript" in capsys.readouterr().err
    assert not (tmp_path / "review.md").exists()


def test_script_runs_as_a_command(tmp_path):
    transcript = write_transcript(tmp_path / "agent-a6.jsonl", [text("msg_1", "命令行报告")])
    out = tmp_path / "review.md"
    result = subprocess.run([sys.executable, str(SCRIPT), "--transcript", str(transcript), "--out", str(out)],
                            capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, result.stderr
    assert out.read_bytes() == "命令行报告\n".encode()
