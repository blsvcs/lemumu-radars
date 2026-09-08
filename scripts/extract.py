"""Bounded public document decoding, including TAP ZIP-of-DOCX exports."""
import io,zipfile,re
from xml.etree import ElementTree as ET
LIMIT=24_000_000
NS={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def archive_text(raw,depth=0):
 if depth>3:raise ValueError('Pārsniegts arhīva dziļums')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  if sum(i.file_size for i in z.infolist())>LIMIT:raise ValueError('Arhīva izpakotais apjoms pārsniedz 24 MB')
  names=z.namelist()
  for name in ['word/document.xml','content.xml']:
   if name in names:return ' '.join(ET.fromstring(z.read(name)).itertext())
  if 'xl/workbook.xml' in names:
   shared=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in names else []
   lines=[]
   for name in names:
    if not re.fullmatch(r'xl/worksheets/sheet[0-9]+.xml',name):continue
    for row in ET.fromstring(z.read(name)).findall('.//x:row',NS):
     cells=[]
     for c in row.findall('x:c',NS):
      v=c.find('x:v',NS);value=v.text if v is not None else ''
      if c.attrib.get('t')=='s' and value:value=shared[int(value)]
      if c.attrib.get('t')=='inlineStr':value=''.join(c.itertext())
      f=c.find('x:f',NS)
      if f is not None:value=(value or 'NAV SAGLABĀTAS VĒRTĪBAS')+' [formula: '+(f.text or '')+']'
      if value:cells.append(c.attrib.get('r','')+': '+value)
     if cells:lines.append(name+' | '+' | '.join(cells))
   return '\n'.join(lines)
  pieces=[];unsupported=[]
  for name in names:
   if name.endswith('/'):continue
   if name.lower().endswith(('.docx','.xlsx','.odt','.zip')):pieces.append(name+'\n'+archive_text(z.read(name),depth+1))
   elif name.lower().endswith('.pdf'):
    from pypdf import PdfReader
    pieces.append(name+'\n'+'\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(z.read(name))).pages))
   elif name.lower().endswith(('.txt','.csv','.xml')):pieces.append(name+'\n'+z.read(name).decode('utf-8',errors='replace'))
   else:unsupported.append(name)
  if unsupported:raise ValueError('Arhīvā palikuši nenolasīti faili: '+', '.join(unsupported))
  if not pieces:raise ValueError('Arhīvā nav atbalstītu dokumentu')
  return '\n\n'.join(pieces)
