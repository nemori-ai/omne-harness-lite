from __future__ import annotations
"""Run the real interactive assembly under an OS PTY against controlled local TLS.

No production credential or paid request is used. Run from the repository root:
python3 examples/model-invocation-minimal-demo/tests/pty-check.py
"""

import os
import json
import pty
import select
import shutil
import tempfile
import time
from pathlib import Path


FIXTURE = Path(__file__).parent / "fixtures" / "controlled-cli.mjs"


def child(data: Path, mode: str):
    pid, fd = pty.fork()
    if pid == 0:
        node = shutil.which("node")
        assert node is not None
        os.execv(node, ["node", "--experimental-strip-types", str(FIXTURE), str(data), mode])
    return pid, fd


def expect(fd: int, marker: bytes, transcript: bytearray, start: int = 0, timeout: float = 30):
    deadline = time.monotonic() + timeout
    while marker not in transcript[start:]:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise AssertionError(f"timed out waiting for {marker!r}; tail={bytes(transcript[-500:])!r}")
        readable, _, _ = select.select([fd], [], [], remaining)
        if readable:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                chunk = b""
            if not chunk:
                raise AssertionError(f"PTY closed before {marker!r}; tail={bytes(transcript[-500:])!r}")
            transcript.extend(chunk)


def run(data: Path, commands: list[tuple[bytes, bytes]], mode="complete", expected_exit=0):
    pid, fd = child(data, mode)
    transcript = bytearray()
    try:
        expect(fd, b"You> ", transcript)
        for command, marker in commands:
            start = len(transcript)
            os.write(fd, command)
            expect(fd, marker, transcript, start)
        _, status = os.waitpid(pid, 0)
        assert os.WIFEXITED(status) and os.WEXITSTATUS(status) == expected_exit, bytes(transcript[-500:])
        model_record = json.loads((data.parent / f"pty-models-{pid}.json").read_text())
        assert model_record["rawAfter"] is False
        return bytes(transcript), model_record["models"]
    finally:
        os.close(fd)


def main():
    with tempfile.TemporaryDirectory(prefix="omne-demo-pty-") as tmp:
        data = Path(tmp) / "conversation"
        first, first_models = run(data, [
            (b"/help\n", b"/model <identifier>"),
            (b"/models\n", b"deepseek/deepseek-v4.1-flash"),
            (b"first prompt\n", b"Saved."),
            (b"/model deepseek/deepseek-v4.1-flash\n", b"Effective: deepseek/deepseek-v4.1-flash"),
            (b"second prompt\n", b"Saved."),
            (b"/history\n", b"assistant: first second"),
            (b"/exit\n", b"Closed."),
        ])
        assert b"first second" in first
        assert first_models == ["deepseek/deepseek-v4-pro-0813", "deepseek/deepseek-v4.1-flash"]
        second, second_models = run(data, [
            (b"/model\n", b"Effective: deepseek/deepseek-v4.1-flash"),
            (b"/history\n", b"user: second prompt"),
            (b"third prompt\n", b"Saved."),
            (b"/exit\n", b"Closed."),
        ])
        assert b"third prompt" in second
        assert second_models == ["deepseek/deepseek-v4.1-flash"]
        held, held_models = run(Path(tmp) / "held", [(b"held request\n", b"Assistant> first "), (b"\x03", b"Closed.")], "hold")
        assert b"Saved." not in held
        assert held_models == ["deepseek/deepseek-v4-pro-0813"]
        failed, failed_models = run(Path(tmp) / "failed", [(b"fail request\n", b"Closed after model failure.")], "http503", 1)
        assert failed_models == ["deepseek/deepseek-v4-pro-0813"]
        assert b"Model request failed; durable response recorded." in failed
        assert b"controlled failure" not in failed and b"private-controlled-pty-key" not in failed
        print("PASS: OS PTY model selection and persisted restart, actual request model, raw mode restored, held TLS Ctrl+C, HTTP 503 safe exit")


if __name__ == "__main__":
    main()
