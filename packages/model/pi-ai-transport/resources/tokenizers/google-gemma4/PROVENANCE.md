# Gemma 4 tokenizer comparator

- Source: [`google/gemma-4-E4B-it` revision `ee0ef6023621cff504d758262d4e04895a5af4a2`](https://huggingface.co/google/gemma-4-E4B-it/tree/ee0ef6023621cff504d758262d4e04895a5af4a2). Its model metadata identifies Apache-2.0; `LICENSE` is the [Apache 2.0 license text](https://www.apache.org/licenses/LICENSE-2.0.txt), because the model repository has no separate license file.
- `tokenizer.json` SHA-256: `cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f`.
- `tokenizer_config.json` SHA-256: `9f4fec4b1dc6ecddf8f4a92e9caea5971c0e67d81309f3f9066a2bee8c362633`.
- Google's [python-genai loader at `6d012889`](https://github.com/googleapis/python-genai/blob/6d012889752f65c1a51d0ad6e5970fc97d19c4ca/google/genai/_local_tokenizer_loader.py) maps Gemini 3.5 Flash to this Gemma 4 tokenizer. It does not map either Gemini 3.7 or 3.8 Flash. This upstream mapping does not establish tokenizer identity for either later model.

This artifact is a comparator for a rough `estimated` text/tool input meter. It is not an exact Gemini tokenizer or a proven upper bound. The model definitions still declare all input modalities; this meter returns `unavailable` outside its measured text/tool protocol subset.
