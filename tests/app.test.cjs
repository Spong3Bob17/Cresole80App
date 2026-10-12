const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('let currentTeam'));

class Element {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.value = ''; this.disabled = false;
    this.selectedOptions = [{ text: 'Categoria' }]; const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle(name, force) { const enabled = force ?? !classes.has(name); if (enabled) classes.add(name); else classes.delete(name); return enabled; } };
  }
  set innerHTML(value) { this.content = value; this.children = []; }
  get innerHTML() { return this.content || this.textContent || ''; }
  set innerText(value) { this.textContent = String(value); }
  get innerText() { return this.textContent ?? ''; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); }
  prepend(item) { this.children.unshift(item); }
  setAttribute() {}
  focus() { this.focused = true; }
  click() { if (!this.disabled) this.onclick?.(); }
}
function app() {
  const nodes = new Map(), storage = new Map(), alerts = [], posted = [];
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }),
    querySelectorAll(selector) {
      const descendants = node => (node.children || []).flatMap(child => [child, ...descendants(child)]);
      if (selector.startsWith('#callupOptions input')) return descendants(document.getElementById('callupOptions')).filter(node => node.tagName === 'INPUT' && (!selector.includes(':checked') || node.checked));
      if (selector.includes('#btnSaveLineup')) return [document.getElementById('btnSaveLineup'), ...descendants(document.getElementById('callupOptions'))].filter(node => node.tagName === 'INPUT' || node === document.getElementById('btnSaveLineup'));
      return [];
    }
  };
  const context = vm.createContext({ document, console, URLSearchParams, Date, Map, Set, setTimeout, clearTimeout, AbortController,
    window: { location: { search: '' }, crypto: { randomUUID: () => 'operation-test-123456' } },
    navigator: { onLine: true }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    alert: text => alerts.push(text), confirm: () => true
  });
  vm.runInContext(source, context);
  context.fetchJson = async (url, options) => { if (options?.body) posted.push(JSON.parse(options.body)); return { status: 'success' }; };
  const run = code => vm.runInContext(code, context);
  const clickInline = handler => { const found = [...html.matchAll(/\bonclick="([^"]+)"/g)].find(match => match[1] === handler); assert.ok(found, `Pulsante HTML presente: ${handler}`); return run(found[1]); };
  return { context, document, nodes, storage, alerts, posted, run, clickInline };
}

