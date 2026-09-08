"""Meeting and public-document snapshots; findings require an evidence-based editorial review."""
import json, hashlib, re, time, io, zipfile, os
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml.etree import ElementTree
from monitor import BASE, ROOT, fetch, parse
from extract import archive_text
import difflib
from zoneinfo import ZoneInfo

class Node:
 def __init__(self,tag='',attrs=None): self.tag=tag;self.attrs=attrs or {};self.children=[]
 def text(self): return ' '.join(' '.join(x.text() if isinstance(x,Node) else x for x in self.children).split())
 def find(self,predicate):
  out=[]
  for x in self.children:
   if isinstance(x,Node):
    if predicate(x):out.append(x)
    out.extend(x.find(predicate))
  return out
class DOM(HTMLParser):
 def __init__(self,html):
  super().__init__();self.root=Node();self.stack=[self.root];self.feed(html)
 def handle_starttag(self,t,a):
  n=Node(t,dict(a));self.stack[-1].children.append(n)
  if t not in ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']: self.stack.append(n)
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==t:self.stack=self.stack[:i];break
 def handle_data(self,s):
  if not any(n.tag in ['script','style','nav','header','footer'] for n in self.stack):self.stack[-1].children.append(s)

def links(node):
 out={}
 for a in node.find(lambda n:n.tag=='a' and 'href' in n.attrs):
  u=urljoin(BASE,a.attrs['href'])
  if re.fullmatch(r'/structuralizer/data/nodes/[^/]+',urlparse(u).path):continue
  if urlparse(u).netloc=='tapportals.mk.gov.lv' and re.match(r'^/(annotation/|structuralizer/data/nodes/|attachments/|reviews/resolutions/|public_participation/|meetings/protocols/)',urlparse(u).path):out[u]={'url':u,'title':a.text() or 'Saistītais dokuments'}
 return list(out.values())
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def read(path,default):return json.loads(path.read_text()) if path.exists() else default

def agenda(html,url,date):
 root=DOM(html).root;items=[]
 for row in root.find(lambda n:'meeting-header-question__row' in n.attrs.get('class','').split()):
  fields={n.attrs['data-column-header-name']:n.text() for n in row.find(lambda n:'data-column-header-name' in n.attrs)}
  ident=fields.get('Projekta ID','');a=row.find(lambda n:n.tag=='a' and n.attrs.get('href','').startswith('/legal_acts/'))
  if not ident or not a:continue
  items.append({'id':ident,'url':urljoin(BASE,a[0].attrs['href']),'title':fields.get('Jautājums',''),'status':fields.get('Statuss',''),'presenter':fields.get('Ziņo',''),'position':fields.get('Nr.p.k.',''),'meeting':url,'meetingDate':date,'documents':links(row),'processMarkers':{k:needle in fields.get('Jautājums','').lower() for k,needle in [('additional','iekļauts papildus'),('deferred','atlikt'),('urgent','steidzam'),('withdrawn','svītrot')]},'participation':next((n.text() for n in row.find(lambda n:n.attrs.get('data-collapse-recipient','').endswith('-public-participation'))),'Nav norādīta')})
 return {'url':url,'date':date,'items':items,'protocols':[x for x in links(root) if '/meetings/protocols/' in x['url']]}

