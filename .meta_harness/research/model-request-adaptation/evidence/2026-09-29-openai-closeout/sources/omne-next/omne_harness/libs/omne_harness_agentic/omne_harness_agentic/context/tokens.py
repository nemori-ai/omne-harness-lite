"""The harness's one pre-flight token estimate, routed to a tokenizer by model vendor.

Anything that must know "does this context still fit" — a session weighing a switch to a
narrower window, a run weighing its tool definitions — asks here and nowhere else. The
alternative is what this module exists to prevent: each caller reaching for whatever
tokenizer is already on its import path, and two parts of the harness disagreeing about
the size of one conversation (ADR-138 D-1/D-2).

**Why every vendor is counted with OpenAI's tokenizer in this first release.** OpenRouter
publishes no pre-flight counting endpoint, and the token counts it *does* return are the
provider's own native ones, carried on the response `usage` — after the request was sent,
which is exactly too late for a capacity decision. Each vendor's real tokenizer is
reachable only through a dependency this project is not willing to take for one estimate
today (Anthropic's counting endpoint is one vendor's and does not travel over OpenRouter;
HF `tokenizers` drags model artefacts; `litellm` drags `litellm`). So the routing table
below is real and the counters behind it are, for now, all the same one. Wiring each
vendor to its own tokenizer is an accepted follow-on obligation, not a possibility left
open: see ADR-138 D-4.

**How a vendor is wired in when its turn comes.** Three steps and no fourth: implement a
[TokenCounter][omne_harness_agentic.context.tokens.TokenCounter] over that vendor's
tokenizer, replace that vendor's row in
[VENDOR_TOKEN_COUNTERS][omne_harness_agentic.context.tokens.VENDOR_TOKEN_COUNTERS] with a
factory for it, and add a comparison test for that vendor against a reference count.
Nothing outside this module changes, because
[route_token_counter][omne_harness_agentic.context.tokens.route_token_counter] is the only
place a model name is turned into a counter. The routing key is the vendor prefix of the
OpenRouter routing name (`openai/`, `anthropic/`, …) — the smallest key that distinguishes
tokenizers, and one this project already has, unlike a window size it refuses to guess from
a model name.

**What `exact=False` means.** Every estimate this module produces is an approximation and
says so on its face. It counts message *content* with a tokenizer that is the right one for
one vendor and an approximation for the rest, and it does not model per-message framing
overhead, the system prompt scaffolding a provider adds, or a tool schema's own encoding.
A consumer must therefore carry headroom rather than compare an estimate to a window edge;
ADR-137 D-4 owns how much. The day a vendor's own tokenizer answers, that counter may
report `exact=True` for its own models — which is why the flag is per-estimate rather than
a module-level constant.

**How the estimate is graded after the fact.** `AIMessage.usage_metadata.input_tokens` on
the response carries the provider's native count of the very request that was sent — the
`omne_openrouter` fork already fills it from the response `usage`. Comparing an estimate to
that number over real traffic is what tells whether a vendor's approximation has drifted far
enough to be worth its own tokenizer, and it is the reference a per-vendor comparison test
should be written against.

**Where the two flat budgets come from.** A non-text block carries nothing that reveals its
real cost — no dimensions, no duration, no rendered detail level — so it is charged a fixed,
deliberately generous budget rather than a guess dressed as a measurement.
`IMAGE_BLOCK_TOKEN_BUDGET` sits between the two published figures for one full-size image:
OpenAI charges roughly 765–1105 tokens for a high-detail image, Anthropic roughly 1600 for
one megapixel; 1200 is between them and on the safe side of the smaller.
`ATTACHMENT_REFERENCE_TOKEN_BUDGET` covers a document the model is handed a *reference* to
rather than the document itself. Over-counting costs a caller some headroom;
under-counting costs it a request the provider refuses, so both constants round upward.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from typing import TYPE_CHECKING, Any, Final, Protocol, runtime_checkable

import tiktoken

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

__all__ = [
    "ATTACHMENT_REFERENCE_TOKEN_BUDGET",
    "DEFAULT_TOKEN_COUNTER",
    "IMAGE_BLOCK_TOKEN_BUDGET",
    "VENDOR_TOKEN_COUNTERS",
    "TiktokenCounter",
    "TokenCounter",
    "TokenEstimate",
    "estimate_content_block_tokens",
    "estimate_text_tokens",
    "route_token_counter",
]

#: What one full-size image block is charged. Between OpenAI's ~765–1105 high-detail figure
#: and Anthropic's ~1600 for a megapixel, rounded toward the safe side (ADR-138 D-3).
IMAGE_BLOCK_TOKEN_BUDGET: Final[int] = 1200

#: What a block the model is handed a *reference* to — rather than the bytes — is charged.
ATTACHMENT_REFERENCE_TOKEN_BUDGET: Final[int] = 200

#: Block types charged the flat image budget: perceptual media whose real cost is not
#: derivable from the block. Audio and video join `image` because under-counting them would
#: be the expensive mistake, and neither carries its duration here.
_IMAGE_BUDGET_BLOCK_TYPES: Final[frozenset[str]] = frozenset({"image", "audio", "video"})

#: Block types charged the flat attachment-reference budget.
_ATTACHMENT_BUDGET_BLOCK_TYPES: Final[frozenset[str]] = frozenset({"file"})


@runtime_checkable
class TokenCounter(Protocol):
    """One tokenizer's answer to "how many tokens is this text", and its name.

    Narrow on purpose: a counter answers about text and nothing else. Content-block
    accounting is this module's business rather than each vendor implementation's, so a
    vendor being wired in cannot quietly change what an image block costs.

    Attributes:
        counter_id: Which tokenizer answered, e.g. ``"tiktoken:o200k_base"``. It travels on
            every estimate so a later calibration can tell which counter produced the number
            it is grading — the load-bearing fact while one tokenizer answers for all vendors.
    """

    counter_id: str

    def count_text(self, text: str) -> int:
        """Count the tokens in ``text``.

        Args:
            text: The text to count. An empty string counts zero.

        Returns:
            The token count, never negative.
        """
        ...


@dataclass(frozen=True, slots=True)
class TokenEstimate:
    """A token count together with who produced it and whether it is exact.

    Attributes:
        tokens: The estimated token count.
        counter_id: The [TokenCounter][omne_harness_agentic.context.tokens.TokenCounter]
            that answered.
        exact: Whether the count is the provider's own arithmetic. Always ``False`` in this
            release — see the module docstring — and a consumer must treat it as a floor to
            add headroom to rather than a boundary to compare against.
    """

    tokens: int
    counter_id: str
    exact: bool


@cache
def _encoding(name: str) -> tiktoken.Encoding:
    """Load one tiktoken encoding, once per process.

    An encoding is a multi-megabyte table that tiktoken fetches on first use and caches on
    disk (``TIKTOKEN_CACHE_DIR`` relocates that cache for an offline install). Loading it
    per counter instance would pay that cost again for every route.

    Args:
        name: The tiktoken encoding name.

    Returns:
        The loaded encoding, shared by every counter that asked for this name.
    """
    return tiktoken.get_encoding(name)


class TiktokenCounter:
    """Counts with an OpenAI BPE encoding — this release's counter for every vendor."""

    __slots__ = ("_encoding_table", "counter_id")

    def __init__(self, encoding: str = "o200k_base") -> None:
        """Bind one encoding and the identity estimates will carry it under.

        Args:
            encoding: The tiktoken encoding name. ``o200k_base`` is the current OpenAI
                frontier encoding and the default every vendor route resolves to today.
        """
        self.counter_id = f"tiktoken:{encoding}"
        self._encoding_table = _encoding(encoding)

    def count_text(self, text: str) -> int:
        """Count ``text`` with this encoding.

        Special-token markers such as ``<|endoftext|>`` are encoded as ordinary text rather
        than raising: this counter is handed conversation content a person may have typed,
        and an estimate that raises on a string a user wrote would turn a capacity check into
        an outage.

        Args:
            text: The text to count.

        Returns:
            The token count.
        """
        return len(self._encoding_table.encode(text, disallowed_special=()))


