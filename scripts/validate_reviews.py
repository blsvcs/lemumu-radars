"""Reject incomplete scores and unsupported publication structures before deployment."""
import json,re,hashlib
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
CRITERIA=['society','budget','business','politics','rights','process','integrity','attention']
CAUTION='Publiski pieejamā informācija nav pietiekama galīgam secinājumam.'
def check(ok,message):
 if not ok:raise ValueError(message)
def scores(p):
 check(set(p['scores'])==set(CRITERIA),'Exactly eight criteria required')
 urls={s['url'] for s in p['sources']}
 for k,s in p['scores'].items():
  check(type(s['value']) is int and 0<=s['value']<=5,'Invalid or missing score: '+k)
  check(bool(s['reason'].strip()) and s['source'] in urls,'Score requires reason and listed source')
 total=sum(s['value'] for s in p['scores'].values());check(total==p['total'],'Total does not match criteria')
 return total
def source_versions(p):
 urls={s['url'] for s in p['sources']}
 check(p.get('sourceHashes'),'Record source versions used in the review')
 for u,h in p['sourceHashes'].items():
  check(u in urls and re.fullmatch('[0-9a-f]{64}',h) is not None,'Invalid source hash or unlisted source')
 check(all(urlparse(u).scheme=='https' and urlparse(u).netloc for u in urls),'Sources must be HTTPS URLs')
def validate(data):
 check(isinstance(data.get('posts'),list),'posts must be a list');ids=set()
 for p in data['posts']:
  check(p['id'] not in ids,'Duplicate publication ID');ids.add(p['id'])
  check(all(p.get(k) for k in ['id','analyzedAt','meetingDate','status','lead','ministry']),'Publication metadata missing')
  check(all(p['titles'].get(k) for k in ['neutral','critical','social']),'Three headlines required')
  total=scores(p);check(total>=11,'Below-threshold item cannot be a publication')
  check(p['kind']==('urgent' if total>=30 else 'article' if total>=20 else 'brief'),'Publication threshold mismatch')
  check(len(p['questions'])==5 and all(p['questions']) and 0<len(p['social'])<=700,'Five questions and social text up to 700 characters required')
  urls={s['url'] for s in p['sources']};check(any(u in p['social'] for u in urls),'Social text requires a source URL')
  check(len(p['answers'])==15 and all(a['heading'] and a['text'] for a in p['answers']),'Fifteen answers required')
  for a in p['answers']:
   check(a.get('sources') and all(u in urls for u in a['sources']),'Every answer requires listed sources')
  check(p.get('evidence') and all(e['kind'] in ['fact','proponent','objection','analysis','question'] and e['source'] in urls for e in p['evidence']),'Invalid evidence attribution')
  check(all(f['text'] and f['source'] in urls for f in p['redFlags']),'Red flag requires listed source')
  check(type(p['coverage']['complete']) is bool,'Coverage must be explicit')
  if not p['coverage']['complete']:check(CAUTION in p['coverage']['note'],'Incomplete coverage requires explicit limitation')
  source_versions(p)
  check(p.get('agendaFingerprints') and all(re.fullmatch('[0-9a-f]{64}',h) for h in p['agendaFingerprints'].values()),'Agenda snapshot required')
  for c in p.get('corrections',[]):check(c.get('at') and c.get('reason'),'Correction date and explanation required')
  if p['kind']=='urgent':
   check(all(p.get('urgent',{}).get(k) for k in ['label','what','why','numbers','questions','unknown','decisionDate','source']),'Urgent format A missing')
   check(p['urgent']['source'] in urls,'Urgent alert requires listed source')
 return True
def validate_assessments(data):
 for key,a in data.items():
  if a.get('complete'):
   check(scores(a)<=10,'Publication-threshold assessment belongs in reviews');source_versions(a)
   check(a.get('agendaFingerprint') and a.get('analyzedAt'),'Assessment snapshot and date required')
  else:check(a.get('total') is None,'Incomplete criteria cannot have a total')
def validate_corpus(data):
 for p in data['posts']:
  for u,h in p['sourceHashes'].items():
   path=ROOT/'research/documents'/(hashlib.sha256(u.encode()).hexdigest()+'.json')
   check(path.exists(),'Missing source snapshot: '+u);d=json.loads(path.read_text())
   known={d['hash']}|{v for x in d.get('history',[]) for k,v in x.items() if k in ['hash','previousHash']}
   check(h in known,'Source hash has no recorded version: '+u)
if __name__=='__main__':
 d=json.loads((ROOT/'site/data/reviews.json').read_text());validate(d);validate_corpus(d)
 validate_assessments(json.loads((ROOT/'editorial/assessments.json').read_text()))
 print('Editorial validation passed:',len(d['posts']),'posts')
