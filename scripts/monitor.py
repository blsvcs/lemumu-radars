"""Public TAP metadata monitor. No login, no restricted documents, no inferred amounts."""
import json, re, time, hashlib
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from pathlib import Path
from datetime import datetime, timezone
BASE='https://tapportals.mk.gov.lv'
ROOT=Path(__file__).resolve().parents[1]
class Rows(HTMLParser):
 def __init__(self):
  super().__init__(); self.depth=0; self.row=None; self.cell=None; self.rows=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='div':
   self.depth+=1
   if a.get('data-linkable-row')=='true': self.row={'url':urljoin(BASE,a.get('data-url','')),'cells':[],'level':self.depth}
   if self.row and 'data-column-header-name' in a:
    self.cell={'name':a['data-column-header-name'],'text':'','level':self.depth}
 def handle_data(self,data):
  if self.cell: self.cell['text']+=data
 def handle_endtag(self,tag):
  if tag=='div':
   if self.cell and self.cell['level']==self.depth:
    self.row['cells'].append((self.cell['name'],' '.join(self.cell['text'].split())));self.cell=None
   if self.row and self.row['level']==self.depth: self.rows.append(self.row); self.row=None
   self.depth-=1

def fetch(path):
 for attempt in range(3):
  try:
   with urlopen(Request(urljoin(BASE,path),headers={'User-Agent':'LemumuRadars/1.0 public-source-monitor'}),timeout=40) as r: return r.read().decode('utf-8')
  except Exception:
   if attempt==2: raise
   time.sleep(2)
def parse(html):
 p=Rows();p.feed(html);return p.rows

def signals(title):
 t=title.lower(); out=[]
 if any(w in t for w in ['apropriāc','finans','budžet','kapitāl','aizdev','garant','atsavin','ieguld','pārdal']): out.append('Publiskā nauda')
 if any(w in t for w in ['vesel','pensij','pabalst','izglīt','vēlēšan','nodok','pasažier','labklāj','airbaltic','drošīb']): out.append('Sabiedrības intereses')
 if any(w in t for w in ['izņēm','neatliek','ārkārt','papildus jautāj','darījuma']): out.append('Jānoskaidro')
 return out or ['Pārējie projekti']

def main():
 now=datetime.now(timezone.utc).isoformat(); path=ROOT/'site/data/monitor.json'
 old=json.loads(path.read_text()) if path.exists() else {'items':[]}
 previous={x['id']:x for x in old['items']}; items={}; errors=[]
 for page in range(1,5):
  try:
   rows=parse(fetch('/legal_acts?page='+str(page)))
   if not rows: raise ValueError('TAP saraksta struktūra neatpazīta')
   for row in rows:
    c=dict(row['cells']); ident=c.get('Projekta ID','');title=c.get('Tiesību akta nosaukums','')
    if not re.match(r'\d{2}-TA-',ident) or not title: continue
    item={'id':ident,'title':title,'url':row['url'],'type':c.get('Tiesību akta veids',''),'status':c.get('Virzības stadija',''),'ministry':c.get('Atbildīgā ministrija',''),'sent':c.get('Nosūtīts (datums)',''),'deadline':c.get('Saskaņošanas termiņš',''),'tags':signals(title),'checked':now,'restricted':'(IP)' in ident}
    before=previous.get(ident);item['firstSeen']=before.get('firstSeen',now) if before else now
    item['history']=(before.get('history',[]) if before else [])[:]
    if before and any(before.get(k)!=item.get(k) for k in ['title','status','deadline']): item['history'].append({'at':now,'status':before['status'],'newStatus':item['status']})
    items[ident]=item
  except Exception as e: errors.append('Projektu saraksta '+str(page)+'. lapa: '+str(e))
  time.sleep(0.5)
 if not items: raise RuntimeError('Nav iegūti derīgi TAP ieraksti; iepriekšējie dati saglabāti.')
 meetings=[]
 try:
  for r in parse(fetch('/meetings/cabinet_ministers'))[:8]:
   c=dict(r['cells']);meetings.append({'url':r['url'],'fields':c})
 except Exception as e: errors.append('Sēdes: '+str(e)); meetings=old.get('meetings',[])
 for ident,item in previous.items():
  if ident not in items: items[ident]=item
 result={'checked':now,'errors':errors,'scope':'TAP projektu saraksta pirmās 4 lapas (līdz 100 ierakstiem) un MK sēžu saraksts. Agrāk novērotie projekti tiek saglabāti; to pārbaudes datums var būt senāks.','items':list(items.values()),'meetings':meetings}
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(f'Atjaunināti {sum(i["checked"]==now for i in items.values())} projekti; {len(errors)} avotu kļūdas.')
if __name__=='__main__': main()