@cache
def _tiktoken_counter(encoding: str) -> TiktokenCounter:
    """Return the one shared counter for an encoding name.

    Args:
        encoding: The tiktoken encoding name.

    Returns:
        The process-wide counter for that encoding.
    """
    return TiktokenCounter(encoding)


def _o200k_counter() -> TokenCounter:
    """Return this release's counter — the placeholder every vendor row currently holds.

    Returns:
        The shared ``o200k_base`` counter.
    """
    return _tiktoken_counter("o200k_base")


#: Vendor prefix of an OpenRouter routing name -> the factory for that vendor's counter.
#: Every row is deliberately the same factory today; the table is what makes replacing one
#: vendor a one-line change instead of a search for tokenizer calls (ADR-138 D-1/D-4).
VENDOR_TOKEN_COUNTERS: Final[dict[str, Callable[[], TokenCounter]]] = {
    "openai/": _o200k_counter,
    "anthropic/": _o200k_counter,
    "google/": _o200k_counter,
    "meta-llama/": _o200k_counter,
    "deepseek/": _o200k_counter,
    "mistralai/": _o200k_counter,
    "qwen/": _o200k_counter,
    "x-ai/": _o200k_counter,
}

#: The counter for a routing name no row matches. A vendor nobody has entered is estimated,
#: not refused: a capacity check that raised on an unlisted vendor would block a switch no
#: governance seam ever decided against.
DEFAULT_TOKEN_COUNTER: Final[Callable[[], TokenCounter]] = _o200k_counter


