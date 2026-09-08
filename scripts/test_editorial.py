import io,zipfile,json,copy,unittest
from pathlib import Path
from extract import archive_text
from validate_reviews import validate,validate_assessments
from coverage import build,fingerprint
ROOT=Path(__file__).resolve().parents[1]
def archive(files):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:
  for k,v in files.items():z.writestr(k,v)
 return b.getvalue()
class EditorialTests(unittest.TestCase):
 def test_nested_word_export(self):
  doc=archive({'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>138,56 eiro papildus pamatkontrolei</w:t></w:r></w:p></w:document>'})
  self.assertIn('138,56 eiro',archive_text(archive({'projekts.docx':doc,'pielikums.docx':doc})))
 def test_incomplete_not_zero(self):
  with self.assertRaises(ValueError):validate_assessments({'x':{'complete':False,'total':0}})
 def test_publication_gates(self):
  d=json.loads((ROOT/'site/data/reviews.json').read_text());validate(d)
  for change in [lambda p:p['scores']['budget'].update(value=None),lambda p:p.update(social='x'*701),lambda p:p['answers'][0].update(sources=[]),lambda p:p.update(kind='urgent')]:
   bad=copy.deepcopy(d);change(bad['posts'][0])
   with self.assertRaises(ValueError):validate(bad)
 def test_protocol_reopens_review(self):
  d=json.loads((ROOT/'site/data/reviews.json').read_text());p=copy.deepcopy(d['posts'][0]);i={'id':p['id'],'title':'A','url':'https://example.test/project','status':'Pieņemts','documents':[]};m={'url':'https://example.test/meeting','date':'08.09.2026.','items':[i],'protocols':[]};p['agendaFingerprints']={m['url']:fingerprint(i,[])};p['coverage']['complete']=True
  a={'checked':'now','meetings':[m],'documents':[{'url':u,'hash':h,'status':'read'} for u,h in p['sourceHashes'].items()]}
  self.assertEqual(build(a,{'posts':[p]}, {}, {})['items'][0]['status'],'reviewed')
  m['protocols']=[{'url':'https://example.test/protocol'}]
  self.assertEqual(build(a,{'posts':[p]}, {}, {})['items'][0]['status'],'needs_recheck')
if __name__=='__main__':unittest.main()