def document(entry, reuse_seconds=0):
 u=entry['url'];p=ROOT/'research/documents'/(hashlib.sha256(u.encode()).hexdigest()+'.json');now=datetime.now(timezone.utc).isoformat();old=read(p,{})
 try:
  if old.get('status')=='read' and reuse_seconds and (datetime.now(timezone.utc)-datetime.fromisoformat(old['checked'])).total_seconds()<reuse_seconds:
   return {k:v for k,v in old.items() if k not in ['text','history']}|{'file':str(p.relative_to(ROOT)),'cached':True}
  with urlopen(Request(u,headers={'User-Agent':'LemumuRadars/2.0 public-document-monitor'}),timeout=35) as r:
   if urlparse(r.url).netloc!='tapportals.mk.gov.lv' or '/users/' in r.url:raise ValueError('Nepubliska vai autentifikācijas lapa')
   raw=r.read(8_000_001);ctype=r.headers.get('Content-Type','')
  if len(raw)>8_000_000:raise ValueError('Dokuments pārsniedz 8 MB automātiskās iegūšanas robežu')
  child=[]
  if raw.startswith(b'%PDF'):
   from pypdf import PdfReader
   text='\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(raw)).pages)
  elif raw.startswith(b'PK'):
   text=archive_text(raw)
  elif 'html' in ctype or raw.lstrip().startswith(b'<'):
   root=DOM(raw.decode('utf-8',errors='replace')).root
   main=root.find(lambda n:n.tag=='main');text=(main[0] if main else root).text();child=links(root)
  elif 'text/' in ctype: text=raw.decode('utf-8',errors='replace')
  else:raise ValueError('Neatbalstīts formāts: '+ctype)
  if len(text.strip())<40:raise ValueError('Teksta saturs nav nolasāms')
  newhash=hashlib.sha256(text.encode()).hexdigest();history=old.get('history',[])
  if old.get('hash') and old['hash']!=newhash:history.append({'at':now,'previousHash':old['hash'],'hash':newhash})
  result={**entry,'checked':now,'status':'read','text':text,'hash':newhash,'history':history,'links':child,'changeSummary':[line[:1000] for line in list(difflib.unified_diff(old.get('text','').splitlines(),text.splitlines(),fromfile='Iepriekšējā versija',tofile='Jaunā versija',n=2))[:100]] if old.get('hash') and old['hash']!=newhash else []}
  p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
  return {k:v for k,v in result.items() if k not in ['text','links','history']}|{'file':str(p.relative_to(ROOT)),'links':child}
 except Exception as e:
  # Do not replace previously readable content with an empty failed fetch.
  return {**entry,'checked':now,'status':'unavailable','error':str(e),'file':str(p.relative_to(ROOT)) if p.exists() else None}