def route_token_counter(model_id: str) -> TokenCounter:
    """Pick the counter for a model's vendor — the single routing point of this module.

    Args:
        model_id: The provider routing name, e.g. ``"anthropic/claude-x"``. Surrounding
            whitespace and letter case do not change the route; a name carrying no vendor
            prefix at all takes the default.

    Returns:
        The counter registered for that vendor, or
        [DEFAULT_TOKEN_COUNTER][omne_harness_agentic.context.tokens.DEFAULT_TOKEN_COUNTER]'s
        counter when the vendor has no row.
    """
    vendor, separator, _ = model_id.strip().lower().partition("/")
    factory = VENDOR_TOKEN_COUNTERS.get(f"{vendor}/") if separator else None
    return (factory or DEFAULT_TOKEN_COUNTER)()


def estimate_text_tokens(text: str, *, model_id: str) -> TokenEstimate:
    """Estimate the tokens of a plain text as ``model_id``'s vendor would count them.

    For the inputs that are text before they are anything else — a rendered tool-definition
    JSON, a system prompt — where there is no content-block structure to account for.

    Args:
        text: The text to estimate.
        model_id: The provider routing name whose vendor selects the counter.

    Returns:
        The estimate, naming the counter that answered.
    """
    counter = route_token_counter(model_id)
    return TokenEstimate(tokens=counter.count_text(text), counter_id=counter.counter_id, exact=False)


def estimate_content_block_tokens(blocks: Sequence[Mapping[str, Any]], *, model_id: str) -> TokenEstimate:
    """Estimate the tokens of an OMNE content-block body.

    The input is the OMNE wire vocabulary itself — the shape a message body takes on the
    durable log — so a caller holding persisted history needs no renderer to ask, and two
    callers holding the same history necessarily count the same thing (ADR-138 D-2).

    Every block is accounted for. A ``text`` block is counted by the tokenizer; the
    perceptual media family and a file reference take their flat budgets; and every other
    member of the vocabulary — ``tool_call``, ``reasoning``, ``data``, ``non_standard``,
    ``hitl_request``, and anything the closed vocabulary grows later — is counted over its
    own JSON text. That fallback is the point rather than a gap: a block type this function
    has never been taught about is *over*-counted by its serialized form, so extending the
    vocabulary can never silently shrink an estimate the way passing it over would.

    Args:
        blocks: The message body — a sequence of OMNE content blocks. Empty counts zero.
        model_id: The provider routing name whose vendor selects the counter.

    Returns:
        The estimate for the whole body, naming the counter that answered.
    """
    counter = route_token_counter(model_id)
    total = sum(_block_tokens(block, counter=counter) for block in blocks)
    return TokenEstimate(tokens=total, counter_id=counter.counter_id, exact=False)


def _block_tokens(block: Mapping[str, Any], *, counter: TokenCounter) -> int:
    """Charge one content block.

    Args:
        block: The OMNE content block.
        counter: The counter the body's vendor routed to.

    Returns:
        The block's token charge.
    """
    block_type = block.get("type")
    if block_type == "text":
        text = block.get("text")
        return counter.count_text(text) if isinstance(text, str) else 0
    if block_type in _IMAGE_BUDGET_BLOCK_TYPES:
        return IMAGE_BLOCK_TOKEN_BUDGET
    if block_type in _ATTACHMENT_BUDGET_BLOCK_TYPES:
        return ATTACHMENT_REFERENCE_TOKEN_BUDGET
    return counter.count_text(json.dumps(block, sort_keys=True, ensure_ascii=False, default=str))