test('Tutti i gestori dichiarati nei pulsanti e nei selettori esistono', () => {
  const { context } = app();
  for (const match of html.matchAll(/\bon(?:click|change|input)="([A-Za-z_$][\w$]*)\(/g)) assert.equal(typeof context[match[1]], 'function', match[1]);
});

test('Le liste di convocati restringono solo la formazione e non alterano la rosa', () => {
  const { run } = app();
  run("appData.players=[{name:'Mario'},{name:'Luca'}]; matchLineups=normalizeClientLineup({convocati:['Mario']}); guestPlayers=[];");
  assert.equal(run('availableFormationPlayers().join(",")'), 'Mario'); assert.equal(run('appData.players.length'), 2);
});

test('Convocati null significa rosa intera; lista vuota significa nessun convocato', () => {
  const { run } = app(); run("appData.players=[{name:'Mario'},{name:'Luca'}]; guestPlayers=[]; matchLineups=normalizeClientLineup({});");
  assert.equal(run('availableFormationPlayers().length'), 2); run('matchLineups.convocati=[];'); assert.equal(run('availableFormationPlayers().length'), 0);
});

test('Le bozze della formazione sono distinte per categoria e gruppo', () => {
  const { context, run } = app();
  run("currentTeam='Pulcini1'; currentFormationGroup='A'; formationReady=true; formationDirty=true; loadedFormationKey=formationKey(); matchLineups=normalizeClientLineup({convocati:['Mario']});");
  context.rememberFormationDraft(); run("currentFormationGroup='B'; loadedFormationKey=formationKey(); matchLineups=normalizeClientLineup({convocati:['Luca']});"); context.rememberFormationDraft();
  assert.equal(run("formationDrafts.get('Pulcini1:A').convocati[0]"), 'Mario'); assert.equal(run("formationDrafts.get('Pulcini1:B').convocati[0]"), 'Luca');
});

test('Una formazione non modificata non conserva una bozza che nasconda aggiornamenti dal foglio', () => {
  const { context, run } = app(); run("formationReady=true; formationDirty=false; loadedFormationKey='Pulcini1:A';"); context.rememberFormationDraft(); assert.equal(run('formationDrafts.size'), 0);
});

test('Il filtro A/B del calendario non elimina gare dall’elenco completo', () => {
  const { context, document, run } = app();
  run("currentTeam='Pulcini1'; calendarGames=[{id:'a',team:'Pulcini1',group:'A',date:'14/10/2026',opponent:'Fides',venue:'Casa'},{id:'b',team:'Pulcini1',group:'B',date:'14/10/2026',opponent:'Altair',venue:'Fuori'}];");
  document.getElementById('calendarGroupFilter').value = 'B'; context.renderCalendar();
  assert.equal(document.getElementById('calendarGameList').children.length, 1); assert.equal(run('calendarGames.length'), 2);
  assert.equal(document.getElementById('calendarGameList').children[0].children[0].textContent, '2017 B');
});

test('Il salvataggio offline cattura il gruppo originale e riusa lo stesso operationId', async () => {
  const { context, storage, run } = app(); context.fetchJson = async () => { throw new Error('Connessione assente'); };
  await context.postWithOfflineQueue({ action: 'saveLineup', team: 'Pulcini1', group: 'A', lineup: { convocati: ['Mario'] } });
  const queued = JSON.parse(storage.get('cresole80_pending_actions_v1'))[0]; assert.equal(queued.payload.group, 'A'); assert.equal(queued.payload.operationId, 'operation-test-123456');
  run("currentTeam='Pulcini1'; currentFormationGroup='B';"); const sent = []; context.fetchJson = async (_, options) => { sent.push(JSON.parse(options.body)); return { status: 'success' }; };
  await context.syncOfflineQueue(); assert.equal(sent[0].group, 'A'); assert.equal(sent[0].operationId, queued.payload.operationId);
});

test('Il salvataggio della formazione invia convocati, gara e gruppo senza azioni sulle presenze', async () => {
  const { context, run, posted } = app();
  run("currentTeam='Pulcini1';currentFormationGroup='B';formationReady=true;formationRosterReady=true;formationDirty=true;loadedFormationKey=formationKey();matchLineups=normalizeClientLineup({convocati:['Luca'],gameId:'gara-b'});guestPlayers=[];");
  await context.saveLineupToServer(); assert.equal(posted[0].action, 'saveLineup'); assert.equal(posted[0].group, 'B'); assert.equal(posted[0].lineup.gameId, 'gara-b'); assert.deepEqual(posted[0].lineup.convocati, ['Luca']); assert.equal(posted.length, 1);
});

test('Una risposta della formazione A arrivata dopo il passaggio a B viene ignorata', async () => {
  const { context, run } = app(); run("currentTeam='Pulcini1';currentModule='formazioni';currentFormationGroup='A';viewRequestId=5;matchLineups=normalizeClientLineup({convocati:['Bozza B']});");
  let complete; context.fetchJson = () => new Promise(resolve => { complete = resolve; });
  const loading = context.loadModuleData(false, 5); run("currentFormationGroup='B';"); complete({ status: 'success', lineups: { convocati: ['Risposta A'] } }); await loading;
  assert.equal(run('matchLineups.convocati[0]'), 'Bozza B');
});

test('Il salvataggio è bloccato finché la rosa non è stata caricata', async () => {
  const { context, run, posted, alerts } = app(); run("formationReady=true;formationRosterReady=false;loadedFormationKey=formationKey();");
  await context.saveLineupToServer(); assert.equal(posted.length, 0); assert.ok(alerts[0].includes('Attendi'));
});

test('Applicare i convocati rimuove solo le assegnazioni escluse, senza toccare presenze', () => {
  const { context, document, run } = app();
  run("currentModule='formazioni';formationReady=true;formationRosterReady=true;loadedFormationKey=formationKey();appData={players:[{name:'Mario'},{name:'Luca'}],attendanceMap:{giorno:{Mario:'Presente'}}};matchLineups=normalizeClientLineup({tempo1:{titolari:{POR:'Mario',PUNTA:'Luca'}}});");
  context.renderPitch(); document.querySelectorAll('#callupOptions input').find(input => input.value === 'Luca').checked = false;
  context.applyCallupSelection(); context.confirmFormationAction();
  assert.equal(run('matchLineups.tempo1.titolari.POR'), 'Mario'); assert.equal(run('matchLineups.tempo1.titolari.PUNTA'), undefined); assert.equal(run('appData.attendanceMap.giorno.Mario'), 'Presente');
});

const fixtureLineup = { tempo1: { titolari: { POR: 'Mario', PUNTA: 'Luca' }, piazzati: { angoli: 'Luca' }, difesaCorner: { palo: 'Luca' }, sostituzioni: { POR: { out: 'Mario', in: 'Anna' }, legacy: null } }, tempo2: { titolari: { POR: 'Anna' } }, convocati: null };
function mockFormationApi(instance, overrides = {}) {
  instance.context.fetchJson = async (url, options) => {
    if (options?.body) { instance.posted.push(JSON.parse(options.body)); return { status: 'success' }; }
    const mode = new URL(url).searchParams.get('mode');
    if (overrides[mode]) return overrides[mode](url);
    if (mode === 'presenze') return { status: 'success', players: ['Mario','Luca','Anna','Paolo'].map(name => ({ name })), events: [], attendanceMap: { giorno: { Mario: 'Presente' } } };
    if (mode === 'formazioni') return { status: 'success', lineups: JSON.parse(JSON.stringify(fixtureLineup)) };
    if (mode === 'calendario') return { status: 'success', games: [] };
    throw new Error('Richiesta imprevista');
  };
}
async function loadedFormation() { const instance = app(); mockFormationApi(instance); await instance.context.switchView('formazioni'); return instance; }

test('Caricamento reale dei gestori e rendering: pulsanti pronti, campetto, panchina e 4 tempi', async () => {
  const { document, run } = await loadedFormation();
  assert.equal(run('formationEditable()'), true);
  assert.equal(document.getElementById('btnSaveLineup').disabled, false);
  assert.ok(document.getElementById('pitchSlotsContainer').children.length > 0);
  assert.equal(document.getElementById('tempoTabs').children.length, 4);
  assert.equal(document.querySelectorAll('#callupOptions input:checked').length, 4);
  assert.equal(document.getElementById('benchList').children.length, 2);
});

test('Le spunte resistono al cambio tempo; Applica apre la conferma interna anche con confirm del browser bloccato', async () => {
  const { context, document, run, clickInline } = await loadedFormation(); context.confirm = () => false;
  document.querySelectorAll('#callupOptions input').find(input => input.value === 'Luca').checked = false;
  document.getElementById('tempoTabs').children[1].click();
  assert.equal(document.querySelectorAll('#callupOptions input').find(input => input.value === 'Luca').checked, false);
  clickInline('applyCallupSelection()');
  assert.equal(document.getElementById('modalFormationAction').classList.contains('hidden'), false);
  assert.equal(run('matchLineups.tempo1.titolari.PUNTA'), 'Luca');
  clickInline('confirmFormationAction()');
  assert.equal(run('matchLineups.convocati.join(",")'), 'Mario,Anna,Paolo');
  assert.equal(run('matchLineups.tempo1.titolari.PUNTA'), undefined);
  assert.equal(run('matchLineups.tempo1.piazzati.angoli'), undefined);
  assert.equal(run('matchLineups.tempo1.difesaCorner.palo'), undefined);
  assert.equal(run('matchLineups.tempo1.sostituzioni.legacy'), undefined);
  assert.equal(run('appData.attendanceMap.giorno.Mario'), 'Presente');
  assert.ok(document.getElementById('formationStatus').innerText.includes('3 giocatori applicati'));
});

test('Annullare Applica conserva tutte le assegnazioni; lista vuota e rosa completa funzionano', async () => {
  const { context, run, document, clickInline } = await loadedFormation(); const before = run('JSON.stringify(matchLineups)');
  clickInline('selectCallupChecks(false)'); clickInline('applyCallupSelection()'); clickInline('closeFormationAction()');
  assert.equal(run('JSON.stringify(matchLineups)'), before);
  clickInline('applyCallupSelection()'); clickInline('confirmFormationAction()');
  assert.equal(run('availableFormationPlayers().length'), 0);
  assert.equal(document.getElementById('countBench').innerText, '0');
  assert.equal(run('Object.keys(matchLineups.tempo1.titolari).length'), 0);
  clickInline('useFullRoster()'); assert.equal(run('availableFormationPlayers().length'), 4);
  assert.equal(document.querySelectorAll('#callupOptions input:checked').length, 4);
  context.selectCallupChecks(true); context.applyCallupSelection(); assert.equal(run('matchLineups.convocati.length'), 4);
});

test('Svuota: annullamento sicuro e conferma senza dialoghi nativi; altri tempi e convocati invariati', async () => {
  const { context, run, clickInline, document } = await loadedFormation(); context.confirm = () => false;
  run("matchLineups.convocati=['Mario','Luca','Anna'];"); const other = run('JSON.stringify(matchLineups.tempo2)');
  clickInline('clearCurrentTempoFormation()'); clickInline('closeFormationAction()'); assert.equal(run('matchLineups.tempo1.titolari.POR'), 'Mario');
  clickInline('clearCurrentTempoFormation(); toggleMenu();'); clickInline('confirmFormationAction()');
  for (const field of ['titolari','piazzati','difesaCorner','sostituzioni']) assert.equal(run(`Object.keys(matchLineups.tempo1.${field}).length`), 0);
  assert.equal(run('JSON.stringify(matchLineups.tempo2)'), other); assert.equal(run('matchLineups.convocati.length'), 3);
  assert.equal(document.getElementById('countBench').innerText, '3');
});

test('Aggiungi tempo, assegna/rimuovi un titolare, prestito e salvataggio conservano le modifiche', async () => {
  const { context, run, clickInline, document, posted } = await loadedFormation();
  clickInline('addTempo(); toggleMenu();'); assert.equal(run('currentActiveTempo'), 'tempo5'); assert.equal(document.getElementById('tempoTabs').children.length, 5);
  run("currentAssignSlot='POR'"); context.assignPlayerToRole('Mario'); assert.equal(run('matchLineups.tempo5.titolari.POR'), 'Mario');
  clickInline('assignPlayerToRole(null)'); assert.equal(run('matchLineups.tempo5.titolari.POR'), undefined);
  context.openGuestPlayerModal(); document.getElementById('guestPlayerName').value = 'Ospite Prova'; context.confirmAddGuestPlayer();
  assert.equal(run('availableFormationPlayers().includes("Ospite Prova")'), true);
  await clickInline('saveLineupToServer()'); assert.equal(posted.length, 1); assert.equal(posted[0].action, 'saveLineup'); assert.ok(posted[0].lineup.tempo5); assert.deepEqual(posted[0].lineup.prestiti, ['Ospite Prova']);
});

test('Calendario lento: formazione utilizzabile appena rosa e campetto sono pronti', async () => {
  const instance = app(); let finishCalendar;
  mockFormationApi(instance, { calendario: () => new Promise(resolve => { finishCalendar = resolve; }) });
  await instance.context.switchView('formazioni');
  assert.equal(instance.run('formationEditable()'), true); instance.context.addTempo(); assert.equal(instance.run('tempoKeys().length'), 5);
  finishCalendar({ status: 'success', games: [] }); await Promise.resolve();
});

test('Rosa o formazione non valide: messaggio e retry, niente pulsanti apparentemente funzionanti', async () => {
  for (const mode of ['presenze','formazioni']) {
    const instance = app(); mockFormationApi(instance, { [mode]: async () => ({ status: 'success' }) }); await instance.context.switchView('formazioni');
    assert.equal(instance.run('formationEditable()'), false); assert.equal(instance.document.getElementById('btnSaveLineup').disabled, true);
    assert.equal(instance.document.getElementById('btnRetryFormation').classList.contains('hidden'), false);
    const before = instance.run('JSON.stringify(matchLineups)'); instance.context.addTempo(); instance.context.clearCurrentTempoFormation(); instance.context.applyCallupSelection();
    assert.equal(instance.run('JSON.stringify(matchLineups)'), before);
    mockFormationApi(instance); await instance.clickInline("switchView('formazioni')"); assert.equal(instance.run('formationEditable()'), true);
  }
});

test('Cambiare gruppo chiude la conferma e impedisce di svuotare per errore la formazione B', async () => {
  const instance = app(); instance.run("currentTeam='Pulcini1';currentFormationGroup='A';"); mockFormationApi(instance);
  await instance.context.switchView('formazioni'); instance.context.clearCurrentTempoFormation();
  await instance.context.changeFormationGroup('B'); const before = instance.run('JSON.stringify(matchLineups)'); instance.context.confirmFormationAction();
  assert.equal(instance.run('JSON.stringify(matchLineups)'), before); assert.equal(instance.run('loadedFormationKey'), 'Pulcini1:B');
});

test('Il clic sul panchinaro configura una sostituzione e lo svuotamento rimuove anche le frecce', async () => {
  const { context, document, run } = await loadedFormation();
  const benchPlayer = document.getElementById('benchList').children.find(button => button.innerText.startsWith('Paolo'));
  benchPlayer.click(); document.getElementById('modalSubstitutionOptions').children[0].click();
  assert.equal(run('matchLineups.tempo1.sostituzioni.POR.in'), 'Paolo');
  assert.equal(run('matchLineups.tempo1.sostituzioni.POR.out'), 'Mario');
  assert.ok(document.getElementById('playingTimeSummary').children.find(chip => chip.innerText.startsWith('Paolo')).innerText.includes('0.5'));
  context.clearCurrentTempoFormation(); context.confirmFormationAction();
  assert.equal(run('Object.keys(matchLineups.tempo1.sostituzioni).length'), 0);
});

test('Una vecchia risposta di caricamento non nasconde il caricamento nuovo e non sblocca i comandi', async () => {
  const instance = app(), pending = [];
  mockFormationApi(instance, { formazioni: url => new Promise(resolve => pending.push({ url, resolve })) });
  instance.run("currentTeam='Pulcini1';currentFormationGroup='A';"); const loadingA = instance.context.switchView('formazioni');
  const loadingB = instance.context.changeFormationGroup('B');
  pending[0].resolve({ status: 'success', lineups: fixtureLineup }); await loadingA;
  assert.equal(instance.document.getElementById('loadingOverlay').classList.contains('hidden'), false);
  assert.equal(instance.document.getElementById('btnSaveLineup').disabled, true);
  pending[1].resolve({ status: 'success', lineups: fixtureLineup }); await loadingB;
  assert.equal(instance.run('loadedFormationKey'), 'Pulcini1:B'); assert.equal(instance.run('formationEditable()'), true);
});

test('Formazione appena salvata e ricaricata mantiene convocati e tempo aggiuntivo', async () => {
  const instance = await loadedFormation(); instance.context.selectCallupChecks(false); instance.context.applyCallupSelection(); instance.context.confirmFormationAction();
  instance.context.addTempo(); await instance.context.saveLineupToServer();
  const saved = instance.posted[0].lineup;
  mockFormationApi(instance, { formazioni: async () => ({ status: 'success', lineups: saved }) });
  await instance.context.switchView('formazioni');
  assert.equal(instance.run('availableFormationPlayers().length'), 0); assert.equal(instance.run('tempoKeys().length'), 5);
  assert.equal(instance.document.getElementById('tempoTabs').children.length, 5);
});