def main():
 now=datetime.now(timezone.utc).isoformat();path=ROOT/'site/data/agendas.json';old=read(path,{'meetings':[],'changes':[]});previous={x['url']:x for x in old['meetings']};meetings=[];errors=[];changes=old.get('changes',[])
 index_html=fetch('/meetings/cabinet_ministers'); rows=parse(index_html)
 index_root=DOM(index_html).root
 protocol_map={urljoin(BASE,n.attrs['data-url']):[l for l in links(n) if '/meetings/protocols/' in l['url']] for n in index_root.find(lambda n:n.attrs.get('data-linkable-row')=='true' and 'data-url' in n.attrs)}
 if not rows:raise RuntimeError('Sēžu saraksts nav nolasāms')
 # Retain pending protocol watches even after a meeting leaves the first list page.
 known={r['url'] for r in rows}
 for u,m in previous.items():
  if u not in known and not m.get('protocols'):rows.append({'url':u,'cells':[('Datums',m['date'])]})
 # Latest 3 meetings, plus every listed future meeting. Older snapshots remain visible.
 selected=[]
 for idx,row in enumerate(rows):
  date=dict(row['cells']).get('Datums','')
  try:future=datetime.strptime(date[:10],'%d.%m.%Y').date()>=datetime.now(ZoneInfo('Europe/Riga')).date()
  except ValueError:future=False
  pending=row['url'] in previous and not previous[row['url']].get('protocols')
  if idx<3 or future or pending:selected.append((row,date))
 for row,date in selected:
  try:
   m=agenda(fetch(row['url']),row['url'],date)
   m['protocols']=list({p['url']:p for p in m['protocols']+protocol_map.get(row['url'],[])}.values())
   if not m['items']:raise ValueError('Darba kārtības jautājumi nav nolasāmi')
   m['checked']=now;prior=previous.get(m['url']);before={x['id']:x for x in prior['items']} if prior else {}
   for item in m['items']:
    olditem=before.get(item['id']);item['firstSeen']=olditem.get('firstSeen',now) if olditem else now
    compare=['title','status','presenter','position','documents','participation','processMarkers']
    if prior and not olditem:changes.append({'at':now,'kind':'Pievienots novērotajai darba kārtībai','id':item['id'],'meeting':m['url']})
    elif olditem:
     changed=[k for k in compare if olditem.get(k)!=item.get(k) and (k!='processMarkers' or k in olditem)]
     if changed:changes.append({'at':now,'kind':'Grozīts','fields':changed,'id':item['id'],'meeting':m['url'],'before':{k:olditem.get(k) for k in changed},'after':{k:item.get(k) for k in changed}})
   if prior:
    for ident in before.keys()-{i['id'] for i in m['items']}:changes.append({'at':now,'kind':'Vairs nav redzams darba kārtībā; iemesls jāpārbauda','id':ident,'meeting':m['url']})
    if prior.get('protocols')!=m['protocols']:changes.append({'at':now,'kind':'Mainījusies protokola saite','id':'Protokols','meeting':m['url']})
   meetings.append(m)
  except Exception as e:
   errors.append({'url':row['url'],'error':str(e)})
   if row['url'] in previous:meetings.append(previous[row['url']])
 if not meetings:raise RuntimeError('Nevienas sēdes darba kārtība nav nolasāma')
 for u,m in previous.items():
  if u not in {x['url'] for x in meetings}:meetings.append(m)
 # Research targets are explicit editorial choices; all links for them are fetched.
 targets=read(ROOT/'editorial/targets.json',[])
 config=read(ROOT/'editorial/config.json',{'collectAll':True})
 entries={d['url']:d for m in meetings[:len(selected)] for i in m['items'] if config.get('collectAll',True) or i['id'].split()[0] in targets for d in i['documents']}
 for i in read(ROOT/'site/data/monitor.json',{}).get('items',[]):
  if i['id'] in targets:entries[i['url']]={'url':i['url'],'title':i['id']+' TAP ieraksts'}
 for m in meetings[:len(selected)]:
  for i in m['items']:entries[i['url']]={'url':i['url'],'title':i['id']+' TAP ieraksts'}
  for d in m['protocols']:entries[d['url']]=d
 def collect(entries):
  result=[]
  with ThreadPoolExecutor(max_workers=6) as pool:
   jobs={pool.submit(document,d,1800):d for d in entries}
   for future in as_completed(jobs):
    result.append(future.result())
    if len(result)%50==0:print(f'Dokumentu pārbaude: {len(result)}/{len(jobs)}',flush=True)
  return sorted(result,key=lambda d:d['url'])
 documents=collect(list(entries.values()))
 # Every discovered link is queued; limits remain explicitly visible and cannot disappear.
 seen=set(entries);frontier={l['url']:l for d in documents for l in d.get('links',[]) if l['url'] not in seen}
 unvisited={};all_links={d['url']:d.get('links',[]) for d in documents}
 for depth in range(4):
  if not frontier:break
  batch=list(frontier.values())[:2000]
  for d in list(frontier.values())[2000:]:unvisited[d['url']]=d
  seen.update(x['url'] for x in batch)
  new=collect(batch)
  documents.extend(new);all_links.update({d['url']:d.get('links',[]) for d in new})
  frontier={l['url']:l for d in new for l in d.get('links',[]) if l['url'] not in seen}
 unvisited.update(frontier)
 if unvisited:errors.append({'error':'Ir automātiski vēl nenolasītas saites; pārbaude nav pilnīga.','urls':list(unvisited)})
 for m in meetings:
  for item in m['items']:
   queue=[item['url']]+[d['url'] for d in item['documents']]; found=set()
   while queue:
    u=queue.pop()
    if u in found:continue
    found.add(u);queue.extend(l['url'] for l in all_links.get(u,[]))
   item['documentUrls']=sorted(found)
 for d in documents:d.pop('links',None)
 path.write_text(json.dumps({'checked':now,'baseline':not bool(previous),'scope':'Jaunākās trīs un visas sarakstā redzamās gaidāmās MK sēdes. Agrākie momentuzņēmumi saglabāti. Pilns saistīto dokumentu iegūšanas mēģinājums visiem novērotajiem darba kārtības jautājumiem; kļūmes norādītas atsevišķi.','meetings':meetings,'changes':changes[-300:],'documents':sorted(documents,key=lambda d:d['url']),'errors':errors},ensure_ascii=False,indent=2)+'\n')
 print(f'{len(meetings)} sēdes, {sum(len(m["items"]) for m in meetings)} jautājumi, {len(documents)} dokumentu mēģinājumi, {len(errors)} kļūmes')
if __name__=='__main__':main()
