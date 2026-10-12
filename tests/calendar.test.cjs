const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../apps-script/Codice.gs'), 'utf8');
const HEADERS = ['ID', 'Squadra', 'Tipo', 'Data', 'Ora', 'Avversario', 'Campo', 'Mister', 'Risultato', 'Note', 'Gruppo'];
const game = (id, opponent, patch = {}) => Object.assign([id, 'Pulcini1', 'Campionato', '14/10/2026', '18:00', opponent, 'Casa', 'Mister Uno', 'Vinto · 1-0 | 0-0', 'Nota originale', ''], patch);

class Range {
  constructor(sheet, row, col, height = 1, width = 1) { Object.assign(this, { sheet, row, col, height, width }); }
  getValues() {
    this.sheet.reads++;
    if (this.sheet.beforeRead) this.sheet.beforeRead(this.sheet.reads);
    return Array.from({ length: this.height }, (_, r) => Array.from({ length: this.width }, (_, c) => this.sheet.values[this.row + r - 1]?.[this.col + c - 1] ?? ''));
  }
  getFormulas() { return Array.from({ length: this.height }, (_, r) => Array.from({ length: this.width }, (_, c) => this.sheet.formulas.get(`${this.row + r}:${this.col + c}`) || '')); }
  setValues(rows) {
    assert.equal(rows.length, this.height);
    assert.ok(rows.every(row => row.length === this.width), 'Ogni riga deve avere la stessa larghezza');
    this.sheet.writes++;
    rows.forEach((row, r) => row.forEach((value, c) => {
      const rr = this.row + r, cc = this.col + c;
      this.sheet.values[rr - 1] ||= [];
      this.sheet.formulas.delete(`${rr}:${cc}`);
      if (typeof value === 'string' && value.startsWith('=')) {
        this.sheet.formulas.set(`${rr}:${cc}`, value);
        value = 2;
      } else if (typeof value === 'string' && value.startsWith("'=")) value = value.slice(1);
      this.sheet.values[rr - 1][cc - 1] = value;
    }));
    return this;
  }
  getValue() { return this.getValues()[0][0]; }
  setValue(value) { return this.setValues([[value]]); }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getLastColumn() { return this.col + this.width - 1; }
  breakApart() { this.sheet.merged = false; return this; }
  merge() { throw new Error('Il calendario non deve creare nuove celle unite'); }
  clear() { throw new Error('Il calendario non deve essere svuotato prima di riscriverlo'); }
  setBackgrounds(value) { this.sheet.styles.backgrounds = value; return this; }
  setFontColors(value) { this.sheet.styles.colors = value; return this; }
  setFontWeights(value) { this.sheet.styles.weights = value; return this; }
  setFontStyle(value) { this.sheet.styles.fontStyle = value; return this; }
  setFontSize(value) { this.sheet.styles.fontSize = value; return this; }
  setFontFamily(value) { this.sheet.styles.fontFamily = value; return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
  setNumberFormat() { return this; }
  setWrap() { return this; }
  setDataValidation() { return this; }
  clearDataValidations() { return this; }
  clearContent() { return this.setValues(Array.from({ length: this.height }, () => Array(this.width).fill(''))); }
  insertCheckboxes() { return this; }
  setBackground() { return this; }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(ss, name, values) {
    Object.assign(this, { ss, name, values: values.map(row => row.slice()), formulas: new Map(), styles: {}, writes: 0, reads: 0, maxRows: 1000, maxCols: 26, merged: false });
  }
  getRange(...args) { return new Range(this, ...args); }
  getLastRow() { let n = this.values.length; while (n && this.values[n - 1].every(value => value === '' || value == null)) n--; return n; }
  getLastColumn() { return Math.max(1, ...this.values.map(row => { let n = row.length; while (n && (row[n - 1] === '' || row[n - 1] == null)) n--; return n; })); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), this.getLastColumn()); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getParent() { return this.ss; }
  getName() { return this.name; }
  hideSheet() { this.hidden = true; return this; }
  setName(name) { this.ss.sheets.delete(this.name); this.name = name; this.ss.sheets.set(name, this); return this; }
  copyTo(ss) { const copy = ss.insertSheet('Copia'); copy.values = this.values.map(row => row.slice()); return copy; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  insertColumnAfter(col) { this.values.forEach(row => row.splice(col, 0, '')); this.maxCols++; }
  deleteRow(row) { this.values.splice(row - 1, 1); }
  deleteColumn(col) { this.values.forEach(row => row.splice(col - 1, 1)); }
  setFrozenRows() {}
  hideColumns() {}
  setColumnWidth() {}
  setRowHeights() {}
  setRowHeight() {}
}

function runtime(values = [HEADERS]) {
  const properties = new Map();
  const props = {
    getProperty: key => properties.get(key) ?? null,
    setProperty: (key, value) => properties.set(key, value),
    setProperties: object => Object.entries(object).forEach(([key, value]) => properties.set(key, value)),
    getProperties: () => Object.fromEntries(properties),
    deleteProperty: key => properties.delete(key)
  };
  const ss = {
    sheets: new Map(), getSheetByName(name) { return this.sheets.get(name) || null; },
    insertSheet(name) { const sheet = new Sheet(this, name, []); this.sheets.set(name, sheet); return sheet; },
    getId: () => 'test-sheet'
  };
  const sheet = new Sheet(ss, 'Calendario', values); ss.sheets.set('Calendario', sheet);
  let nextId = 0;
  let locked = false;
  const lock = { tryLock() { if (locked) return false; locked = true; return true; }, waitLock() { if (locked) throw new Error('Busy'); locked = true; }, releaseLock() { locked = false; } };
  const validation = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return this; } };
  const context = vm.createContext({
    Date, Set, console,
    SpreadsheetApp: { getActive: () => ss, openById: () => ss, setActiveSpreadsheet() {}, flush() {}, newDataValidation: () => validation },
    PropertiesService: { getScriptProperties: () => props, getDocumentProperties: () => props },
    LockService: { getScriptLock: () => lock },
    Session: { getScriptTimeZone: () => 'Europe/Rome' },
    Utilities: {
      getUuid: () => `new-id-${++nextId}`,
      formatDate(date, _, format) { return format === 'HH:mm' ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : format === 'yyyy-MM-dd' ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`; },
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, data) => crypto.createHash('sha256').update(data).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    }
  });
  vm.runInContext(source, context);
  context.logError_ = (_, error) => { throw error; };
  return { context, sheet, ss, props, lock };
}

test('Conserva due gare della stessa categoria e data e tutti i loro dettagli', () => {
  const original = [HEADERS, game('a', 'Altair'), game('b', 'Fides', { 4: '10:00', 6: 'Fuori', 7: 'Mister Due', 8: 'Perso · 0-1', 9: 'Nota seconda gara' })];
  const { context } = runtime(original);
  const layout = context.buildCalendarLayout_(original, []);
  assert.equal(layout.gameCount, 2);
  for (const row of original.slice(1)) assert.deepEqual(Array.from(layout.rows.find(item => item[0] === row[0])), row);
});

test('Recupera righe fuori blocco e in fondo senza cancellare le copie esistenti', () => {
  const original = [HEADERS, ['', 'Pulcini1 — CALENDARIO GARE'], game('a', 'Fides'), [], ['', 'Piccoli Amici — CALENDARIO GARE'], game('b', 'Fides'), game('c', 'Altair', { 1: 'Esordienti2' })];
  const { context } = runtime(original);
  const layout = context.buildCalendarLayout_(original, []);
  assert.equal(layout.gameCount, 3);
  const index = layout.rows.findIndex(row => row[0] === 'c');
  assert.equal(layout.rows[index - 1][1], 'Esordienti2 — CALENDARIO GARE');
});

test('Il layout è idempotente e conserva due righe vuote tra i blocchi', () => {
  const { context } = runtime();
  const first = context.buildCalendarLayout_([HEADERS, game('a', 'Fides')], []);
  const second = context.buildCalendarLayout_(first.rows, []);
  assert.equal(JSON.stringify(first.rows), JSON.stringify(second.rows));
  for (let i = 0; i < first.kinds.length; i++) if (first.kinds[i] === 'team' && i > 1) assert.deepEqual(Array.from(first.kinds.slice(i - 2, i)), ['blank', 'blank']);
});

test('Ordina per data e ora anche eventi inseriti dopo e di tipi diversi', () => {
  const original = [HEADERS,
    game('tardi', 'Altair', { 2: 'Campionato', 3: '21/10/2026' }),
    game('prima', 'Fides', { 2: 'Amichevole', 3: '14/10/2026', 4: '10:00' }),
    game('seconda', 'Viatek', { 2: 'Torneo', 3: '14/10/2026', 4: '18:00' })
  ];
  const { context } = runtime();
  const layout = context.buildCalendarLayout_(original, []);
  assert.deepEqual(Array.from(layout.rows.filter(context.isCalendarGameRow_).map(row => row[0])), ['prima', 'seconda', 'tardi']);
});

test('Conserva righe incomplete, colonne aggiuntive e formule', () => {
  const original = [[...HEADERS, 'Dato aggiuntivo'], [...game('a', 'Fides'), 'Da conservare'], ['', 'Pulcini2', '', '', '', 'Avversario da completare']];
  const formulas = [[], Array(11).fill(''), []]; formulas[1][9] = '=1+1';
  const { context } = runtime(original);
  const layout = context.buildCalendarLayout_(original, formulas);
  assert.equal(layout.incompleteCount, 1);
  const saved = layout.rows.find(row => row[0] === 'a');
  assert.equal(saved[11], 'Da conservare'); assert.equal(saved[9], '=1+1');
  assert.ok(layout.rows.some(row => row[5] === 'Avversario da completare'));
});

test('Una formula con risultato vuoto non viene eliminata come riga vuota', () => {
  const { context } = runtime();
  const formulas = [[], Array(10).fill('')]; formulas[1][9] = '=IF(TRUE;"";"x")';
  const layout = context.buildCalendarLayout_([HEADERS, Array(10).fill('')], formulas);
  assert.equal(layout.incompleteCount, 1);
});

test('La copia manuale di una riga riceve un ID distinto senza perdere dati', () => {
  const { context } = runtime();
  const layout = context.buildCalendarLayout_([HEADERS, game('copiato', 'Altair'), game('copiato', 'Fides')], []);
  const games = layout.rows.filter(context.isCalendarGameRow_);
  assert.equal(new Set(games.map(row => row[0])).size, 2);
  assert.deepEqual(Array.from(games, row => row[5]).sort(), ['Altair', 'Fides']);
});

test('Il riordino usa una sola scrittura dei contenuti e fa un backup preventivo', () => {
  const original = [HEADERS, game('a', 'Fides'), game('b', 'Altair')];
  const { context, sheet, ss } = runtime(original);
  const result = context.formatCalendar_(sheet);
  assert.equal(result.games, 2); assert.equal(sheet.writes, 1);
  const backup = [...ss.sheets.values()].find(item => item.name.startsWith('Backup_Calendario_'));
  assert.ok(backup?.hidden); assert.deepEqual(backup.values.slice(0, 3), original);
  context.formatCalendar_(sheet);
  assert.equal(sheet.writes, 1, 'Il secondo riordino non riscrive dati già ordinati');
});

test('Formule e note che iniziano con uguale sono conservate anche dopo riordini ripetuti', () => {
  const { context, sheet, ss } = runtime([HEADERS, game('a', 'Fides', { 9: '=testo libero' }), game('b', 'Altair')]);
  sheet.formulas.set('3:10', '=1+1'); sheet.values[2][9] = 2;
  context.formatCalendar_(sheet);
  const savedRow = sheet.values.findIndex(row => row[0] === 'a');
  assert.equal(sheet.values[savedRow][9], '=testo libero');
  assert.equal(sheet.formulas.get(`${savedRow + 1}:10`), undefined);
  const formulaRow = sheet.values.findIndex(row => row[0] === 'b');
  assert.equal(sheet.formulas.get(`${formulaRow + 1}:10`), '=1+1');
  const backup = [...ss.sheets.values()].find(item => item.name.startsWith('Backup_Calendario_'));
  assert.equal(backup.values[1][9], '=testo libero'); assert.equal(backup.formulas.get('2:10'), undefined);
  const writes = sheet.writes; context.formatCalendar_(sheet); assert.equal(sheet.writes, writes);
});

test('Se una persona modifica il foglio durante il riordino, la riscrittura si ferma', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Fides')]);
  sheet.beforeRead = count => { if (count === 2) sheet.values[1][9] = 'Nota appena modificata'; };
  assert.throws(() => context.formatCalendar_(sheet), /modificato durante/);
  assert.equal(sheet.writes, 0); assert.equal(sheet.values[1][9], 'Nota appena modificata');
});

test('Non riordina durante la compilazione manuale recente', () => {
  const { context, sheet, props } = runtime([HEADERS, game('a', 'Fides')]);
  props.setProperty('c80_calendar_edited', String(Date.now()));
  assert.equal(context.formatCalendar_(sheet).deferred, true); assert.equal(sheet.writes, 0);
});

test('La lettura del calendario dall’app non scrive, non crea ID e non formatta', () => {
  const { context, sheet } = runtime([HEADERS, game('', 'Fides'), game('b', 'Altair')]);
  context.getPlayerNames_ = () => [];
  assert.equal(context.getGames_('Pulcini1').games.length, 2); assert.equal(sheet.writes, 0);
});

test('Le intestazioni non riconosciute fermano il riordino prima di ogni scrittura', () => {
  const brokenHeaders = HEADERS.slice(); brokenHeaders[3] = 'Colonna rinominata';
  const { context, sheet } = runtime([brokenHeaders, game('a', 'Fides')]);
  assert.throws(() => context.formatCalendar_(sheet), /Intestazioni/); assert.equal(sheet.writes, 0);
});

test('La sincronizzazione ripetuta non aggiunge altre bozze per la stessa data', () => {
  const { context, sheet } = runtime([HEADERS]);
  assert.equal(context.appendCalendarEventForSync_(sheet, 'Pulcini1', new Date(2026, 9, 14), 'Campionato'), true);
  assert.equal(context.appendCalendarEventForSync_(sheet, 'Pulcini1', new Date(2026, 9, 14), 'Campionato'), false);
  assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 1);
});

test('Un nuovo evento conserva risultati e note di tutte le gare esistenti', () => {
  const a = game('a', 'Altair'), b = game('b', 'Fides');
  const { context, sheet } = runtime([HEADERS, a, b]);
  context.appendCalendarEventForSync_(sheet, 'Esordienti2', new Date(2026, 9, 20), 'Torneo');
  context.formatCalendar_(sheet);
  assert.deepEqual(sheet.values.find(row => row[0] === 'a'), a);
  assert.deepEqual(sheet.values.find(row => row[0] === 'b'), b);
});

test('Il salvataggio di una nuova gara non modifica la gara già presente', () => {
  const original = game('a', 'Altair');
  const { context, sheet } = runtime([HEADERS, original]);
  context.validateCoaches_ = list => list; context.syncCalendarEvent_ = () => {};
  context.saveGame_('Pulcini1', { date: '2026-10-14', time: '18:00', opponent: 'Fides', type: 'Campionato', coaches: ['Mister Due'] });
  assert.deepEqual(sheet.values.find(row => row[0] === 'a'), original);
  assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 2);
});

test('Un ID inesistente non crea una copia di una gara che si voleva modificare', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Altair')]);
  context.validateCoaches_ = list => list;
  assert.throws(() => context.saveGame_('Pulcini1', { id: 'non-esiste', date: '2026-10-14', opponent: 'Fides', coaches: [] }), /Gara non trovata/);
  assert.equal(sheet.writes, 0);
});

test('Il risultato modifica solo la gara selezionata quando ci sono due gare nello stesso giorno', () => {
  const a = game('a', 'Altair'), b = game('b', 'Fides');
  const { context, sheet } = runtime([HEADERS, a, b]);
  context.saveGameResult_('Pulcini1', { id: 'b', periods: [{ team: 0, opponent: 1 }], note: 'Nuova nota' });
  assert.deepEqual(sheet.values.find(row => row[0] === 'a'), a);
  const edited = sheet.values.find(row => row[0] === 'b');
  assert.equal(edited[8], 'Perso · 0-1'); assert.equal(edited[9], 'Nuova nota');
});

test('Il risultato senza ID si ferma se il collegamento della gara è ambiguo', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Fides'), game('b', 'Fides')]);
  assert.throws(() => context.saveGameResult_('Pulcini1', { date: '2026-10-14', opponent: 'Fides', periods: [{ team: 1, opponent: 0 }] }), /Più gare/);
  assert.equal(sheet.writes, 0);
});

test('L’anteprima riconosce le gare concomitanti e indica la categoria reale', () => {
  const { context } = runtime(); const plan = { duplicates: [] };
  context.collectDuplicateSyncKeys_({ 'Pulcini1|2026-10-14|Campionato': 2 }, 'Calendario', 'Calendario', plan);
  assert.equal(plan.duplicates[0].team, 'Pulcini1'); assert.equal(plan.duplicates[0].informational, true);
});

test('La modifica di celle nel Calendario accoda la manutenzione senza spostare righe', () => {
  const { context, sheet, props } = runtime([HEADERS, game('a', 'Fides')]);
  context.onEdit({ range: sheet.getRange(2, 6) });
  assert.ok(props.getProperty('c80_calendar_edited')); assert.equal(sheet.writes, 0);
});

test('La manutenzione sincronizza e ordina una gara manuale senza aprire l’app', () => {
  const { context, sheet, props } = runtime([HEADERS, game('', 'Fides'), game('b', 'Altair')]);
  props.setProperty('c80_spreadsheet_id', 'test-sheet');
  const synced = []; context.readTeamEventsForSync_ = () => []; context.ensureEventColumn_ = (...args) => synced.push(args); context.ensureStaffEvent_ = () => {};
  context.maintainCalendar();
  assert.equal(synced.length, 1, 'Le presenze conservano un evento per categoria/data/tipo');
  assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 2);
  assert.ok(sheet.values.filter(context.isCalendarGameRow_).every(row => row[0]));
  const writes = sheet.writes; context.maintainCalendar(); assert.equal(sheet.writes, writes);
});

test('La manutenzione accodata è idempotente anche dopo modifiche manuali e salvataggi dell’app', () => {
  const { context, sheet, props } = runtime([HEADERS, game('a', 'Fides')]);
  props.setProperty('c80_spreadsheet_id', 'test-sheet');
  const past = String(Date.now() - 120000); props.setProperty('c80_calendar_edited', past);
  context.formatCalendar_(sheet);
  const synced = []; context.readTeamEventsForSync_ = () => []; context.ensureEventColumn_ = (...args) => synced.push(args); context.ensureStaffEvent_ = () => {};
  context.maintainCalendar(); assert.equal(synced.length, 1);
  assert.equal(props.getProperty('c80_calendar_synced_stamp'), past);
});

test('La manutenzione si ferma se un altro salvataggio ha già preso il lock', () => {
  const { context, sheet, props, lock } = runtime([HEADERS, game('a', 'Fides')]);
  props.setProperty('c80_spreadsheet_id', 'test-sheet'); lock.waitLock();
  context.maintainCalendar(); assert.equal(sheet.writes, 0); lock.releaseLock();
});

test('Un incolla su più colonne delle presenze accoda tutti gli eventi validi', () => {
  const { context, ss, props } = runtime();
  const attendance = new Sheet(ss, 'Pulcini1', [['Atleta', '14/10/2026', '15/10/2026'], ['Tipo', 'Campionato', 'Allenamento']]);
  context.onEdit({ range: attendance.getRange(1, 2, 2, 2) });
  assert.equal(Object.keys(props.getProperties()).filter(key => key.startsWith('c80_event_queue_')).length, 2);
  assert.equal(attendance.writes, 0);
});

test('Uniforma carattere, dimensione e colori per ogni tipo di evento', () => {
  const { context, sheet } = runtime([HEADERS,
    game('campionato', 'Fides'),
    game('amichevole', 'Altair', { 2: 'Amichevole', 8: 'Perso · 0-1' }),
    game('torneo', 'Viatek', { 2: 'Torneo', 8: 'Pareggiato · 0-0' })
  ]);
  context.formatCalendar_(sheet);
  assert.equal(sheet.styles.fontStyle, 'normal'); assert.equal(sheet.styles.fontFamily, 'Arial'); assert.equal(sheet.styles.fontSize, 10);
  for (const [id, typeColor, resultColor] of [['campionato', '#ede9fe', '#dcfce7'], ['amichevole', '#fce7f3', '#fee2e2'], ['torneo', '#fef3c7', '#fef3c7']]) {
    const index = sheet.values.findIndex(row => row[0] === id);
    assert.equal(sheet.styles.backgrounds[index][2], typeColor); assert.equal(sheet.styles.backgrounds[index][8], resultColor);
    assert.equal(sheet.styles.weights[index][2], 'normal');
  }
});

test('La sincronizzazione automatica evita scritture quando gli eventi sono già presenti', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Fides'), game('b', 'Altair')]);
  const date = new Date(2026, 9, 14); let reads = 0;
  context.readTeamEventsForSync_ = team => { reads++; return [{ team, date, type: 'Campionato' }]; };
  context.ensureEventColumn_ = () => { throw new Error('Non deve modificare presenze già allineate'); };
  context.ensureStaffEvent_ = () => { throw new Error('Non deve modificare Allenatori già allineati'); };
  context.syncCalendarRowsToAttendance_(sheet);
  assert.equal(reads, 2, 'Una lettura per categoria più una per Allenatori');
});

test('L’attivazione ripetuta non moltiplica trigger o copie iniziali', () => {
  const { context, ss, sheet } = runtime([HEADERS, game('a', 'Fides')]);
  const triggers = [];
  context.SpreadsheetApp.getUi = () => ({ alert() {}, ButtonSet: { OK: 'ok' } });
  context.ScriptApp = {
    getProjectTriggers: () => triggers,
    newTrigger(name) {
      const builder = { timeBased: () => builder, everyMinutes: () => builder, forSpreadsheet: () => builder, onChange: () => builder, create: () => triggers.push({ getHandlerFunction: () => name }) };
      return builder;
    }
  };
  context.setupCalendarMaintenance();
  const initial = ss.getSheetByName('Backup_Calendario_Iniziale');
  assert.ok(initial?.hidden); assert.deepEqual(initial.values[1], game('a', 'Fides'));
  context.setupCalendarMaintenance();
  assert.equal(triggers.length, 2); assert.equal(ss.getSheetByName('Backup_Calendario_Iniziale'), initial);
  assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 1);
});

test('Un calendario grande viene riordinato conservando ogni risultato e nota', () => {
  const records = Array.from({ length: 250 }, (_, index) => game(`id-${index}`, `Avversario ${index}`, {
    1: ['Esordienti2', 'Pulcini2', 'Pulcini1', 'Primi_Calci', 'Piccoli_Amici'][index % 5],
    2: ['Campionato', 'Amichevole', 'Torneo'][index % 3],
    3: new Date(2026, 9, index % 28 + 1), 9: `Nota ${index}`
  }));
  const { context, sheet } = runtime([HEADERS, ...records.slice().reverse()]);
  const result = context.formatCalendar_(sheet); assert.equal(result.games, 250);
  for (const original of records) assert.deepEqual(sheet.values.find(row => row[0] === original[0]), original);
  const writes = sheet.writes; context.formatCalendar_(sheet); assert.equal(sheet.writes, writes);
});

test('Una gara manuale senza ID si può modificare dall’app senza creare un duplicato', () => {
  const { context, sheet } = runtime([HEADERS, game('', 'Fides')]);
  context.getPlayerNames_ = () => []; context.validateCoaches_ = list => list; context.syncCalendarEvent_ = () => {};
  const selected = context.getGames_('Pulcini1').games[0]; assert.ok(selected.id.startsWith('pending:'));
  // Il riordino avviene dopo aver aperto il form: il riferimento resta valido.
  context.formatCalendar_(sheet);
  context.saveGame_('Pulcini1', { id: selected.id, date: '2026-10-14', opponent: 'Altair', coaches: [], time: '10:00' });
  const games = sheet.values.filter(context.isCalendarGameRow_); assert.equal(games.length, 1); assert.equal(games[0][5], 'Altair'); assert.equal(games[0][9], 'Nota originale');
});

test('Il riferimento di una copia con ID ripetuto identifica la partita corretta dopo il riordino', () => {
  const { context, sheet } = runtime([HEADERS, game('stesso-id', 'Altair'), game('stesso-id', 'Fides')]);
  context.getPlayerNames_ = () => [];
  const selected = context.getGames_('Pulcini1').games.find(row => row.opponent === 'Fides');
  context.formatCalendar_(sheet);
  context.saveGameResult_('Pulcini1', { id: selected.id, periods: [{ team: 0, opponent: 0 }], note: 'Nota Fides aggiornata' });
  assert.equal(sheet.values.find(row => row[5] === 'Altair')[9], 'Nota originale');
  assert.equal(sheet.values.find(row => row[5] === 'Fides')[9], 'Nota Fides aggiornata');
});

test('A e B mantengono gare indipendenti anche con stesso giorno, ora e avversario', () => {
  const { context, sheet } = runtime(); context.validateCoaches_ = list => list; context.syncCalendarEvent_ = () => {};
  const payload = { date: '2026-10-14', time: '18:00', opponent: 'Fides', type: 'Campionato', coaches: [] };
  context.saveGame_('Pulcini1', { ...payload, group: 'A' }); context.saveGame_('Pulcini1', { ...payload, group: 'B' });
  const rows = sheet.values.filter(context.isCalendarGameRow_); assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row[10]).sort(), ['A', 'B']);
});

test('La creazione ripetuta della stessa gara non aggiunge copie né sovrascrive note o risultati', () => {
  const original = game('a', 'Fides', { 10: 'A' }); const { context, sheet } = runtime([HEADERS, original]);
  context.validateCoaches_ = list => list; context.syncCalendarEvent_ = () => {};
  const result = context.saveGame_('Pulcini1', { group: 'A', date: '2026-10-14', time: '18:00', opponent: '  fides  ', type: 'campionato', coaches: [] });
  assert.equal(result.alreadyExists, true); assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 1); assert.deepEqual(sheet.values[1], original);
});

test('La conversione del vecchio calendario conserva gare, ID, risultato e nota, senza indovinare A/B', () => {
  const original = game('vecchio', 'Fides').slice(0, 10), headers = HEADERS.slice(0, 10);
  const { context, sheet } = runtime([headers, original]); context.formatCalendar_(sheet);
  const converted = sheet.values.find(row => row[0] === 'vecchio'); assert.deepEqual(converted.slice(0, 10), original); assert.equal(converted[10], '');
});

test('Le vecchie colonne personalizzate K e successive vengono conservate nella migrazione', () => {
  const old = [...game('a', 'Fides').slice(0, 10), 'Informazione importante'];
  const { context, sheet } = runtime([[...HEADERS.slice(0, 10), 'Colonna personale'], old]);
  context.getPlayerNames_ = () => []; assert.equal(context.getGames_('Pulcini1').games[0].group, '');
  context.getCalendar_(); context.formatCalendar_(sheet);
  assert.equal(sheet.values.find(row => row[0] === 'a')[11], 'Informazione importante'); assert.equal(sheet.values[0][11], 'Colonna personale');
});

test('Accetta Pulcini1A/B nel calendario e mantiene condivisa la categoria Pulcini1', () => {
  const { context } = runtime();
  const layout = context.buildCalendarLayout_([HEADERS, game('a', 'Fides', { 1: 'Pulcini1A' }), game('b', 'Altair', { 1: 'Pulcini1B' })], []);
  const a = layout.rows.find(row => row[0] === 'a'), b = layout.rows.find(row => row[0] === 'b');
  assert.equal(a[1], 'Pulcini1'); assert.equal(a[10], 'A'); assert.equal(b[10], 'B');
});

test('Una gara manuale minuscola è riconosciuta e non produce una bozza di copia', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Fides', { 2: 'amichevole' })]);
  assert.equal(context.appendCalendarEventForSync_(sheet, 'Pulcini1', new Date(2026, 9, 14), 'Amichevole'), false);
  context.formatCalendar_(sheet); assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 1); assert.equal(sheet.values.find(row => row[0] === 'a')[2], 'Amichevole');
});

test('Le presenze giornaliere non si duplicano per A/B o per maiuscole diverse', () => {
  const { context, ss } = runtime();
  const attendance = new Sheet(ss, 'Pulcini1', [['Atleta', '14/10/2026', 'Tot. P'], ['Tipo', 'amichevole', 'Riepilogo'], ['Mario', 'Presente'], ['Assenti', 0]]); ss.sheets.set('Pulcini1', attendance);
  const col = context.ensureEventColumn_('Pulcini1', new Date(2026, 9, 14), 'Amichevole'); assert.equal(col, 2);
  context.ensureEventColumn_('Pulcini1', new Date(2026, 9, 14), 'Campionato'); assert.equal(attendance.values[1][1], 'Campionato'); assert.equal(attendance.values[2][1], 'Presente'); assert.equal(attendance.values[0].length, 3);
});

test('In presenza di una vecchia copia vuota usa la colonna con presenze già registrate', () => {
  const { context, ss } = runtime();
  const attendance = new Sheet(ss, 'Pulcini1', [['Atleta', '14/10/2026', '14/10/2026', 'Tot. P'], ['Tipo', 'amichevole', 'Amichevole', 'Riepilogo'], ['Mario', 'Presente', ''], ['Assenti', 0, 0]]); ss.sheets.set('Pulcini1', attendance);
  assert.equal(context.ensureEventColumn_('Pulcini1', new Date(2026, 9, 14), 'Amichevole'), 2); assert.equal(attendance.values[2][1], 'Presente');
});

test('Il token dello stesso salvataggio riutilizza la risposta e non esegue di nuovo la scrittura', () => {
  const { context, sheet } = runtime(); context.validateCoaches_ = list => list; context.syncCalendarEvent_ = () => {}; context.json_ = value => value;
  const data = { operationId: 'salvataggio-1234', action: 'saveGame', team: 'Pulcini1', group: 'A', date: '2026-10-14', opponent: 'Fides', coaches: [] };
  const first = context.doPost({ postData: { contents: JSON.stringify(data) } }); const writes = sheet.writes;
  const second = context.doPost({ postData: { contents: JSON.stringify(data) } }); assert.equal(second.id, first.id); assert.equal(sheet.writes, writes);
});

test('Un token riutilizzato con dati diversi viene rifiutato', () => {
  const { context } = runtime(); const data = { operationId: 'salvataggio-1234', action: 'saveGame', team: 'Pulcini1' };
  context.rememberCompletedOperation_(data, { status: 'success' }); assert.throws(() => context.readCompletedOperation_({ ...data, team: 'Pulcini2' }), /dati diversi/);
});

test('La riparazione propone soltanto copie esatte; A/B e note diverse sono conservate', () => {
  const { context } = runtime([HEADERS, game('a', 'Fides', { 10: 'A' }), game('copia', 'Fides', { 10: 'A' }), game('b', 'Fides', { 10: 'B' }), game('nota', 'Fides', { 10: 'A', 9: 'Informazione diversa' })]);
  const plan = context.buildDuplicateRepairPlan_(); assert.equal(plan.calendar.length, 1); assert.equal(plan.calendar[0].row, 3); assert.equal(plan.manual.length, 1);
});

test('La riparazione delle presenze propone solo la colonna vuota, conservando quella compilata', () => {
  const { context, ss } = runtime();
  const attendance = new Sheet(ss, 'Pulcini2', [['Atleta', '21/10/2026', '21/10/2026', 'Tot. P'], ['Tipo', 'Campionato', 'campionato', 'Riepilogo'], ['Mario', 'Presente', ''], ['Assenti', 0, 0]]); ss.sheets.set('Pulcini2', attendance);
  const plan = context.buildDuplicateRepairPlan_(); assert.equal(plan.attendance.length, 1); assert.equal(plan.attendance[0].col, 3); assert.equal(plan.attendance[0].keep, 2);
  attendance.values[2][2] = 'Assente'; const populated = context.buildDuplicateRepairPlan_(); assert.equal(populated.attendance.length, 0); assert.equal(populated.manual.length, 1);
});

test('La riparazione non cancella una colonna apparentemente vuota con formule sugli atleti', () => {
  const { context, ss } = runtime();
  const attendance = new Sheet(ss, 'Pulcini2', [['Atleta', '21/10/2026', '21/10/2026', 'Tot. P'], ['Tipo', 'Campionato', 'Campionato'], ['Mario', 'Presente', ''], ['Assenti', 0, 0]]); attendance.formulas.set('3:3', '=IF(TRUE;"";"x")'); ss.sheets.set('Pulcini2', attendance);
  assert.equal(context.buildDuplicateRepairPlan_().attendance.length, 0);
});

test('Convocati: solo la lista selezionata è utilizzabile nella formazione', () => {
  const { context } = runtime(); const lineup = context.normalizeLineup_('Pulcini1', { convocati: ['Mario'], tempo1: { titolari: { POR: 'Luca' } } });
  assert.throws(() => context.validateLineup_(lineup, lineup.convocati), /Atleta non valido/);
});

test('Le formazioni A/B e quella precedente hanno nomi distinti e fissi', () => {
  const { context } = runtime(); assert.equal(context.lineupSheetName_('Pulcini1', 'A'), 'Formazioni_Pulcini1_A'); assert.equal(context.lineupSheetName_('Pulcini1', 'B'), 'Formazioni_Pulcini1_B'); assert.equal(context.lineupSheetName_('Pulcini1', ''), 'Formazioni_Pulcini1');
});

test('Salvare convocati e formazione A non modifica B, presenze, calendario o rosa', () => {
  const { context, sheet, ss, props } = runtime([HEADERS, game('gara-a', 'Fides', { 10: 'A' })]);
  const attendance = new Sheet(ss, 'Pulcini1', [['Atleta', '14/10/2026', 'Tot. P'], ['Tipo', 'Campionato'], ['Mario', 'Presente'], ['Luca', 'Assente'], ['Assenti', 1]]); ss.sheets.set('Pulcini1', attendance);
  const before = JSON.stringify(attendance.values), games = JSON.stringify(sheet.values); context.getPlayerNames_ = () => ['Mario', 'Luca'];
  context.drawLineup_ = (target, lineup) => props.setProperty('lineup_' + target.name, JSON.stringify(lineup));
  props.setProperty('lineup_Formazioni_Pulcini1_B', JSON.stringify({ convocati: ['Luca'] }));
  context.saveLineup_('Pulcini1', { group: 'A', lineup: { gameId: 'gara-a', convocati: ['Mario'], tempo1: { titolari: { POR: 'Mario' } } } });
  assert.equal(JSON.stringify(attendance.values), before); assert.equal(JSON.stringify(sheet.values), games); assert.equal(JSON.parse(props.getProperty('lineup_Formazioni_Pulcini1_B')).convocati[0], 'Luca');
  assert.equal(JSON.parse(props.getProperty('lineup_Formazioni_Pulcini1_A')).convocati[0], 'Mario'); assert.ok(ss.getSheetByName('Formazioni_Pulcini1_A'));
});

test('Le checkbox dei convocati nel foglio vengono lette anche dall’app', () => {
  const { context, ss } = runtime(); const formation = ss.insertSheet('Formazioni_Pulcini1_A');
  context.writeLineupRoster_(formation, { convocati: ['Mario'], prestiti: [] }, ['Mario', 'Luca'], 'Pulcini1', 'A');
  formation.values[2][23] = false; formation.values[3][23] = true;
  const loaded = context.readLineup_('Pulcini1', 'A'); assert.deepEqual(Array.from(loaded.convocati), ['Luca']);
});

test('La formazione A non può collegarsi a una gara B', () => {
  const { context } = runtime([HEADERS, game('gara-b', 'Fides', { 10: 'B' })]); context.getPlayerNames_ = () => ['Mario'];
  assert.throws(() => context.saveLineup_('Pulcini1', { group: 'A', lineup: { gameId: 'gara-b', convocati: ['Mario'] } }), /altra squadra/);
});

test('La creazione di un Calendario nuovo usa undici colonne coerenti con le intestazioni', () => {
  const { context, ss } = runtime(); ss.sheets.delete('Calendario'); const created = context.getCalendar_(); assert.deepEqual(Array.from(created.values[0]), HEADERS);
});

test('Un gruppo errato su un’altra categoria conserva la riga senza bloccare tutte le gare', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Fides', { 10: 'A' }), game('errore', 'Altair', { 1: 'Pulcini2', 10: 'A' })]);
  context.getPlayerNames_ = () => []; assert.equal(context.getGames_('Allenatori').games.length, 1);
  const layout = context.buildCalendarLayout_(sheet.values, []); assert.equal(layout.incompleteCount, 1); assert.ok(layout.rows.some(row => row[0] === 'errore'));
});

test('Le checkbox nel foglio formazione accodano solo il refresh della formazione corretta', () => {
  const { context, ss, props } = runtime(); const sheet = ss.insertSheet('Formazioni_Pulcini1_B');
  context.onEdit({ range: sheet.getRange(3, 24) });
  const queued = JSON.parse(props.getProperty('c80_lineup_roster_Formazioni_Pulcini1_B')); assert.equal(queued.team, 'Pulcini1'); assert.equal(queued.group, 'B');
  assert.equal(Object.keys(props.getProperties()).filter(key => key.startsWith('c80_event_queue_')).length, 0);
});

test('La riparazione conserva copie con formule differenti anche se mostrano lo stesso risultato', () => {
  const { context, sheet } = runtime([HEADERS, game('a', 'Fides'), game('b', 'Fides')]);
  sheet.formulas.set('2:10', '=1+1'); sheet.formulas.set('3:10', '=2'); sheet.values[1][9] = 2; sheet.values[2][9] = 2;
  const plan = context.buildDuplicateRepairPlan_(); assert.equal(plan.calendar.length, 0); assert.equal(plan.manual.length, 1);
});

test('Una colonna inizialmente vuota non è più eliminabile se vengono inserite presenze', () => {
  const { context, ss } = runtime(); const attendance = new Sheet(ss, 'Pulcini2', [['Atleta', '21/10/2026', '21/10/2026', 'Tot. P'], ['Tipo', 'Campionato', 'Campionato'], ['Mario', 'Presente', ''], ['Assenti', 0, 0]]); ss.sheets.set('Pulcini2', attendance);
  assert.equal(context.emptyAttendanceCopy_(attendance, 3, '2026-10-21'), true); attendance.values[2][2] = 'Assente'; assert.equal(context.emptyAttendanceCopy_(attendance, 3, '2026-10-21'), false);
});

test('La riparazione con conferma elimina solo la copia e la colonna vuota, con backup e collegamenti conservati', () => {
  const { context, sheet, ss, props } = runtime([HEADERS, game('originale', 'Fides', { 10: 'A' }), game('copia', 'Fides', { 10: 'A' }), game('squadra-b', 'Fides', { 10: 'B' })]);
  const attendance = new Sheet(ss, 'Pulcini2', [['Atleta', '21/10/2026', '21/10/2026', 'Tot. P'], ['Tipo', 'Campionato', 'Campionato'], ['Mario', 'Presente', ''], ['Assenti', 0, 0]]); ss.sheets.set('Pulcini2', attendance);
  props.setProperty('lineup_Formazioni_Pulcini1_A', JSON.stringify({ gameId: 'copia', convocati: ['Mario'] }));
  context.writeDuplicateRepairReport_ = () => {}; context.updateStats_ = () => {};
  context.SpreadsheetApp.getUi = () => ({ alert: () => 'YES', Button: { YES: 'YES' }, ButtonSet: { YES_NO: 'YES_NO' } });
  context.applyDuplicateRepair();
  assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 2); assert.ok(sheet.values.some(row => row[0] === 'squadra-b'));
  assert.equal(attendance.values[0].length, 3); assert.equal(attendance.values[2][1], 'Presente');
  assert.equal(JSON.parse(props.getProperty('lineup_Formazioni_Pulcini1_A')).gameId, 'originale');
  const backups = [...ss.sheets.values()].filter(item => item.name.startsWith('Backup_Duplicati_')); assert.equal(backups.length, 2); assert.ok(backups.every(item => item.hidden));
  assert.equal(backups.find(item => item.name.includes('Pulcini2')).values[0].length, 4);
});

test('Senza conferma la riparazione non elimina gare o colonne', () => {
  const { context, sheet } = runtime([HEADERS, game('originale', 'Fides'), game('copia', 'Fides')]);
  context.writeDuplicateRepairReport_ = () => {}; context.SpreadsheetApp.getUi = () => ({ alert: () => 'NO', Button: { YES: 'YES' }, ButtonSet: { YES_NO: 'YES_NO' } });
  context.applyDuplicateRepair(); assert.equal(sheet.values.filter(context.isCalendarGameRow_).length, 2); assert.equal(sheet.writes, 0);
});

test('Il riferimento temporaneo resta valido durante la normalizzazione di categoria, gruppo e tipo', () => {
  const { context, sheet } = runtime([HEADERS, game('', 'Fides', { 1: 'Pulcini1B', 2: 'amichevole' })]); context.getPlayerNames_ = () => [];
  const selected = context.getGames_('Pulcini1').games[0]; context.formatCalendar_(sheet);
  context.saveGameResult_('Pulcini1', { id: selected.id, periods: [{ team: 1, opponent: 0 }], note: 'Nota conservata dopo la migrazione' });
  assert.equal(sheet.values.find(row => row[5] === 'Fides')[9], 'Nota conservata dopo la migrazione');
});
