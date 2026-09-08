# Lēmumu radars

Publiskā vietne: https://blsvcs.github.io/lemumu-radars/

## Sistēma
1. GitHub Actions reizi stundā iegūst TAP metadatus, jaunāko trīs sēžu un visu redzamo gaidāmo sēžu darba kārtības. Agrāk novērotās sēdes bez protokola turpina pārbaudīt, arī pēc iziešanas no saraksta pirmās lapas, izmantojot saglabāto sēdes saiti. Izpildi var aizkavēt GitHub.
2. Darba kārtību momentuzņēmumi saglabā jaunos, mainītos un vairs neredzamos ierakstus, dokumentu saites, statusus un protokolus. Pirmā pārbaude nav uzskatāma par jautājuma pievienošanas brīdi.
3. Visiem novēroto sēžu jautājumiem un `editorial/targets.json` papildu mērķiem mēģina nolasīt visus saistītos publiskos dokumentus, ieskaitot HTML, DOCX, XLSX, ODT un PDF. Neatveramie/nesalasāmie formāti un iegūšanas ierobežojumi paliek redzami. XLSX vērtības ir failā saglabātās vērtības ar formulām, ne pilns Excel pārrēķins.
4. Atsevišķs ChatGPT monitoringa uzdevums analizē saturu pēc `editorial/PROMPT.md`, atjauno publikāciju datus un ziņo par būtiskiem jaunumiem. Šis uzdevums ir izveidots ChatGPT; vienkārša repozitorija kopija to nepārnes. Tā darbība atkarīga no aktīva uzdevuma un GitHub savienojuma. Nav vajadzīga pārlūkā ievietota MI API atslēga.
5. Vietne nošķir nosaukumu metadatu filtrus no dokumentos balstītiem rakstiem. Publikācijām ir astoņu dimensiju 0–5 vērtējums, skaidrojumi, avoti, 15 atbildes, pieci jautājumi ministram, trīs virsraksti un kopējams sociālais teksts (līdz 700 rakstzīmēm).

## Dati un failu atbildība
- `site/data/monitor.json`: projektu metadati, ne pabeigta analīze.
- `site/data/agendas.json`: darba kārtības, izmaiņas, dokumentu iegūšanas statuss.
- `research/documents/*.json`: nolasītais publiskais teksts, avots, laiks un SHA-256. Git glabā versijas.
- `site/data/reviews.json`: pierādījumos balstītas publikācijas un dienas kopsavilkums. Stundu skripts šo failu nepārraksta.
- `editorial/PROMPT.md`: redakcionālais uzdevums un robežas.
- `editorial/run-state.json`: analītiskā aģenta pārbaužu un paziņojumu stāvoklis, kad tas izveidots.

Mainīts avota teksta hash vietnē marķē analīzi kā atkārtoti pārbaudāmu. Ja hash nemainās, tas pats par sevi nepierāda, ka visi saistītie avoti joprojām ir pilnīgi. Neatverams dokuments nav pierādījums publiskas pieejamības trūkumam.

## Publicēšana un pārbaude
Settings → Pages → Source: GitHub Actions. Publiskošanu veic `.github/workflows/monitor.yml`. Izpildes kļūmes atstāj iepriekšējo publicēto vietni; datu pārbaudes laiks rāda novecošanu.

`python scripts/monitor.py`

`python scripts/agenda.py` (PDF nolasīšanai nepieciešams pypdf)

`python scripts/validate_reviews.py`

`python scripts/coverage.py`

`python scripts/test_editorial.py`

`python -m http.server 8080 --directory site`

## Pārklājums un precizitāte
Visi sēžu jautājumi vēl nav padziļināti izvērtēti. Raksta pārklājuma piezīme ir obligāta. Sliekšņi 0–10/11–19/20–29/30–40 ir redakcionāli, ne pārkāpuma pierādījums. Ierobežota pieejamība pati par sevi nenozīmē korupciju. Projekts, sēdes statuss, protokols un spēkā stājies regulējums tiek nošķirti. Finansiāli lielākā jautājuma rangu nedrīkst izdomāt no nepilnas salīdzinājuma kopas.

Pašreizējā automātiskās nolasīšanas robeža: 8 MB avotam, 24 MB izpakotam arhīvam, četri pakārtoto saišu līmeņi un līdz 2000 saitēm katrā līmenī; pāri robežai palikušās saites uzskaita kļūmēs. Ārējos avotus un trūkstošo saturu pārbauda analītiskais aģents atsevišķi. Neviena tehniska robeža nedrīkst kļūt par apgalvojumu, ka viss ir pārbaudīts.


## Analīzes darba uzskaite
`site/data/coverage.json` publiski uzrāda katras sēdes jautājuma statusu: gaida analīzi, trūkst dokumentu saišu, daļēja analīze, atkārtota pārbaude, pilnībā izvērtēts vai zem sliekšņa. Tas nošķir 114 darba kārtības ierakstus no unikāliem projektiem un dokumentu lejupielādi no analīzes. Kļūmes un nezināmi kritēriji nekļūst par nullēm.

`editorial/assessments.json` glabā pilnus, avotos pamatotus 0–10 punktu novērtējumus un vajadzības gadījumā nepabeigtu vērtējumu piezīmes bez summas. Publikāciju avotu un darba kārtības versiju izmaiņas atver atkārtotu pārbaudi. `editorial/run-state.json` glabā pārbaudes vēsturi un paziņotos notikumus; pilnu dienas daļu nedrīkst atzīmēt pabeigtu no tehniskas datu iegūšanas vien.

Validatorā ir 11/20/30 sliekšņi, astoņi pamatoti kritēriji, 15 atbildes ar avotiem, pieci jautājumi, trīs virsraksti, 700 rakstzīmju ierobežojums, avotu versiju un steidzamā A formāta pārbaude. Vietne rāda A brīdinājumu tikai atbilstošai publikācijai, B analīzi, C kopējamu tekstu un D dienas apskatu. Labojumu vēsture ir redzama pie raksta.

TAP lejupielādes ar `.docx` nosaukumu var būt arhīvi ar vairākiem Word failiem; nolasītājs atver arī šādus komplektus. Atkārtota palaišana var izmantot ne vairāk kā 30 minūtes vecu jau nolasītu avotu, saglabājot tā patieso pārbaudes laiku. Tas nav jaunas lejupielādes laiks. Seši paralēli pieprasījumi, 35 sekunžu savienojuma gaidīšanas robeža. Galīgā protokola nepublicēšanu nevar novērst vietnes kods.
