"""Coverage is evidence about unfinished work, never an automatic analytical score."""
import json, hashlib
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
def read(p,default):return json.loads(p.read_text()) if p.exists() else default
def fingerprint(item,protocols):
 return hashlib.sha256(json.dumps({k:item.get(k) for k in ['id','title','status','presenter','participation','documents','documentUrls']}|{'protocols':protocols},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def build(agendas,reviews,assessments,previous):
 docs={d['url']:d for d in agendas['documents']};posts={p['id']:p for p in reviews['posts']};entries=[]
 for m in agendas['meetings']:
  for i in m['items']:
   ident=i['id'].split()[0];key=m['url']+'#'+ident; p=posts.get(ident); a=assessments.get(key,{})
   urls=i.get('documentUrls',[d['url'] for d in i['documents']]); unread=[u for u in urls if docs.get(u,{}).get('status')!='read']
   current=fingerprint(i,m.get('protocols',[])); reasons=[];status='pending'
   if not i['documents']:status='blocked';reasons.append('Darba kārtībā nav atrastas publiskas dokumentu saites; vērtējums nav nosakāms.')
   elif unread:reasons.append(f'{len(unread)} saites nav sekmīgi nolasītas; tehniska kļūme nepierāda nepubliskumu.')
   if p:
    status='reviewed' if p['coverage']['complete'] else 'partial'
    if unread and p['coverage']['complete']:
     status='needs_recheck';reasons.append('Pilnas pārbaudes statuss nav apstiprināms: aktuālās saites nav nolasītas.')
    if not p['coverage']['complete']:reasons.append(p['coverage']['note'])
    if any(docs.get(u,{}).get('hash')!=h for u,h in p['sourceHashes'].items()):
     status='needs_recheck';reasons.append('Avota versija mainījusies vai jaunākajā pārbaudē nav apstiprināma.')
    captured=p.get('agendaFingerprints',{}).get(m['url'])
    if captured!=current:
     status='needs_recheck';reasons.append('Darba kārtības vai protokola stāvoklis nav apstiprināts pret analīzes momentuzņēmumu.')
   elif a.get('complete'):
    if a.get('agendaFingerprint')==current and all(docs.get(u,{}).get('hash')==h for u,h in a.get('sourceHashes',{}).items()) and a.get('sourceHashes'):
     status='below_threshold'
    else:status='needs_recheck';reasons.append('Iepriekšējā atlase atkārtoti jāpārbauda pret aktuālajiem avotiem.')
   entries.append({'key':key,'id':ident,'title':i['title'],'meetingDate':m['date'],'meeting':m['url'],'url':i['url'],'status':status,'agendaFingerprint':current,'documentCount':len(urls),'readableDocuments':len(urls)-len(unread),'unreadUrls':unread,'reasons':reasons})
 # Retain prior ledger entries if the observation scope changes.
 seen={e['key'] for e in entries}
 archived=previous.get('archive',[])+[e for e in previous.get('items',[]) if e['key'] not in seen]
 archive=list({e['key']:e for e in archived if e['key'] not in seen}.values())
 return {'checked':agendas['checked'],'note':'Dokumentu iegūšana nav analīze. Nepabeigtiem jautājumiem nav piešķirti punkti. Vienu projektu vairākās sēdēs uzskaita atsevišķi.','counts':dict(Counter(e['status'] for e in entries)),'total':len(entries),'uniqueProjects':len({e['id'] for e in entries}),'documents':{'attempted':len(docs),'readable':sum(d.get('status')=='read' for d in docs.values()),'failed':sum(d.get('status')!='read' for d in docs.values())},'items':entries,'archive':archive}
def main():
 p=ROOT/'site/data/coverage.json'
 data=build(read(ROOT/'site/data/agendas.json',{}),read(ROOT/'site/data/reviews.json',{}),read(ROOT/'editorial/assessments.json',{}),read(p,{}))
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print('Analysis coverage:',data['counts'])
if __name__=='__main__':main()
