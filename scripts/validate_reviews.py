import json
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
CRITERIA=['society','budget','business','politics','rights','process','integrity','attention']
def validate(data):
 assert isinstance(data.get('posts'),list),'posts must be a list'
 for p in data['posts']:
  assert p['id'] and p['analyzedAt'] and p['meetingDate'] and p['status']
  assert all(p['titles'].get(k) for k in ['neutral','critical','social'])
  assert set(p['scores'])==set(CRITERIA)
  for k,s in p['scores'].items():
   assert type(s['value']) is int and 0<=s['value']<=5,(p['id'],k)
   assert s['reason'] and s['source'] in [x['url'] for x in p['sources']]
  total=sum(s['value'] for s in p['scores'].values())
  assert total==p['total'] and total>=11
  assert p['kind']==('urgent' if total>=30 else 'article' if total>=20 else 'brief')
  assert len(p['questions'])==5 and len(p['social'])<=700
  assert len(p['answers'])==15 and all(a['heading'] and a['text'] for a in p['answers'])
  assert p['sources'] and all(urlparse(s['url']).scheme=='https' for s in p['sources'])
  assert all(e['kind'] in ['fact','proponent','objection','analysis','question'] and e['source'] in [s['url'] for s in p['sources']] for e in p['evidence'])
  assert p['coverage']['complete'] in [True,False]
  if not p['coverage']['complete']:assert 'Publiski pieejamā informācija nav pietiekama galīgam secinājumam.' in p['coverage']['note']
  assert p.get('sourceHashes'), 'Record source versions used in the review'
 return True
if __name__=='__main__':
 d=json.loads((ROOT/'site/data/reviews.json').read_text());validate(d);print('Editorial validation passed:',len(d['posts']),'posts')
