from pathlib import Path
from urllib.request import urlopen,Request
from urllib.error import HTTPError
from datetime import datetime,timezone
import hashlib,json,gzip
base=Path(__file__).parent
urls={
 'alibaba-chat':'https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions',
 'openrouter-max-prime':'https://openrouter.ai/qwen/qwen3.8-max-prime',
 'qwen-model-card':'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/207bd685a7e3696cfaff12ded7c6a7ea0f88c996/README.md',
}
rows=[]
for name,url in urls.items():
 try:
  with urlopen(Request(url,headers={'User-Agent':'omne-harness-research/1'}),timeout=30) as reply:
   data=reply.read(4000001)
   if len(data)>4000000:raise RuntimeError('capture size exceeded')
   status=reply.status;content_type=reply.headers.get('Content-Type');location=reply.url
 except HTTPError as failure:
  status=failure.code;data=failure.read();content_type=failure.headers.get('Content-Type');location=failure.url
 path=name+'.http-body.gz';archive=gzip.compress(data,mtime=0);(base/path).write_bytes(archive)
 rows.append({'url':url,'finalUrl':location,'observedAt':datetime.now(timezone.utc).isoformat(),'status':status,'contentType':content_type,'file':path,'encoding':'gzip','decodedBytes':len(data),'decodedSha256':hashlib.sha256(data).hexdigest(),'archiveSha256':hashlib.sha256(archive).hexdigest()})
(base/'http-capture.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps([{k:row[k] for k in ['url','status','decodedBytes']} for row in rows],indent=2))
