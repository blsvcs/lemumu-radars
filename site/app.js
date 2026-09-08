'use strict';

(function () {
  var state = {
    monitor: { items: [], meetings: [], errors: [] },
    agendas: { meetings: [], changes: [], documents: [], errors: [] },
    reviews: { posts: [], daily: null },
    coverage: { counts: {}, total: 0, documents: {} },
    decisions: { items: [], population: null, method: {} },
    decisionMap: new Map(),
    postMap: new Map(),
    quickFilter: '',
    limit: 18
  };

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };
  var esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  };
  var safeUrl = function (value, fallback) {
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.href : (fallback || '#');
    } catch (error) {
      return fallback || '#';
    }
  };
  var isNumber = function (value) {
    return typeof value === 'number' && Number.isFinite(value);
  };
  var sum = function (values) {
    return values.reduce(function (total, value) { return total + (isNumber(value) ? value : 0); }, 0);
  };
  var signed = function (value) {
    if (!isNumber(value)) return '—';
    if (value > 0) return '+' + value;
    if (value < 0) return '−' + Math.abs(value);
    return '0';
  };
  var formatInteger = new Intl.NumberFormat('lv-LV', { maximumFractionDigits: 0 });
  var formatDecimal = new Intl.NumberFormat('lv-LV', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var euro = new Intl.NumberFormat('lv-LV', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function money(value, compact, perYear) {
    if (!isNumber(value)) return '—';
    var abs = Math.abs(value);
    var prefix = value > 0 ? '+' : value < 0 ? '−' : '';
    var output;
    if (compact && abs >= 1000000000) output = '€' + formatDecimal.format(abs / 1000000000) + ' mljrd.';
    else if (compact && abs >= 1000000) output = '€' + formatDecimal.format(abs / 1000000) + ' milj.';
    else if (compact && abs >= 1000) output = '€' + formatDecimal.format(abs / 1000) + ' tūkst.';
    else output = euro.format(abs);
    return prefix + output + (perYear ? '/gadā' : '');
  }

  function dateTime(value) {
    if (!value) return 'laiks nav norādīts';
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('lv-LV', {
      timeZone: 'Europe/Riga',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function projectNumber(item) {
    var match = String(item.id || '').match(/(\d+)-TA-(\d+)/);
    return match ? Number(match[1]) * 100000 + Number(match[2]) : 0;
  }

  function getMetric(id) {
    return state.decisionMap.get(String(id || '').split(' ')[0]) || null;
  }

  function getPost(id) {
    return state.postMap.get(String(id || '').split(' ')[0]) || null;
  }

  function titleFor(id) {
    var post = getPost(id);
    var monitorItem = state.monitor.items.find(function (item) { return item.id === id; });
    return post && post.titles ? post.titles.neutral : monitorItem ? monitorItem.title : id;
  }

  function importance(post, metric) {
    if (!post) return 0;
    var score = (Number(post.total) || 0) * 2;
    var fiscal = metric && metric.fiscal ? metric.fiscal : {};
    var amount = Math.max(Number(fiscal.oneOff) || 0, Number(fiscal.annual) || 0);
    if (amount >= 1000000) score += 10;
    else if (amount >= 100000) score += 5;
    score += Math.abs(Number(metric && metric.bureaucracy && metric.bureaucracy.score) || 0) * 2;
    if (metric && metric.urgency && metric.urgency.flag) score += 5;
    if (metric && Array.isArray(metric.indicators) && metric.indicators.some(function (label) {
      return /MAKSĀJUMS|NODEVA/.test(label);
    })) score += 5;
    return Math.min(100, Math.round(score));
  }

  function metricClass(value) {
    if (!isNumber(value) || value === 0) return '';
    return value > 0 ? 'up' : 'down';
  }

  function fetchJson(path, fallback) {
    return fetch(path, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error(path + ' nav pieejams');
      return response.json();
    }).catch(function () {
      return fallback;
    });
  }

  function setText(selector, value) {
    var element = $(selector);
    if (element) element.textContent = value;
  }

  function aggregate() {
    var items = state.decisions.items.filter(function (item) {
      return item.fiscal && item.fiscal.counted;
    });
    var jobs = state.decisions.items
      .map(function (item) { return item.apparatus ? item.apparatus.jobsDelta : null; })
      .filter(isNumber);
    var bureaucracyItems = state.decisions.items.filter(function (item) {
      return item.bureaucracy && isNumber(item.bureaucracy.score);
    });
    var population = state.decisions.population && state.decisions.population.value;
    return {
      itemCount: items.length,
      oneOff: sum(items.map(function (item) { return item.fiscal.oneOff; })),
      annual: sum(items.map(function (item) { return item.fiscal.annual; })),
      fiveYear: sum(items.map(function (item) { return item.fiscal.fiveYear; })),
      tenYear: sum(items.map(function (item) { return item.fiscal.tenYear; })),
      jobs: jobs.length ? sum(jobs) : null,
      jobsKnown: jobs.length,
      bureaucracy: sum(bureaucracyItems.map(function (item) { return item.bureaucracy.score; })),
      added: sum(bureaucracyItems.map(function (item) { return item.bureaucracy.requirementsAdded; })),
      removed: sum(bureaucracyItems.map(function (item) { return item.bureaucracy.requirementsRemoved; })),
      population: isNumber(population) ? population : null
    };
  }

  function renderHealth() {
    var checked = state.monitor.checked || state.agendas.checked || state.reviews.lastReview;
    var checkedDate = checked ? new Date(checked) : null;
    var hours = checkedDate && !Number.isNaN(checkedDate.getTime())
      ? (Date.now() - checkedDate.getTime()) / 3600000
      : Infinity;
    var dot = $('.live-dot');
    var errors = []
      .concat(state.monitor.errors || [])
      .concat(state.agendas.errors || []);
    if (hours <= 3 && errors.length === 0) {
      dot.classList.add('fresh');
}
    else if (hours < Infinity) {
      dot.classList.add('stale');
    } else {
      dot.classList.add('error');
    }
    setText('#system-state', checked
      ? 'Pārbaudīts ' + dateTime(checked) + ' · Europe/Riga'
      : 'Pēdējās pārbaudes laiks nav pieejams');
    var notice = $('#notice');
    if (errors.length || hours > 6 || !state.monitor.items.length) {
      notice.hidden = false;
      notice.textContent = errors.length
        ? 'Daļa avotu nav atjaunināta. Vietnē saglabāti pēdējie veiksmīgi iegūtie dati; aktuālo statusu pārbaudi TAP pirmavotā.'
        : hours > 6
          ? 'Dati nav atjaunināti vairāk nekā sešas stundas. Aktuālo statusu pārbaudi TAP pirmavotā.'
          : 'Projektu dati pašlaik nav ielādējami.';
    }
  }

  function renderMetrics() {
    var totals = aggregate();
    var posts = state.reviews.posts || [];
    var coverageTotal = Number(state.coverage.total) || posts.length;
    var important = posts.filter(function (post) {
      return importance(post, getMetric(post.id)) >= 50;
    }).length;
    setText('#annual-cost', money(totals.annual, true, true));
    setText('#annual-cost-note', 'Pārbaudītajos lēmumos; vienreizējie izdevumi atsevišķi');
    setText('#job-delta', totals.jobsKnown ? signed(totals.jobs) : '—');
    setText('#job-delta-note', totals.jobsKnown
      ? totals.jobsKnown + ' no ' + state.decisions.items.length + ' lēmumiem ir kvantificēti'
      : 'Publiskajos dokumentos vēl nav kvantificētu amata vietu');
    setText('#bureaucracy-score', signed(totals.bureaucracy));
    setText('#bureaucracy-note', '+' + totals.added + ' jaunas · −' + totals.removed + ' atceltas prasības');
    setText('#one-off-cost', money(totals.oneOff, true, false));
    setText('#per-resident', totals.population ? money(totals.oneOff / totals.population, false, false) : '—');
    setText('#reviewed-count', posts.length + ' / ' + coverageTotal);
    setText('#important-count', String(important));
    setText('#metric-scope', 'Kopsummas aptver ' + posts.length + ' no ' + coverageTotal +
      ' novērotajiem sēžu jautājumiem. Darba kārtības atzīme “Pieņemts” tiek nošķirta no vēl nepārbaudīta galīgā protokola.');
    if (state.decisions.population) {
      var source = $('#population-source');
      source.href = safeUrl(state.decisions.population.source, 'https://stat.gov.lv/');
      source.textContent = state.decisions.population.label + ': ' +
        formatInteger.format(state.decisions.population.value) + ' ↗';
    }
  }

  function topCard(number, label, item, value) {
    if (!item) {
      return [
        '<article class="top-card is-empty">',
        '<span class="top-number">', esc(number), ' / ', esc(label), '</span>',
        '<h3>Vēl nav droši nosakāms</h3>',
        '<p>Nepieciešams lielāks analizēto lēmumu pārklājums.</p>',
        '</article>'
      ].join('');
    }
    return [
      '<article class="top-card">',
      '<span class="top-number">', esc(number), ' / ', esc(label), '</span>',
      '<h3>', esc(titleFor(item.id)), '</h3>',
      '<p>', esc(value), '</p>',
      '<a href="#review-', esc(item.id), '">Atvērt lēmuma karti ↓</a>',
      '</article>'
    ].join('');
  }

  function renderTop() {
    var enriched = (state.reviews.posts || []).map(function (post) {
      return { id: post.id, post: post, metric: getMetric(post.id), score: importance(post, getMetric(post.id)) };
    });
    var highest = enriched.slice().sort(function (a, b) { return b.score - a.score; })[0] || null;
    var costly = enriched.filter(function (item) { return item.metric && item.metric.fiscal; })
      .sort(function (a, b) {
        var af = a.metric.fiscal;
        var bf = b.metric.fiscal;
        return ((bf.oneOff || 0) + (bf.annual || 0) * 5) - ((af.oneOff || 0) + (af.annual || 0) * 5);
      })[0] || null;
    if (costly && !((costly.metric.fiscal.oneOff || 0) + (costly.metric.fiscal.annual || 0))) costly = null;
    var bureauUp = enriched.filter(function (item) {
      return item.metric && item.metric.bureaucracy && item.metric.bureaucracy.score > 0;
    }).sort(function (a, b) {
      return b.metric.bureaucracy.score - a.metric.bureaucracy.score;
    })[0] || null;
    var bureauDown = enriched.filter(function (item) {
      return item.metric && item.metric.bureaucracy && item.metric.bureaucracy.score < 0;
    }).sort(function (a, b) {
      return a.metric.bureaucracy.score - b.metric.bureaucracy.score;
    })[0] || null;
    var jobsUp = enriched.filter(function (item) {
      return item.metric && item.metric.apparatus && item.metric.apparatus.jobsDelta > 0;
    }).sort(function (a, b) {
      return b.metric.apparatus.jobsDelta - a.metric.apparatus.jobsDelta;
    })[0] || null;
    $('#top-cards').innerHTML = [
      topCard('01', 'SVARĪGĀKAIS', highest, highest ? 'Sabiedriskās nozīmības score ' + highest.score + '/100' : ''),
      topCard('02', 'DĀRGĀKAIS', costly, costly ? money(costly.metric.fiscal.oneOff, true, false) + ' vienreizēji' : ''),
      topCard('03', 'BIROKRĀTIJA ↑', bureauUp, bureauUp ? 'Indekss ' + signed(bureauUp.metric.bureaucracy.score) : ''),
      topCard('04', 'BIROKRĀTIJA ↓', bureauDown, bureauDown ? 'Indekss ' + signed(bureauDown.metric.bureaucracy.score) : ''),
      topCard('05', 'AMATA VIETAS', jobsUp, jobsUp ? signed(jobsUp.metric.apparatus.jobsDelta) + ' amata vietas' : '')
    ].join('');
    setText('#top-context', enriched.length
      ? 'Rangs veidots no ' + enriched.length + ' dokumentos analizētiem jautājumiem.'
      : 'Padziļinātā atlase vēl nav pabeigta.');
  }

  function badgeHtml(label) {
    var signal = /STEIDZAMI|↑|MAKSĀJUMS|NODEVA|IEROBEŽOJUMS/.test(label);
    var positive = /↓/.test(label);
    return '<span class="badge' + (signal ? ' signal' : positive ? ' positive' : '') + '">' + esc(label) + '</span>';
  }

  function lifecycleHtml(metric) {
    var steps = ['Ideja', 'Saskaņošana', 'MK darba kārtība', 'MK lēmums', 'Saeima / spēkā', 'Ieviešana'];
    var current = metric && metric.lifecycle && isNumber(metric.lifecycle.currentStep)
      ? metric.lifecycle.currentStep : 2;
    return [
      '<div class="lifecycle">',
      '<h4>Lēmuma dzīves cikls</h4>',
      '<p>', esc(metric && metric.lifecycle ? metric.lifecycle.label : 'Aktuālā stadija vēl jāpārbauda'), '</p>',
      '<div class="lifecycle-track">',
      steps.map(function (step, index) {
        var className = index < current ? ' done' : index === current ? ' current' : '';
        return '<span class="lifecycle-step' + className + '">' + esc(step) + '</span>';
      }).join(''),
      '</div>',
      '</div>'
    ].join('');
  }

  function answerSources(answer, sources) {
    if (!Array.isArray(answer.sources) || !answer.sources.length) return '';
    return '<div>' + answer.sources.map(function (url, index) {
      var source = sources.find(function (item) { return item.url === url; });
      return '<a class="answer-source" href="' + esc(safeUrl(url)) +
        '" target="_blank" rel="noopener">' + esc(source ? source.label : 'Avots ' + (index + 1)) + ' ↗</a>';
    }).join(' · ') + '</div>';
  }

  function decisionCard(post) {
    var metric = getMetric(post.id);
    var fiscal = metric && metric.fiscal ? metric.fiscal : {};
    var bureaucracy = metric && metric.bureaucracy ? metric.bureaucracy : {};
    var apparatus = metric && metric.apparatus ? metric.apparatus : {};
    var population = state.decisions.population && state.decisions.population.value;
    var score = importance(post, metric);
    var agendaDocuments = state.agendas.documents || [];
    var changed = agendaDocuments.some(function (document) {
      return post.sourceHashes && post.sourceHashes[document.url] && document.hash &&
        document.hash !== post.sourceHashes[document.url];
    });
    var unavailable = agendaDocuments.some(function (document) {
      return post.sourceHashes && post.sourceHashes[document.url] && document.status !== 'read';
    });
    var warnings = [];
    if (changed) warnings.push('Kopš analīzes mainījusies vismaz viena avota versija.');
    if (unavailable) warnings.push('Daļu iepriekš lasīto avotu jaunākajā reizē neizdevās atvērt.');
    if (post.coverage && !post.coverage.complete) warnings.push(post.coverage.note);
    var impacts = metric && Array.isArray(metric.impacts) ? metric.impacts : [];
    var indicators = metric && Array.isArray(metric.indicators) ? metric.indicators : [];
    var perResident = population && isNumber(fiscal.oneOff) ? fiscal.oneOff / population : null;
    var jobValue = isNumber(apparatus.jobsDelta) ? signed(apparatus.jobsDelta) : '—';
    var urgency = metric && metric.urgency && metric.urgency.flag;
    var sourceUrl = metric ? metric.source : (post.sources && post.sources[0] ? post.sources[0].url : '#');

    return [
      '<article class="decision-card" id="review-', esc(post.id), '">',
      urgency ? '<div class="decision-alert"><strong>STEIDZAMI</strong><span>' + esc(metric.urgency.reason) + '</span></div>' : '',
      '<div class="decision-head">',
      '<div>',
      '<span class="eyebrow">', esc(post.id), ' · ', esc(post.ministry), '</span>',
      '<h3>', esc(post.titles.neutral), '</h3>',
      '<p class="decision-lead">', esc(post.lead), '</p>',
      '</div>',
      '<div class="decision-score"><strong>', esc(score), '<small>/100</small></strong><span>Sabiedriskā nozīmība</span></div>',
      '</div>',
      '<p class="decision-meta">Sēde ', esc(post.meetingDate), ' · ', esc(post.status), ' · Analīze ', esc(dateTime(post.analyzedAt)), '</p>',
      '<div class="badges">', indicators.map(badgeHtml).join(''), '</div>',
      '<div class="decision-metrics">',
      '<div><span>Vienreizēji valstij</span><strong>', esc(money(fiscal.oneOff, true, false)), '</strong></div>',
      '<div><span>Pastāvīgi gadā</span><strong>', esc(money(fiscal.annual, true, true)), '</strong></div>',
      '<div><span>Uz iedzīvotāju</span><strong>', esc(money(perResident, false, false)), '</strong></div>',
      '<div><span>Birokrātijas indekss</span><strong class="index-pill ', esc(metricClass(bureaucracy.score)), '">', esc(signed(bureaucracy.score)), '</strong></div>',
      '<div><span>Amata vietas</span><strong>', esc(jobValue), '</strong></div>',
      '</div>',
      '<div class="decision-summary">',
      '<div><h4>Ko valdība grib izdarīt?</h4><p>', esc(metric ? metric.summary : post.lead), '</p></div>',
      '<div><h4>Kam tas būs svarīgi?</h4><ul class="impact-list">',
      impacts.length ? impacts.map(function (impact) { return '<li>' + esc(impact) + '</li>'; }).join('') : '<li>Skartās grupas vēl tiek strukturētas</li>',
      '</ul></div>',
      '</div>',
      lifecycleHtml(metric),
      warnings.map(function (warning) { return '<p class="coverage-warning">' + esc(warning) + '</p>'; }).join(''),
      '<div class="evidence-grid">',
      (post.evidence || []).map(function (evidence) {
        var labels = {
          fact: 'Dokumentēts fakts',
          proponent: 'Iesniedzēja teiktais',
          objection: 'Institūcijas piezīme',
          analysis: 'Analītisks secinājums',
          question: 'Pārbaudāms jautājums'
        };
        return [
          '<div class="evidence-item">',
          '<span class="eyebrow">', esc(labels[evidence.kind] || evidence.kind), '</span>',
          '<p>', esc(evidence.text), '</p>',
          '<a href="', esc(safeUrl(evidence.source)), '" target="_blank" rel="noopener">Pārbaudīt avotā ↗</a>',
          '</div>'
        ].join('');
      }).join(''),
      '</div>',
      '<details>',
      '<summary>Lasīt pilno analīzi un piecus jautājumus ministram</summary>',
      '<div class="analysis-body">',
      (post.answers || []).map(function (answer) {
        return '<h4>' + esc(answer.heading) + '</h4><p>' + esc(answer.text) + '</p>' +
          answerSources(answer, post.sources || []);
      }).join(''),
      '<h4>Pieci jautājumi ministram</h4><ol>',
      (post.questions || []).map(function (question) { return '<li>' + esc(question) + '</li>'; }).join(''),
      '</ol>',
      '<p><a href="', esc(safeUrl(sourceUrl)), '" target="_blank" rel="noopener"><strong>Atvērt TAP projekta pirmavotu ↗</strong></a></p>',
      '</div>',
      '</details>',
      '<details>',
      '<summary>Kā aprēķināta nozīmība un redakcionālā prioritāte?</summary>',
      '<div class="analysis-body">',
      '<p>Sabiedriskās nozīmības score ir 0–100 prioritizēšanas rādītājs. Tas apvieno redakcionālo 0–40 vērtējumu ar dokumentētās naudas, birokrātijas, steidzamības un jauna maksājuma signāliem. Tas nav pārkāpuma varbūtības vērtējums.</p>',
      '<div class="score-table">',
      Object.keys(post.scores || {}).map(function (key) {
        var scoreItem = post.scores[key];
        var labels = {
          society: 'Sabiedrība',
          budget: 'Budžets',
          business: 'Uzņēmējdarbība',
          politics: 'Politiskā nozīme',
          rights: 'Tiesības',
          process: 'Process un steidzamība',
          integrity: 'Interešu un saimnieciskuma riski',
          attention: 'Publikācijas potenciāls'
        };
        return '<div class="score-row"><strong>' + esc(labels[key] || key) + ': ' +
          esc(scoreItem.value) + '/5</strong><p>' + esc(scoreItem.reason) +
          ' <a href="' + esc(safeUrl(scoreItem.source)) + '" target="_blank" rel="noopener">Avots ↗</a></p></div>';
      }).join(''),
      '</div>',
      '</div>',
      '</details>',
      '<details>',
      '<summary>Signāli, kuri prasa skaidrojumu</summary>',
      '<div class="analysis-body"><ul>',
      (post.redFlags || []).length ? post.redFlags.map(function (flag) {
        return '<li>' + esc(flag.text) + ' <a href="' + esc(safeUrl(flag.source)) +
          '" target="_blank" rel="noopener">Avots ↗</a></li>';
      }).join('') : '<li>Dokumentos pamatoti riska signāli nav piešķirti.</li>',
      '</ul></div>',
      '</details>',
      '<details>',
      '<summary>Kopēt sociālo tīklu ierakstu</summary>',
      '<div class="analysis-body">',
      '<blockquote id="social-', esc(post.id), '">', esc(post.social), '</blockquote>',
      '<div class="copy-row"><button class="copy-button" type="button" data-copy="social-', esc(post.id), '">Kopēt tekstu</button><span class="copy-status" role="status"></span></div>',
      '</div>',
      '</details>',
      '<details>',
      '<summary>Visi avoti</summary>',
      '<div class="analysis-body"><ul>',
      (post.sources || []).map(function (source) {
        return '<li><a href="' + esc(safeUrl(source.url)) + '" target="_blank" rel="noopener">' +
          esc(source.label) + ' ↗</a></li>';
      }).join(''),
      '</ul></div>',
      '</details>',
      '</article>'
    ].join('');
  }

  function renderPublications() {
    var posts = (state.reviews.posts || []).slice().sort(function (a, b) {
      return importance(b, getMetric(b.id)) - importance(a, getMetric(a.id));
    });
    setText('#review-health', state.reviews.lastReview
      ? 'Pēdējā analīze ' + dateTime(state.reviews.lastReview) + ' · ' + (state.reviews.coverageNote || '')
      : 'Dokumentu analīze vēl nav publicēta.');
    $('#publications').innerHTML = posts.length
      ? posts.map(decisionCard).join('')
      : '<p class="empty">Dokumentu analīze turpinās. Tukšs saraksts nenozīmē, ka darba kārtībā nav nozīmīgu jautājumu.</p>';
    renderDaily();
  }

  function renderDaily() {
    var daily = state.reviews.daily;
    if (!daily) {
      $('#daily').innerHTML = '';
      return;
    }
    $('#daily').innerHTML = [
      '<article class="daily-card">',
      '<div><span class="eyebrow">DIENAS KOPSAVILKUMS · ', esc(daily.date), '</span>',
      '<h3>Kas jauns valdības darba kārtībā?</h3>',
      '<p>', esc(daily.scope), '</p>',
      (daily.items || []).map(function (item) {
        return '<p><strong>' + esc(item.title) + '</strong> — ' + esc(item.summary) +
          ' Intereses līmenis: ' + esc(item.level) + '. <a href="' +
          esc(safeUrl(item.source)) + '" target="_blank" rel="noopener">Avots ↗</a></p>';
      }).join(''),
      '</div>',
      '<dl>',
      Object.keys(daily.highlights || {}).map(function (key) {
        return '<dt>' + esc(key) + '</dt><dd>' + esc(daily.highlights[key]) + '</dd>';
      }).join(''),
      '</dl>',
      '</article>'
    ].join('');
  }

  function renderCosts() {
    var totals = aggregate();
    var items = state.decisions.items.filter(function (item) { return item.fiscal; }).slice()
      .sort(function (a, b) {
        return ((b.fiscal.oneOff || 0) + (b.fiscal.annual || 0) * 5) -
          ((a.fiscal.oneOff || 0) + (a.fiscal.annual || 0) * 5);
      });
    var population = totals.population;
    var positive = items.filter(function (item) {
      return (item.fiscal.oneOff || 0) + (item.fiscal.annual || 0) > 0;
    });
    var max = Math.max.apply(Math, positive.map(function (item) {
      return (item.fiscal.oneOff || 0) + (item.fiscal.annual || 0) * 5;
    }).concat([1]));
    $('#cost-chart').innerHTML = positive.length
      ? '<span class="eyebrow">5 GADU FISKĀLAIS EFEKTS</span>' + positive.map(function (item) {
        var value = (item.fiscal.oneOff || 0) + (item.fiscal.annual || 0) * 5;
        return [
          '<div class="bar-row">',
          '<span class="bar-label">', esc(item.id), '</span>',
          '<span class="bar-track"><span class="bar-fill" style="width:', esc(Math.max(1, value / max * 100)), '%"></span></span>',
          '<span class="bar-value">', esc(money(value, true, false)), '</span>',
          '</div>'
        ].join('');
      }).join('')
      : '<p class="empty">Analizētajos lēmumos vēl nav kvantificētu valsts izdevumu.</p>';
    var privateCosts = items.filter(function (item) {
      return item.fiscal.privateCost && isNumber(item.fiscal.privateCost.perCaseKnown);
    });
    $('#cost-summary').innerHTML = [
      '<div><strong>', esc(money(totals.oneOff, true, false)), '</strong><span>vienreizējās saistības</span></div>',
      '<div><strong>', esc(money(totals.annual, true, true)), '</strong><span>jaunā ikgadējā izdevumu bāze</span></div>',
      '<div><strong>', esc(money(totals.fiveYear, true, false)), '</strong><span>ilustratīvais 5 gadu efekts</span></div>',
      '<div><strong>', privateCosts.length ? esc(money(privateCosts[0].fiscal.privateCost.perCaseKnown, false, false)) : '—',
      '</strong><span>', privateCosts.length ? 'identificēta uzņēmuma maksa par gadījumu; citas izmaksas var būt papildus' : 'privātā sektora izmaksas nav kvantificētas', '</span></div>'
    ].join('');
    $('#cost-table tbody').innerHTML = items.map(function (item) {
      var fiscal = item.fiscal;
      var perResident = population && isNumber(fiscal.oneOff) ? fiscal.oneOff / population : null;
      return [
        '<tr>',
        '<td><a href="#review-', esc(item.id), '">', esc(item.id), '</a><br>', esc(titleFor(item.id)),
        '<br><small>', esc(fiscal.note || ''), '</small></td>',
        '<td class="number">', esc(money(fiscal.oneOff, false, false)), '</td>',
        '<td class="number">', esc(money(fiscal.annual, false, true)), '</td>',
        '<td class="number">', esc(money(fiscal.fiveYear, false, false)), '</td>',
        '<td class="number">', esc(money(perResident, false, false)), '</td>',
        '</tr>'
      ].join('');
    }).join('') || '<tr><td colspan="5">Vēl nav kvantificētu lēmumu.</td></tr>';
  }

  function renderBureaucracy() {
    var totals = aggregate();
    var items = state.decisions.items.filter(function (item) { return item.bureaucracy; });
    var average = items.length ? totals.bureaucracy / items.length : null;
    $('#bureaucracy-summary').innerHTML = [
      '<div><strong>', esc(signed(totals.added)), '</strong><span>jaunas administratīvās prasības</span></div>',
      '<div><strong>−', esc(totals.removed), '</strong><span>atceltas prasības</span></div>',
      '<div><strong>', esc(signed(totals.added - totals.removed)), '</strong><span>neto prasību izmaiņas</span></div>',
      '<div><strong>', isNumber(average) ? esc(formatDecimal.format(average)) : '—', '</strong><span>vidējais indekss uz analizētu lēmumu</span></div>'
    ].join('');
    $('#bureaucracy-table tbody').innerHTML = items.slice().sort(function (a, b) {
      return b.bureaucracy.score - a.bureaucracy.score;
    }).map(function (item) {
      var bureaucracy = item.bureaucracy;
      return [
        '<tr>',
        '<td><a href="#review-', esc(item.id), '">', esc(item.id), '</a><br>', esc(titleFor(item.id)), '</td>',
        '<td class="number"><span class="index-pill ', esc(metricClass(bureaucracy.score)), '">', esc(signed(bureaucracy.score)), '</span></td>',
        '<td class="number">', esc(bureaucracy.requirementsAdded), '</td>',
        '<td class="number">', esc(bureaucracy.requirementsRemoved), '</td>',
        '<td>', esc(bureaucracy.explanation), ' <a href="', esc(safeUrl(bureaucracy.source)), '" target="_blank" rel="noopener">Avots ↗</a></td>',
        '</tr>'
      ].join('');
    }).join('') || '<tr><td colspan="5">Birokrātijas novērtējumi vēl nav pieejami.</td></tr>';
  }

  function renderMinistries() {
    var grouped = {};
    (state.reviews.posts || []).forEach(function (post) {
      var metric = getMetric(post.id);
      var ministry = post.ministry || 'Nav norādīta';
      if (!grouped[ministry]) {
        grouped[ministry] = {
          ministry: ministry,
          reviewed: 0,
          oneOff: 0,
          annual: 0,
          jobs: 0,
          jobsKnown: 0,
          bureaucracy: 0
        };
      }
      var row = grouped[ministry];
      row.reviewed += 1;
      if (metric && metric.fiscal) {
        row.oneOff += isNumber(metric.fiscal.oneOff) ? metric.fiscal.oneOff : 0;
        row.annual += isNumber(metric.fiscal.annual) ? metric.fiscal.annual : 0;
      }
      if (metric && metric.apparatus && isNumber(metric.apparatus.jobsDelta)) {
        row.jobs += metric.apparatus.jobsDelta;
        row.jobsKnown += 1;
      }
      if (metric && metric.bureaucracy && isNumber(metric.bureaucracy.score)) {
        row.bureaucracy += metric.bureaucracy.score;
      }
    });
    var rows = Object.keys(grouped).map(function (key) { return grouped[key]; })
      .sort(function (a, b) { return b.oneOff - a.oneOff || b.bureaucracy - a.bureaucracy; });
    $('#ministry-table tbody').innerHTML = rows.map(function (row) {
      return [
        '<tr>',
        '<td><strong>', esc(row.ministry), '</strong></td>',
        '<td class="number">', esc(row.reviewed), '</td>',
        '<td class="number">', esc(money(row.oneOff, false, false)), '</td>',
        '<td class="number">', esc(money(row.annual, false, true)), '</td>',
        '<td class="number">', row.jobsKnown ? esc(signed(row.jobs)) : '—', '</td>',
        '<td class="number"><span class="index-pill ', esc(metricClass(row.bureaucracy)), '">', esc(signed(row.bureaucracy)), '</span></td>',
        '</tr>'
      ].join('');
    }).join('') || '<tr><td colspan="6">Ministriju salīdzinājumam vēl nav datu.</td></tr>';
  }

  function renderChanges() {
    var agendas = state.agendas;
    var questionCount = (agendas.meetings || []).reduce(function (total, meeting) {
      return total + (meeting.items || []).length;
    }, 0);
    setText('#agenda-health', agendas.checked
      ? 'Pārbaudīts ' + dateTime(agendas.checked) + ' · ' + questionCount + ' sēžu jautājumi'
      : 'Darba kārtības dati nav pieejami.');
    var changes = (agendas.changes || []).slice(-16).reverse();
    $('#change-list').innerHTML = changes.length ? changes.map(function (change) {
      return [
        '<li>',
        '<time>', esc(dateTime(change.at)), '</time>',
        '<span><strong>', esc(change.id), '</strong> — ', esc(change.kind),
        change.fields ? ' · ' + esc(change.fields.join(', ')) : '', '</span>',
        '<a href="', esc(safeUrl(change.meeting)), '" target="_blank" rel="noopener">Avots ↗</a>',
        '</li>'
      ].join('');
    }).join('') : '<li><span>Izveidots sākotnējais momentuzņēmums. Izmaiņas parādīsies pēc nākamajām pārbaudēm.</span></li>';
    $('#agenda-docs').innerHTML = (agendas.meetings || []).slice(0, 4).map(function (meeting) {
      return [
        '<div class="source-meeting">',
        '<h3>', esc(meeting.date), ' · ', esc((meeting.items || []).length), ' jautājumi</h3>',
        '<p><a href="', esc(safeUrl(meeting.url)), '" target="_blank" rel="noopener">Atvērt darba kārtību ↗</a></p>',
        (meeting.items || []).map(function (item) {
          return [
            '<details class="source-question"><summary>', esc(item.id), ' · ', esc(item.status || 'Statuss nav norādīts'),
            ' · ', esc(item.title), '</summary>',
            '<p>Ziņo: ', esc(item.presenter || 'nav norādīts'), '. Sabiedrības līdzdalība: ', esc(item.participation || 'nav norādīta'), '.</p>',
            '<ul>',
            (item.documents || []).length ? item.documents.map(function (document) {
              return '<li><a href="' + esc(safeUrl(document.url)) + '" target="_blank" rel="noopener">' +
                esc(document.title) + ' ↗</a></li>';
            }).join('') : '<li>Publiskas dokumentu saites nav atrastas.</li>',
            '</ul></details>'
          ].join('');
        }).join(''),
        '</div>'
      ].join('');
    }).join('');
  }

  function populateSelect(id, values) {
    var select = $('#' + id);
    var current = select.value;
    select.querySelectorAll('option:not(:first-child)').forEach(function (option) { option.remove(); });
    values.filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'lv'); }).forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = values.indexOf(current) >= 0 ? current : '';
  }

  function projectMatchesQuick(item, metric, post) {
    if (!state.quickFilter) return true;
    if (state.quickFilter === 'reviewed') return Boolean(post);
    if (state.quickFilter === 'money') {
      return Boolean(metric && metric.fiscal &&
        ((metric.fiscal.oneOff || 0) || (metric.fiscal.annual || 0) || metric.fiscal.privateCost));
    }
    if (state.quickFilter === 'bureaucracy') {
      return Boolean(metric && metric.bureaucracy && metric.bureaucracy.score !== 0);
    }
    if (state.quickFilter === 'urgent') return Boolean(metric && metric.urgency && metric.urgency.flag);
    return true;
  }

  function renderDatabase() {
    var query = $('#search').value.toLocaleLowerCase('lv');
    var ministry = $('#ministry').value;
    var status = $('#status').value;
    var impact = $('#impact').value;
    var sortMode = $('#sort').value;
    var list = (state.monitor.items || []).filter(function (item) {
      var metric = getMetric(item.id);
      var post = getPost(item.id);
      var haystack = [item.title, item.id, item.ministry, item.type]
        .concat(metric && metric.impacts ? metric.impacts : [])
        .join(' ').toLocaleLowerCase('lv');
      return (!query || haystack.indexOf(query) >= 0) &&
        (!ministry || item.ministry === ministry) &&
        (!status || item.status === status) &&
        (!impact || (metric && metric.impacts || []).indexOf(impact) >= 0) &&
        projectMatchesQuick(item, metric, post);
    });
    list.sort(function (a, b) {
      var am = getMetric(a.id);
      var bm = getMetric(b.id);
      var ap = getPost(a.id);
      var bp = getPost(b.id);
      if (sortMode === 'cost') {
        return ((bm && bm.fiscal && bm.fiscal.oneOff) || 0) - ((am && am.fiscal && am.fiscal.oneOff) || 0) ||
          projectNumber(b) - projectNumber(a);
      }
      if (sortMode === 'bureaucracy') {
        return ((bm && bm.bureaucracy && bm.bureaucracy.score) || 0) -
          ((am && am.bureaucracy && am.bureaucracy.score) || 0) ||
          projectNumber(b) - projectNumber(a);
      }
      if (sortMode === 'newest') return projectNumber(b) - projectNumber(a);
      return importance(bp, bm) - importance(ap, am) || projectNumber(b) - projectNumber(a);
    });
    setText('#count', 'Atlasīti ' + list.length + ' no ' + (state.monitor.items || []).length + ' novērotajiem projektiem');
    $('#cards').innerHTML = list.slice(0, state.limit).map(function (item) {
      var metric = getMetric(item.id);
      var post = getPost(item.id);
      var score = post ? importance(post, metric) : null;
      var signals = [];
      if (post) signals.push('ANALĪZE');
      if (metric && metric.fiscal && ((metric.fiscal.oneOff || 0) || metric.fiscal.privateCost)) signals.push('€ IZMAKSAS');
      if (metric && metric.bureaucracy && metric.bureaucracy.score > 0) signals.push('↑ BIROKRĀTIJA');
      if (metric && metric.urgency && metric.urgency.flag) signals.push('STEIDZAMI');
      if (!signals.length) signals = (item.tags || []).filter(function (tag) { return tag !== 'Pārējie projekti'; });
      return [
        '<article class="project-card', post ? ' reviewed' : '', '">',
        '<div class="project-topline"><span>', esc(item.id), '</span><span>', post ? esc(score) + '/100' : esc(item.status || ''), '</span></div>',
        '<h3><a href="', esc(safeUrl(item.url, 'https://tapportals.mk.gov.lv/legal_acts')), '" target="_blank" rel="noopener">', esc(item.title), '</a></h3>',
        '<p class="project-ministry">', esc(item.ministry || 'Atbildīgā ministrija nav norādīta'), '</p>',
        '<div class="project-signals">', signals.map(badgeHtml).join(''), '</div>',
        '<div class="project-footer"><span>', post ? 'Dokumentos analizēts' : 'Gaida padziļinātu analīzi', '</span>',
        post ? '<a href="#review-' + esc(item.id) + '">Lēmuma karte ↓</a>' :
          '<a href="' + esc(safeUrl(item.url, 'https://tapportals.mk.gov.lv/legal_acts')) + '" target="_blank" rel="noopener">TAP ↗</a>',
        '</div>',
        '</article>'
      ].join('');
    }).join('') || '<p class="empty">Šai atlasei projektu nav. Maini meklēšanas tekstu vai filtrus.</p>';
    $('#more').hidden = list.length <= state.limit;
  }

  function setupDatabase() {
    populateSelect('ministry', Array.from(new Set((state.monitor.items || []).map(function (item) { return item.ministry; }))));
    populateSelect('status', Array.from(new Set((state.monitor.items || []).map(function (item) { return item.status; }))));
    populateSelect('impact', Array.from(new Set(state.decisions.items.reduce(function (all, item) {
      return all.concat(item.impacts || []);
    }, []))));
    ['search', 'ministry', 'status', 'impact', 'sort'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () {
        state.limit = 18;
        renderDatabase();
      });
    });
    $$('.quick-filters button').forEach(function (button) {
      button.addEventListener('click', function () {
        state.quickFilter = button.getAttribute('data-tag') || '';
        state.limit = 18;
        $$('.quick-filters button').forEach(function (candidate) {
          var active = candidate === button;
          candidate.classList.toggle('active', active);
          candidate.setAttribute('aria-pressed', String(active));
        });
        renderDatabase();
      });
    });
    $('#more').addEventListener('click', function () {
      state.limit += 18;
      renderDatabase();
    });
    renderDatabase();
  }

  function renderMeetings() {
    $('#meeting-list').innerHTML = (state.monitor.meetings || []).map(function (meeting) {
      var fields = meeting.fields || {};
      var values = Object.keys(fields).map(function (key) { return fields[key]; });
      var title = fields.Nosaukums || values.find(function (value) { return /sēde/i.test(value); }) || 'Ministru kabineta sēde';
      var date = fields.Datums || values[0] || '';
      return '<a class="meeting" href="' + esc(safeUrl(meeting.url, 'https://tapportals.mk.gov.lv/meetings/cabinet_ministers')) +
        '" target="_blank" rel="noopener"><strong>' + esc(title) + '</strong><span>' + esc(date) + ' ↗</span></a>';
    }).join('') || '<p class="empty">Sēžu saraksts pašlaik nav pieejams. Atver TAP pirmavotu.</p>';
  }

  function renderCoverage() {
    var counts = state.coverage.counts || {};
    var analyzed = (counts.reviewed || 0) + (counts.partial || 0) + (counts.below_threshold || 0);
    var needs = counts.needs_recheck || 0;
    var pending = counts.pending || 0;
    var attempted = state.coverage.documents ? state.coverage.documents.attempted : null;
    var readable = state.coverage.documents ? state.coverage.documents.readable : null;
    $('#coverage-grid').innerHTML = [
      '<div class="coverage-tile"><strong>', esc(analyzed), '</strong><span>analizēti vai zem publikācijas sliekšņa</span></div>',
      '<div class="coverage-tile"><strong>', esc(needs), '</strong><span>jāpārbauda atkārtoti</span></div>',
      '<div class="coverage-tile"><strong>', esc(pending), '</strong><span>gaida padziļinātu analīzi</span></div>',
      '<div class="coverage-tile"><strong>', isNumber(readable) ? esc(readable) + ' / ' + esc(attempted) : '—', '</strong><span>automātiski nolasīti dokumenti</span></div>'
    ].join('');
    setText('#coverage-note', state.coverage.note ||
      'Pārklājuma uzskaite vēl tiek ģenerēta. Nepārbaudītam jautājumam netiek izdomāti punkti vai summas.');
  }

  function setupGlobalEvents() {
    $('#refresh').addEventListener('click', function () { window.location.reload(); });
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-copy]');
      if (!button) return;
      var target = document.getElementById(button.getAttribute('data-copy'));
      var status = button.parentElement.querySelector('.copy-status');
      if (!target) return;
      navigator.clipboard.writeText(target.textContent).then(function () {
        status.textContent = 'Nokopēts.';
      }).catch(function () {
        status.textContent = 'Atlasiet tekstu un nokopējiet manuāli.';
      });
    });
  }

  function init() {
    Promise.all([
      fetchJson('data/monitor.json', state.monitor),
      fetchJson('data/agendas.json', state.agendas),
      fetchJson('data/reviews.json', state.reviews),
      fetchJson('data/coverage.json', state.coverage),
      fetchJson('data/decisions.json', state.decisions)
    ]).then(function (values) {
      state.monitor = values[0] || state.monitor;
      state.agendas = values[1] || state.agendas;
      state.reviews = values[2] || state.reviews;
      state.coverage = values[3] || state.coverage;
      state.decisions = values[4] || state.decisions;
      state.decisionMap = new Map((state.decisions.items || []).map(function (item) { return [item.id, item]; }));
      state.postMap = new Map((state.reviews.posts || []).map(function (post) { return [post.id, post]; }));
      renderHealth();
      renderMetrics();
      renderTop();
      renderPublications();
      renderCosts();
      renderBureaucracy();
      renderMinistries();
      renderChanges();
      renderMeetings();
      renderCoverage();
      setupDatabase();
      setupGlobalEvents();
    }).catch(function () {
      var notice = $('#notice');
      notice.hidden = false;
      notice.textContent = 'Datus neizdevās ielādēt. Atver TAP pirmavotu un mēģini vietni pārlādēt.';
      $('#publications').innerHTML = '<p class="empty">Analīzes dati pašlaik nav pieejami.</p>';
      $('#cards').innerHTML = '<p class="empty">Projektu dati pašlaik nav pieejami.</p>';
    });
  }

  init();
})();
