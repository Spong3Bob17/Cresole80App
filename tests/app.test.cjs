const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('let currentTeam'));

class Element {
  constructor() { this.children = []; this.dataset = {}; this.value = ''; this.selectedOptions = [{ text: 'Categoria' }]; this.classList = { add() {}, remove() {}, toggle() {} }; }
  set innerHTML(value) { this.content = value; this.children = []; }
  get innerHTML() { return this.content || this.textContent || ''; }
  set innerText(value) { this.textContent = value; }
  get innerText() { return this.textContent || ''; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); }
  prepend(item) { this.children.unshift(item); }
  setAttribute() {}
}
function app() {
  const nodes = new Map(), storage = new Map(), alerts = [], posted = [];
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    createElement: () => new Element(), createTextNode: text => ({ textContent: text }),
    querySelectorAll: () => []
  };
  const context = vm.createContext({ document, console, URLSearchParams, Date, Map, Set, setTimeout, clearTimeout, AbortController,
    window: { location: { search: '' }, crypto: { randomUUID: () => 'operation-test-123456' } },
    navigator: { onLine: true }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    alert: text => alerts.push(text), confirm: () => true
  });
  vm.runInContext(source, context);
  context.fetchJson = async (url, options) => { if (options?.body) posted.push(JSON.parse(options.body)); return { status: 'success' }; };
  return { context, document, nodes, storage, alerts, posted, run: code => vm.runInContext(code, context) };
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
  run("formationReady=true;formationRosterReady=true;appData={players:[{name:'Mario'},{name:'Luca'}],attendanceMap:{giorno:{Mario:'Presente'}}};matchLineups=normalizeClientLineup({tempo1:{titolari:{POR:'Mario',PUNTA:'Luca'}}});");
  document.querySelectorAll = () => [{ value: 'Mario' }]; context.renderPitch = () => {};
  context.applyCallupSelection(); assert.equal(run('matchLineups.tempo1.titolari.POR'), 'Mario'); assert.equal(run('matchLineups.tempo1.titolari.PUNTA'), undefined); assert.equal(run('appData.attendanceMap.giorno.Mario'), 'Presente');
});
