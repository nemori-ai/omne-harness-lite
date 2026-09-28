"""Independent pinned-Jinja oracle; no hosted-model or OpenRouter claim.

Run from the repository root with a Python environment providing Jinja2:
python3 packages/model/pi-ai-transport/tests/fixtures/zai/history-template-oracle.py
"""
import hashlib
import json
from pathlib import Path
import jinja2

root = Path(__file__).resolve().parents[3]
template = root / 'tokenizers/zai-glm5/glm-5.3-chat-template.jinja'
source = Path(__file__).with_name('history-complete-streams.json')
env = jinja2.Environment(extensions=['jinja2.ext.loopcontrols'])
env.filters['tojson'] = lambda value, ensure_ascii=False: json.dumps(value, ensure_ascii=ensure_ascii)
compiled = env.from_string(template.read_text())
results = []
for row in json.loads(source.read_text()):
    messages = row['request']['messages'] + [
        {'role': 'assistant', 'content': row['content'], 'reasoning_content': row['thought']},
        {'role': 'user', 'content': 'What arithmetic result did we verify?'},
    ]
    # Public local template takes parsed function arguments; wire uses a JSON string.
    for message in messages:
        for call in message.get('tool_calls', []):
            call['function']['arguments'] = json.loads(call['function']['arguments'])
    rendered = compiled.render(messages=messages, tools=row['request']['tools'], add_generation_prompt=True, clear_thinking=False)
    results.append({'id': row['id'], 'promptSha256': hashlib.sha256(rendered.encode()).hexdigest()})
print(json.dumps({'jinja2': jinja2.__version__, 'templateSha256': hashlib.sha256(template.read_bytes()).hexdigest(), 'historiesSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'goldens': results}, indent=2))
