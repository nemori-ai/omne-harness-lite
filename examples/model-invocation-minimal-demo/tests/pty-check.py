from __future__ import annotations
"""Run the real interactive assembly under an OS PTY against controlled local TLS.

No production credential or paid request is used. Run from the repository root:
python3 examples/model-invocation-minimal-demo/tests/pty-check.py
"""

import os
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


def run(data: Path, commands: list[tuple[bytes, bytes]], mode="complete"):
    pid, fd = child(data, mode)
    transcript = bytearray()
    try:
        expect(fd, b"You> ", transcript)
        for command, marker in commands:
            start = len(transcript)
            os.write(fd, command)
            expect(fd, marker, transcript, start)
        _, status = os.waitpid(pid, 0)
        assert os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0, bytes(transcript[-500:])
        return bytes(transcript)
    finally:
        os.close(fd)


def main():
    with tempfile.TemporaryDirectory(prefix="omne-demo-pty-") as tmp:
        data = Path(tmp) / "conversation"
        first = run(data, [
            (b"first prompt\n", b"Saved."),
            (b"second prompt\n", b"Saved."),
            (b"/history\n", b"assistant: first second"),
            (b"/exit\n", b"Closed."),
        ])
        assert b"first second" in first
        second = run(data, [
            (b"/history\n", b"user: second prompt"),
            (b"third prompt\n", b"Saved."),
            (b"/exit\n", b"Closed."),
        ])
        assert b"third prompt" in second
        held = run(Path(tmp) / "held", [(b"held request\n", b"Assistant> first "), (b"\x03", b"Closed.")], "hold")
        assert b"Saved." not in held
        print("PASS: OS PTY two turns, normal close, same-file resume third turn, held TLS Ctrl+C physical close")


if __name__ == "__main__":
    main()
