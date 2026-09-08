# Lēmumu radars

Publiska Latvijas valdības projektu metadatu monitoringa vietne. Avots: https://tapportals.mk.gov.lv.

## Publicēšana
GitHub repozitorijā Settings → Pages → Build and deployment → Source: **GitHub Actions**. Pēc tam Actions → “TAP monitorings un vietnes publicēšana” → Run workflow. Nepieciešama atļauja GitHub Actions darboties un rakstīt šajā repozitorijā.

Paredzētā adrese pēc veiksmīgas publicēšanas: https://blsvcs.github.io/lemumu-radars/.

## Darbība
- `python scripts/monitor.py` iegūst četru jaunāko projektu saraksta lapu publiskos metadatus un MK sēdes. Tikai Python standarta bibliotēka.
- Darbplūsma plānota ik pēc 3 stundām (UTC). GitHub var aizkavēt vai apturēt neaktīvu publisku repozitoriju grafikus.
- Dati un novērotās nosaukuma, statusa vai termiņa izmaiņas paliek Git vēsturē un JSON. Agrāk novērotie projekti ārpus četru lapu loga netiek atkārtoti pārbaudīti. Katram ierakstam ir pārbaudes laiks.
- Pilnīga avota kļūme pārtrauc darbplūsmu un saglabā iepriekš publicēto vietni; daļēja kļūme ir redzama datu kvalitātes paziņojumā.
- Pārlūkā nav API atslēgu, sīkdatņu vai izsekošanas.

## Redakcionālais statuss
Automātiska atlase pēc nosaukuma atslēgvārdiem, nevis pilna dokumentu vai MI analīze. Finansiālo apmēru salīdzināšana, anotāciju/pielikumu analīze un redaktora pārbaudīti raksti vēl nav ieviesti. Lietotāja solītais pilnais redakcionālais prompts nav saņemts. Pamata principi atrodami vietnes “Kā atlasām” sadaļā.

Projekts nav pieņemts lēmums. Signāls nav pārkāpuma pierādījums. IP atzīme nav aizdomīguma rādītājs. Publiskos avotus pārbauda pirms jebkura analītiska apgalvojuma.

## Vietējā apskate
`python -m http.server 8080 --directory site`
