/**
 * Backend Cresole 80. Da incollare integralmente nel progetto Apps Script e
 * distribuire come nuova versione della Web App. I dati restano nel foglio.
 */
const CRESOLE_TEAMS = ['Esordienti2', 'Pulcini2', 'Pulcini1', 'Primi_Calci', 'Piccoli_Amici', 'Allenatori'];
const CRESOLE_STATUSES = ['Presente', 'Assente', 'Giustificato', 'Infortunato', ''];
const CALENDAR_HEADERS = ['ID','Squadra','Tipo','Data','Ora','Avversario','Campo','Mister','Risultato','Note','Gruppo'];
const CALENDAR_EDIT_STAMP = 'c80_calendar_edited';
const CALENDAR_SIGNATURE = 'c80_calendar_signature';
const CALENDAR_EVENT_QUEUE = 'c80_event_queue_';

/** Menu amministrativo: visibile nel Foglio Google, non nella Web App. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Amministrazione Cresole 80')
    .addItem('Anteprima sincronizzazione completa', 'previewFullSync_')
    .addSeparator()
    .addItem('Applica correzioni mancanti', 'applyFullSync_')
    .addSeparator()
    .addItem('Sistema Calendario e attiva manutenzione', 'setupCalendarMaintenance')
    .addItem('Anteprima duplicati', 'previewDuplicateRepair')
    .addItem('Ripara duplicati sicuri (con backup)', 'applyDuplicateRepair')
    .addToUi();
}

/** Crea solo il prospetto: non modifica presenze, calendario o allenatori. */
function previewFullSync_() {
  const plan=buildFullSyncPlan_();
  writeFullSyncReport_(plan,'ANTEPRIMA — nessun dato è stato modificato');
  SpreadsheetApp.getUi().alert('Anteprima pronta',syncPlanSummary_(plan)+'\n\nApri il foglio “Controllo_Sincronizzazione” per vedere ogni singola riga.',SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Applica solo aggiunte e aggiornamenti di priorità verso il foglio Allenatori. */
function applyFullSync_() {
  const ui=SpreadsheetApp.getUi(), initialPlan=buildFullSyncPlan_();
  writeFullSyncReport_(initialPlan,'ANTEPRIMA — in attesa della conferma');
  if(!initialPlan.actions.length) {
    ui.alert('Nessuna correzione necessaria','I fogli sono già allineati. Eventuali duplicati restano segnalati nel foglio di controllo.',ui.ButtonSet.OK);
    return;
  }
  const choice=ui.alert('Conferma sincronizzazione',syncPlanSummary_(initialPlan)+'\n\nVerranno solo aggiunti eventi mancanti o aggiornato l’evento degli Allenatori se ha priorità inferiore. Non viene eliminato né sovrascritto nessun altro dato.',ui.ButtonSet.YES_NO);
  if(choice!==ui.Button.YES) return;
  const lock=LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    // Ricontrolla dopo la conferma per non applicare un piano diventato obsoleto.
    const plan=buildFullSyncPlan_();
    applyFullSyncPlan_(plan);
    writeFullSyncReport_(plan,'APPLICATA — '+new Date());
    ui.alert('Sincronizzazione completata',syncPlanSummary_(plan)+'\n\nIl dettaglio è nel foglio “Controllo_Sincronizzazione”.',ui.ButtonSet.OK);
  } catch(error) {
    logError_('sincronizzazione completa',error);
    ui.alert('Sincronizzazione non completata',String(error.message||error),ui.ButtonSet.OK);
  } finally { try { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } } catch (_) {} }
}

/** Accoda le modifiche: non sposta righe mentre un utente compila le celle. */
function onEdit(e) {
  try {
    const range=e&&e.range;if(!range)return;
    const sheet=range.getSheet(),team=sheet.getName(),props=PropertiesService.getScriptProperties();
    if(team==='Calendario') { props.setProperty(CALENDAR_EDIT_STAMP,String(Date.now())); return; }
    const lineupContext=lineupContextForSheet_(team);
    if(lineupContext&&range.getColumn()<=25){props.setProperty('c80_lineup_roster_'+team,JSON.stringify(Object.assign({},lineupContext,{queuedAt:Date.now()})));props.setProperty(CALENDAR_EDIT_STAMP,String(Date.now()));return;}
    if(!CRESOLE_TEAMS.includes(team)||team==='Allenatori'||range.getRow()>2||range.getLastColumn()<2)return;
    const first=Math.max(2,range.getColumn()),count=range.getLastColumn()-first+1;
    const values=sheet.getRange(1,first,2,count).getValues();
    for(let i=0;i<count;i++) {
      const date=parseDate_(values[0][i]),type=normalizeEventType_(values[1][i]);
      if(isNaN(date)||!type)continue;
      const event={team:team,date:syncDateKey_(date),type:type};
      props.setProperty(CALENDAR_EVENT_QUEUE+syncEventKey_(team,date,type),JSON.stringify(event));
    }
    props.setProperty(CALENDAR_EDIT_STAMP,String(Date.now()));
  } catch(error) { logError_('onEdit',error); }
}

function doGet(e) {
  try {
    const team = cleanTeam_(e.parameter.team || 'Esordienti2');
    const mode = e.parameter.mode || 'presenze';
    if (mode === 'calendario') return json_(Object.assign({status:'success'},getGames_(team)));
    if (mode === 'divise') return json_(getUniforms_(team));
    if (mode === 'formazioni') {const group=normalizeGroup_(team,e.parameter.group);return json_({status:'success',team:team,group:group,lineups:readLineup_(team,group)});}
    return json_(getAttendance_(team, mode, e.parameter.allHistory === 'true'));
  } catch (error) { logError_('GET', error); return json_({status:'error', message:'Impossibile caricare i dati.'}); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Richiesta vuota');
    const data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== 'object') throw new Error('Dati non validi');
    lock.waitLock(20000); // impedisce sovrascritture tra due allenatori
    const previous=readCompletedOperation_(data);if(previous)return json_(previous);
    const team = cleanTeam_(data.team || 'Esordienti2');
    let result;
    switch (data.action) {
      case 'saveAttendance': result = saveAttendance_(team, data); break;
      case 'addPlayer': result = addPlayer_(team, data.name); break;
      case 'addEvent': result = addEvent_(team, data); break;
      case 'saveLineup': result = saveLineup_(team, data); break;
      case 'saveGame': result = saveGame_(team, data); break;
      case 'saveGameResult': result = saveGameResult_(team, data); break;
      case 'saveUniforms': result = saveUniforms_(team, data.uniforms); break;
      default: throw new Error('Azione non riconosciuta');
    }
    const response=Object.assign({status:'success'},result||{});rememberCompletedOperation_(data,response);return json_(response);
  } catch (error) { logError_('POST', error); return json_({status:'error', message:error.message || 'Salvataggio non riuscito.'}); }
  finally { try { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } } catch (_) {} }
}

function getAttendance_(team, mode, allHistory) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(team);
  if (!sheet) throw new Error('Scheda presenze non trovata');
  const values = sheet.getDataRange().getValues();
  const lastCol = values[0].length, statStart = findStatStart_(values[0]);
  const eventEnd = statStart || lastCol + 1, players = [], attendanceMap = {}, rawEvents = [];
  let assentiRow = values.length + 1;
  for (let r=2; r<values.length; r++) {
    const name = String(values[r][0] || '').trim();
    if (name.toLowerCase() === 'assenti') { assentiRow = r + 1; break; }
    if (name) {
      const stats = {p:0,a:0,g:0,i:0};
      for (let c=1;c<eventEnd-1;c++) { const x=String(values[r][c]||'').trim(); if(x==='Presente')stats.p++; if(x==='Assente')stats.a++; if(x==='Giustificato')stats.g++; if(x==='Infortunato')stats.i++; }
      players.push({row:r+1,name:name,statsGlobal:stats});
    }
  }
  for (let c=1;c<eventEnd-1;c++) {
    if (!values[0][c]) continue;
    const type=String(values[1][c]||'Allenamento');
    if(isNaN(parseDate_(values[0][c])))continue;
    rawEvents.push({col:c+1,date:formatDate_(values[0][c]),type:normalizeEventType_(type)||'Allenamento',isRain:type.indexOf('🌧️')>-1,dateObj:parseDate_(values[0][c])});
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const events = (allHistory || mode === 'statistiche') ? rawEvents : rawEvents.filter(x => Math.abs(x.dateObj - today) <= 5*86400000);
  const visible = events.length || !rawEvents.length ? events : rawEvents.slice(-6);
  visible.forEach(ev => { attendanceMap[String(ev.col)]={}; players.forEach(p=>{const v=String(values[p.row-1][ev.col-1]||'').trim();if(v)attendanceMap[String(ev.col)][String(p.row)]=v;}); });
  return {status:'success',team:team,mode:mode,players:players,events:visible,attendanceMap:attendanceMap,assentiRow:assentiRow};
}

function saveAttendance_(team, data) {
  const sheet=getSheet_(team), col=Number(data.col), assenti=findAssentiRow_(sheet);
  if (!Number.isInteger(col) || col < 2 || col >= findStatStart_(sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0])) throw new Error('Seduta non valida');
  if (!Array.isArray(data.records)) throw new Error('Presenze mancanti');
  data.records.forEach(rec => { const row=Number(rec.row), status=String(rec.status||'').trim(); if(!Number.isInteger(row)||row<3||row>=assenti||!CRESOLE_STATUSES.includes(status)) throw new Error('Presenza non valida'); sheet.getRange(row,col).setValue(status); });
  const type=sheet.getRange(2,col), base=String(type.getValue()||'Allenamento').replace('🌧️','').trim(); type.setValue(data.isRain ? '🌧️ '+base : base);
  updateAssentiFormula_(sheet,col); updateStats_(sheet); return {message:'Presenze salvate'};
}

function addPlayer_(team, rawName) {
  const name=safeText_(rawName,80); if(!name) throw new Error('Nome non valido');
  const sheet=getSheet_(team); let row=findAssentiRow_(sheet); sheet.insertRowBefore(row);
  const source=sheet.getRange(Math.max(3,row-1),1,1,sheet.getLastColumn()), target=sheet.getRange(row,1,1,sheet.getLastColumn());
  source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false); source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false); target.clearContent(); sheet.getRange(row,1).setValue(name); updateStats_(sheet); return {newPlayer:{row:row,name:name}};
}

function addEvent_(team, data) {
  const date=parseDate_(data.date); if(isNaN(date)) throw new Error('Data non valida');
  const type=normalizeEventType_(safeText_(data.type||'Allenamento',40));let game=null;
  // Valida e salva la gara prima di creare una seduta: i tentativi ripetuti
  // riutilizzano la stessa gara e la stessa colonna giornaliera.
  if(isGameType_(type))game=saveGame_(team,Object.assign({},data,{type:type}));
  const col=ensureEventColumn_(team,date,type);if(team!=='Allenatori')ensureStaffEvent_(date,type);
  const storedType=String(getSheet_(team).getRange(2,col).getValue()||type);
  return {newEvent:{col:col,date:formatDate_(date),type:normalizeEventType_(storedType),isRain:storedType.indexOf('🌧️')>-1},game:game};
}

function getGames_(team) {
  // Una lettura dall'app non deve ricostruire o modificare il foglio.
  const sheet=SpreadsheetApp.getActive().getSheetByName('Calendario'),all=team==='Allenatori',coaches=getPlayerNames_('Allenatori');
  if(!sheet)return {games:[],coaches:coaches};
  const values=sheet.getDataRange().getValues();assertCalendarHeaders_(values[0]);
  const gameRows=values.slice(1).map(row=>calendarReadableRow_(row,values[0])).filter(isCalendarGameRow_),idCounts={};gameRows.forEach(row=>{if(row[0])idCounts[String(row[0])]=(idCounts[String(row[0])]||0)+1;});
  // Un riferimento temporaneo permette di modificare anche una gara appena
  // inserita a mano, senza scrivere durante il caricamento della pagina.
  const games=gameRows.filter(r=>all||calendarTeam_(r)===team).map(r=>({id:r[0]&&idCounts[String(r[0])]===1?String(r[0]):calendarPendingId_(r),team:calendarTeam_(r),group:calendarGroup_(r),type:normalizeEventType_(r[2]),date:formatDate_(r[3]),dateIso:syncDateKey_(r[3]),time:calendarTimeText_(r[4]),opponent:String(r[5]||''),venue:String(r[6]||'Casa'),coaches:splitCoaches_(r[7]),result:String(r[8]||''),note:String(r[9]||'')}));
  games.sort((a,b)=>(a.dateIso+a.time).localeCompare(b.dateIso+b.time)); return {games:games,coaches:coaches};
}

function upsertCalendarFromAttendance_(team,date,type){
  const sheet=getCalendar_();appendCalendarEventForSync_(sheet,team,date,type);formatCalendar_(sheet);
}

function saveGame_(team,data) {
  if(team==='Allenatori') throw new Error('Seleziona una squadra, non Staff'); const date=parseDate_(data.date), opponent=safeText_(data.opponent,80), venue=data.venue==='Fuori'?'Fuori':'Casa', time=/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time||'')?data.time:'', type=eventType_(data.type || 'Campionato'), coaches=validateCoaches_(data.coaches || []),group=normalizeGroup_(team,data.group);
  if(isNaN(date)||!opponent) throw new Error('Data o avversario non validi'); const sheet=getCalendar_(), id=String(data.id||''); let row=0;
  const rows=sheet.getDataRange().getValues();
  if(id){const matches=calendarMatchRows_(rows,id,team);if(matches.length>1)throw new Error('Collegamento gara ambiguo. Riapri il Calendario dopo la manutenzione.');row=matches[0]||0;if(!row)throw new Error('Gara non trovata o modificata da un altro utente. Riapri il calendario.');}
  if(!id){
    const identity=gameIdentity_(['',team,type,date,time,opponent,venue,'','','',group]);
    const same=rows.slice(1).filter(isCalendarGameRow_).filter(record=>gameIdentity_(record)===identity);
    if(same.length){syncCalendarEvent_(team,date,type);return {message:'Gara già presente: nessuna copia aggiunta',id:String(same[0][0]||calendarPendingId_(same[0])),alreadyExists:true};}
  }
  if(!row) {
    // Completa una sola bozza creata dalle presenze; non tocca le altre gare.
    const drafts=[];
    for(let i=1;i<rows.length;i++)if(isCalendarGameRow_(rows[i])&&calendarTeam_(rows[i])===team&&normalizeEventType_(rows[i][2])===type&&calendarGroup_(rows[i])===group&&sameDate_(parseDate_(rows[i][3]),date)&&!String(rows[i][4]||'').trim()&&!String(rows[i][5]||'').trim()&&!String(rows[i][7]||'').trim()&&!String(rows[i][8]||'').trim()&&!String(rows[i][9]||'').trim()&&(!rows[i][6]||rows[i][6]==='Casa'))drafts.push(i+1);
    if(drafts.length===1)row=drafts[0];
  }
  const existing=row?sheet.getRange(row,1,1,10).getValues()[0]:null,gameId=existing&&existing[0]?String(existing[0]):Utilities.getUuid();
  if(!row)row=sheet.getLastRow()+1;
  ensureCalendarSize_(sheet,row,10);
  sheet.getRange(row,1,1,8).setValues([[gameId,team,type,date,time,opponent,venue,coaches.join(', ')]]);
  sheet.getRange(row,11).setValue(group);
  sheet.getRange(row,4).setNumberFormat('dd/MM/yyyy');syncCalendarEvent_(team,date,type);formatCalendar_(sheet);return {message:'Evento salvato',id:gameId};
}

function saveGameResult_(team,data) {
  if(team==='Allenatori') throw new Error('Seleziona una squadra valida');
  const id=safeText_(data.id,80), result=buildGameResult_(data.periods), note=safeText_(data.note,500), sheet=getCalendar_();
  const rows=sheet.getDataRange().getValues();let matches=id?calendarMatchRows_(rows,id,team):[];
  if(!id&&!matches.length){const date=parseDate_(data.date),opponent=safeText_(data.opponent,80);for(let i=1;i<rows.length;i++)if(isCalendarGameRow_(rows[i])&&String(rows[i][1]).trim()===team&&sameDate_(parseDate_(rows[i][3]),date)&&String(rows[i][5])===opponent)matches.push(i+1);}
  if(matches.length>1)throw new Error('Più gare corrispondono. Attendi la manutenzione e riapri la gara dal calendario.');
  const row=matches[0]||0;
  if(!row) throw new Error('Gara non trovata. Riapri il calendario e riprova.');
  sheet.getRange(row,9,1,2).setValues([[result.text,note]]); formatCalendar_(sheet); return {message:'Risultato salvato',result:result.text};
}

function buildGameResult_(periods) {
  if(!Array.isArray(periods)||!periods.length||periods.length>4) throw new Error('Inserisci da uno a quattro tempi');
  let won=0,lost=0;const scores=[];
  periods.forEach(period=>{const team=Number(period&&period.team),opponent=Number(period&&period.opponent);if(!Number.isInteger(team)||!Number.isInteger(opponent)||team<0||opponent<0||team>99||opponent>99)throw new Error('Risultato tempo non valido');if(team>opponent)won++;if(team<opponent)lost++;scores.push(team+'-'+opponent);});
  const outcome=won>lost?'Vinto':lost>won?'Perso':'Pareggiato';return {outcome:outcome,text:outcome+' · '+scores.join(' | ')};
}

function saveLineup_(team,data) {
  if(['Piccoli_Amici','Allenatori'].includes(team)) throw new Error('Categoria senza modulo tattico');
  const group=normalizeGroup_(team,data.group),lineup=normalizeLineup_(team,data.lineup||{}),name=lineupSheetName_(team,group),roster=[...new Set(getPlayerNames_(team).concat(lineup.prestiti))];
  if(lineup.convocati!==null)lineup.convocati.forEach(player=>{if(!roster.includes(player))throw new Error('Convocato non presente in rosa o nei prestiti');});
  validateLineup_(lineup,lineup.convocati===null?roster:lineup.convocati);
  if(lineup.gameId){const sheet=getCalendar_(),matches=calendarMatchRows_(sheet.getDataRange().getValues(),lineup.gameId,team);if(matches.length!==1)throw new Error('Gara della formazione non trovata o ambigua');const row=sheet.getRange(matches[0],1,1,11).getValues()[0];if(calendarGroup_(row)!==group)throw new Error('La gara appartiene a un’altra squadra A/B');lineup.gameId=String(row[0]||calendarPendingId_(row));}
  const ss=SpreadsheetApp.getActive(),sheet=ss.getSheetByName(name)||ss.insertSheet(name);
  drawLineup_(sheet,lineup,team,lineup.convocati===null?roster:lineup.convocati);writeLineupRoster_(sheet,lineup,roster,team,group);return {message:'Formazione salvata',group:group};
}

function readLineup_(team,group) {
  const empty=normalizeLineup_(team,{}), name=lineupSheetName_(team,normalizeGroup_(team,group)), sheet=SpreadsheetApp.getActive().getSheetByName(name); if(!sheet)return empty;
  const props=PropertiesService.getDocumentProperties().getProperty('lineup_'+name), result=props?normalizeLineup_(team,JSON.parse(props)):empty;
  lineupOffsets_(tempoKeys_(result).length).forEach((p,i)=>{const t=result['tempo'+(i+1)],map=roleCells_(sheet,p.r,p.c,team);Object.keys(map).forEach(role=>t.titolari[role]=String(map[role].getValue()||'').trim());['angoli','palo1','palo2','ultimo'].forEach((key,n)=>t.piazzati[key]=String(sheet.getRange(p.r+1+n,p.c+8).getValue()||'').trim());['palo','vertice','contropiede'].forEach((key,n)=>t.difesaCorner[key]=String(sheet.getRange(p.r+7+n,p.c+8).getValue()||'').trim());});
  if(sheet.getMaxColumns()>=25&&sheet.getRange(2,23).getValue()==='Giocatore'){
    const rows=sheet.getRange(3,23,Math.max(1,sheet.getLastRow()-2),3).getValues(),useList=sheet.getRange(1,24).getValue()===true;
    result.convocati=useList?rows.filter(row=>row[0]&&row[1]===true).map(row=>String(row[0]).trim()):null;
    result.prestiti=rows.filter(row=>row[0]&&row[2]==='Prestito').map(row=>String(row[0]).trim());
  }
  return result;
}

function lineupSheetName_(team,group){return 'Formazioni_'+team+(team==='Pulcini1'&&group?'_'+group:'');}
function lineupContextForSheet_(name){
  for(const team of CRESOLE_TEAMS.filter(value=>!['Allenatori','Piccoli_Amici'].includes(value)))for(const group of team==='Pulcini1'?['','A','B']:[''])if(lineupSheetName_(team,group)===name)return {team:team,group:group};
  return null;
}
function refreshLineupRosterRules_(team,group){
  const name=lineupSheetName_(team,group),sheet=SpreadsheetApp.getActive().getSheetByName(name);if(!sheet)return;
  const lineup=readLineup_(team,group),roster=[...new Set(getPlayerNames_(team).concat(lineup.prestiti))],players=lineup.convocati===null?roster:roster.filter(player=>lineup.convocati.includes(player));
  const rule=players.length?SpreadsheetApp.newDataValidation().requireValueInList(players,true).setAllowInvalid(false).build():null;
  lineupOffsets_(tempoKeys_(lineup).length).forEach((point,index)=>{
    const cells=Object.values(roleCells_(sheet,point.r,point.c,team)).concat([1,2,3,4,7,8,9].map(offset=>sheet.getRange(point.r+offset,point.c+8)));
    cells.forEach(cell=>{if(rule)cell.setDataValidation(rule);else cell.clearDataValidations();});
    const tempo=lineup['tempo'+(index+1)];writeBench_(sheet,point.r+11,point.c,players.filter(player=>!Object.values(tempo.titolari).includes(player)),tempo.sostituzioni);
  });
  // Conserva ogni assegnazione già presente: eventuali esclusi vanno corretti
  // dall'allenatore e non vengono cancellati dal cambio di una checkbox.
  PropertiesService.getDocumentProperties().setProperty('lineup_'+name,JSON.stringify(lineup));
}
function writeLineupRoster_(sheet,lineup,roster,team,group){
  ensureCalendarSize_(sheet,Math.max(sheet.getLastRow(),roster.length+2),25);
  sheet.getRange(1,23,Math.max(sheet.getLastRow(),roster.length+2),3).clearContent().clearDataValidations();
  sheet.getRange(1,23).setValue('Usa lista convocati');sheet.getRange(1,24).insertCheckboxes().setValue(lineup.convocati!==null);
  sheet.getRange(2,23,1,3).setValues([['Giocatore','Convocato','Origine']]).setBackground('#e0e7ff').setFontWeight('bold');
  if(roster.length){sheet.getRange(3,23,roster.length,3).setValues(roster.map(name=>[name,lineup.convocati===null||lineup.convocati.includes(name),lineup.prestiti.includes(name)?'Prestito':'Rosa']));sheet.getRange(3,24,roster.length,1).insertCheckboxes();sheet.getRange(3,24,roster.length,1).setValues(roster.map(name=>[lineup.convocati===null||lineup.convocati.includes(name)]));}
  sheet.getRange(1,1).setValue(team+(group?' — 2017 '+group:''));sheet.setColumnWidth(23,200);sheet.setColumnWidth(24,110);sheet.setColumnWidth(25,90);
}

function tempoKeys_(lineup){return Object.keys(lineup).filter(k=>/^tempo\d+$/.test(k)).sort((a,b)=>Number(a.slice(5))-Number(b.slice(5)));}
function lineupOffsets_(count){const base=[{r:3,c:2},{r:3,c:12},{r:18,c:2},{r:18,c:12}];for(let i=4;i<count;i++)base.push({r:34+(i-4)*15,c:2});return base;}
function normalizeLineup_(team,lineup) { const x={prestiti:Array.isArray(lineup.prestiti)?[...new Set(lineup.prestiti.map(n=>safeText_(n,80)).filter(Boolean))]:[],convocati:Array.isArray(lineup.convocati)?[...new Set(lineup.convocati.map(n=>safeText_(n,80)).filter(Boolean))]:null,gameId:safeText_(lineup.gameId,80)}, keys=Object.keys(lineup).filter(k=>/^tempo\d+$/.test(k));['tempo1','tempo2','tempo3','tempo4'].forEach(t=>{if(!keys.includes(t))keys.push(t);});keys.forEach(t=>{const current=lineup[t]||{};x[t]={titolari:Object.assign({},current.titolari),piazzati:Object.assign({},current.piazzati),difesaCorner:Object.assign({},current.difesaCorner),sostituzioni:Object.assign({},current.sostituzioni)};delete x[t].difesaCorner.alto;}); return x; }
function validateLineup_(lineup,allowed) { tempoKeys_(lineup).forEach(t=>{const current=lineup[t], starters=Object.values(current.titolari).filter(Boolean); if(new Set(starters).size!==starters.length)throw new Error('Un atleta è schierato due volte'); starters.forEach(n=>{if(!allowed.includes(n))throw new Error('Atleta non valido');}); Object.values(current.piazzati).concat(Object.values(current.difesaCorner)).filter(Boolean).forEach(n=>{if(!starters.includes(n))throw new Error('Piazzati e corner devono essere giocatori in campo');});const incoming=[];Object.keys(current.sostituzioni||{}).forEach(role=>{const sub=current.sostituzioni[role]||{},out=String(sub.out||''),into=String(sub.in||'');if(!out&&!into)return;if(current.titolari[role]!==out||!allowed.includes(into)||starters.includes(into))throw new Error('Sostituzione non valida');incoming.push(into);});if(new Set(incoming).size!==incoming.length)throw new Error('Un atleta non può entrare due volte nello stesso tempo');}); }

function drawLineup_(sheet,lineup,team,players) {
  const offsets=lineupOffsets_(tempoKeys_(lineup).length), rule=players.length?SpreadsheetApp.newDataValidation().requireValueInList(players,true).setAllowInvalid(false).build():null;
  offsets.forEach((p,i)=>{
    const t=lineup['tempo'+(i+1)],pitch=sheet.getRange(p.r,p.c,11,7);pitch.clearContent();pitch.setBorder(true,true,true,true,false,false,'#15803d',SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sheet.getRange(p.r,p.c+2,1,3).setBorder(true,true,true,true,false,false,'#000000',SpreadsheetApp.BorderStyle.SOLID);sheet.getRange(p.r-1,p.c).setValue((i+1)+'° TEMPO').setFontWeight('bold');
    const map=roleCells_(sheet,p.r,p.c,team);Object.keys(map).forEach(role=>{map[role].setValue(t.titolari[role]||'').setHorizontalAlignment('center').setFontSize(9);if(rule)map[role].setDataValidation(rule);else map[role].clearDataValidations();});
    writeBlock_(sheet,p.r,p.c+7,'Piazzati',t.piazzati,['angoli','palo1','palo2','ultimo'],['Angoli','1° Palo','2° Palo','Ultimo'],rule);sheet.getRange(p.r+10,p.c+7,1,2).clearContent().clearDataValidations();
    writeBlock_(sheet,p.r+6,p.c+7,'Corner avversario',t.difesaCorner,['palo','vertice','contropiede'],['Palo','Vertice','Contropiede'],rule);writeBench_(sheet,p.r+11,p.c,players.filter(name=>!Object.values(t.titolari).includes(name)),t.sostituzioni);
  });
  PropertiesService.getDocumentProperties().setProperty('lineup_'+sheet.getName(),JSON.stringify(lineup));
}
function roleCells_(sheet,r,c,team){if(team.indexOf('Esordienti')>-1)return {POR:sheet.getRange(r+1,c+3),DIF_SX:sheet.getRange(r+3,c+1),DIF_DX:sheet.getRange(r+3,c+5),MED_SX:sheet.getRange(r+5,c+2),MED_DX:sheet.getRange(r+5,c+4),EST_SX:sheet.getRange(r+6,c),TREQ:sheet.getRange(r+6,c+3),EST_DX:sheet.getRange(r+6,c+6),PUNTA:sheet.getRange(r+9,c+3)};if(team==='Primi_Calci')return {POR:sheet.getRange(r+1,c+3),DIF_SX:sheet.getRange(r+3,c+1),DIF_DX:sheet.getRange(r+3,c+5),CEN:sheet.getRange(r+5,c+3),PUNTA:sheet.getRange(r+8,c+3)};return {POR:sheet.getRange(r+1,c+3),DIF_SX:sheet.getRange(r+3,c+1),DIF_DX:sheet.getRange(r+3,c+5),CEN_SX:sheet.getRange(r+5,c+1),CEN_CC:sheet.getRange(r+5,c+3),CEN_DX:sheet.getRange(r+5,c+5),PUNTA:sheet.getRange(r+8,c+3)};}
function writeBlock_(sheet,row,col,title,data,keys,labels,rule){sheet.getRange(row,col,1,2).merge().setValue(title).setFontWeight('bold');keys.forEach((key,i)=>{sheet.getRange(row+1+i,col).setValue(labels[i]+':');const cell=sheet.getRange(row+1+i,col+1);cell.setValue(data[key]||'');if(rule)cell.setDataValidation(rule);else cell.clearDataValidations();});}
function writeBench_(sheet,row,col,players,sostituzioni){const swaps=Object.values(sostituzioni||{}).filter(x=>x&&x.out&&x.in).map(x=>x.out+' → '+x.in);sheet.getRange(row,col,1,7).merge().setValue('Panchina: '+(players.length?players.join(', '):'—')+(swaps.length?' | Sostituzioni metà tempo: '+swaps.join(', '):'')).setFontSize(9).setBackground('#f8fafc');}

function updateStats_(sheet) { const assenti=findAssentiRow_(sheet), last=sheet.getLastColumn(), first=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1, start='B', end=columnLetter_(first-1), labels=['Tot. P','Tot. A','Tot. G','Tot. I'], values=['Presente','Assente','Giustificato','Infortunato'], colors=['#dcfce7','#ffe4e6','#fef3c7','#f3e8ff']; if(sheet.getMaxColumns()<first+3)sheet.insertColumnsAfter(sheet.getMaxColumns(),first+3-sheet.getMaxColumns()); for(let i=0;i<4;i++){const col=first+i;sheet.getRange(1,col).setValue(labels[i]).setBackground(colors[i]);sheet.getRange(2,col).setValue('Riepilogo').setBackground(colors[i]);sheet.getRange(1,col,sheet.getLastRow(),1).clearDataValidations();for(let r=3;r<assenti;r++)sheet.getRange(r,col).setFormula('=COUNTIF('+start+r+':'+end+r+'; "'+values[i]+'")');} }
function updateAssentiFormula_(sheet,col){const row=findAssentiRow_(sheet);if(row>3){const l=columnLetter_(col);sheet.getRange(row,col).setFormula('=COUNTIF('+l+'3:'+l+(row-1)+'; "Assente")');}}
function findAssentiRow_(sheet){const a=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();for(let i=0;i<a.length;i++)if(String(a[i][0]).trim().toLowerCase()==='assenti')return i+1;throw new Error('Riga Assenti non trovata');}
function findStatStart_(headers){for(let i=1;i<headers.length;i++)if(String(headers[i]||'').trim().indexOf('Tot.')===0)return i+1;return 0;}
function getPlayerNames_(team){const s=getSheet_(team),r=findAssentiRow_(s);return s.getRange(3,1,Math.max(0,r-3),1).getValues().flat().map(x=>String(x).trim()).filter(Boolean);}
function getSheet_(team){const s=SpreadsheetApp.getActive().getSheetByName(team);if(!s)throw new Error('Scheda non trovata');return s;}
function getUniforms_(team){if(!CRESOLE_TEAMS.includes(team)||team==='Allenatori')throw new Error('Divise disponibili solo per le squadre');const sheet=getUniformSheet_(),players=getPlayerNames_(team),last=Math.max(2,sheet.getLastRow()),rows=sheet.getRange(2,1,last-1,7).getValues(),known={};rows.forEach(r=>{if(String(r[0])===team&&players.includes(String(r[1])))known[String(r[1])]=r;});players.forEach(player=>{if(!known[player])rows.push([team,player,'','',false,false,false]);});formatUniforms_(sheet,rows);const current=rows.filter(r=>String(r[0])===team&&players.includes(String(r[1]))).map(r=>({player:String(r[1]),size:String(r[2]||''),number:String(r[3]||''),shirt:r[4]===true,shorts:r[5]===true,socks:r[6]===true}));return {status:'success',team:team,uniforms:current};}
function saveUniforms_(team,uniforms){if(!CRESOLE_TEAMS.includes(team)||team==='Allenatori')throw new Error('Divise disponibili solo per le squadre');if(!Array.isArray(uniforms))throw new Error('Dati divise non validi');const players=getPlayerNames_(team),sheet=getUniformSheet_(),last=Math.max(2,sheet.getLastRow()),rows=sheet.getRange(2,1,last-1,7).getValues(),byPlayer={};rows.forEach((r,i)=>{if(String(r[0])===team)byPlayer[String(r[1])]=i;});uniforms.forEach(item=>{const player=safeText_(item&&item.player,80),size=safeText_(item&&item.size,10),number=safeText_(item&&item.number,3);if(!players.includes(player))throw new Error('Atleta non valido nelle divise');if(number&&!/^\d{1,3}$/.test(number))throw new Error('Numero maglia non valido');const record=[team,player,size,number,item&&item.shirt===true,item&&item.shorts===true,item&&item.socks===true];if(byPlayer[player]!==undefined)rows[byPlayer[player]]=record;else rows.push(record);});formatUniforms_(sheet,rows);return {message:'Divise salvate'};}
function getUniformSheet_(){const ss=SpreadsheetApp.getActive(),name='Divise',header=['Squadra','Atleta','Taglia','Numero','Maglia','Pantaloncini','Calze'];let sheet=ss.getSheetByName(name);if(!sheet){sheet=ss.insertSheet(name);sheet.getRange(1,1,1,7).setValues([header]);sheet.setFrozenRows(1);}sheet.getRange(1,1,1,7).setValues([header]);return sheet;}
function formatUniforms_(sheet,rawRows){const teams=CRESOLE_TEAMS.filter(t=>t!=='Allenatori'),last=Math.max(2,sheet.getLastRow()),valid=(rawRows||[]).filter(r=>teams.includes(String(r[0]))&&String(r[1]||'').trim());valid.sort((a,b)=>teams.indexOf(String(a[0]))-teams.indexOf(String(b[0]))||String(a[1]).localeCompare(String(b[1])));sheet.getRange(1,1,1,7).setValues([['Squadra','Atleta','Taglia','Numero','Maglia','Pantaloncini','Calze']]).setBackground('#4338ca').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');sheet.setFrozenRows(1);[130,190,90,80,85,105,80].forEach((w,i)=>sheet.setColumnWidth(i+1,w));sheet.getRange(2,1,last-1,7).breakApart().clear({contentsOnly:false});let row=2;teams.forEach(team=>{sheet.getRange(row,1,1,7).merge().setValue(team.replace('_',' ')+' — DIVISE').setBackground('#e0e7ff').setFontColor('#312e81').setFontWeight('bold');row++;const records=valid.filter(r=>String(r[0])===team);if(!records.length){sheet.getRange(row,1,1,7).merge().setValue('Nessun atleta in rosa').setBackground('#f8fafc').setFontColor('#64748b').setFontStyle('italic');row+=2;return;}sheet.getRange(row,1,records.length,7).setValues(records);sheet.getRange(row,5,records.length,3).insertCheckboxes();records.forEach((record,i)=>{const cells=sheet.getRange(row+i,5,1,3),values=record.slice(4,7).map(v=>v===true);cells.setValues([values]);values.forEach((checked,n)=>cells.getCell(1,n+1).setBackground(checked?'#dcfce7':'#ffffff'));});row+=records.length+1;});}
function getCalendar_(){
  const ss=SpreadsheetApp.getActive();let sheet=ss.getSheetByName('Calendario');
  if(!sheet){sheet=ss.insertSheet('Calendario');ensureCalendarSize_(sheet,1,11);sheet.getRange(1,1,1,11).setValues([CALENDAR_HEADERS]);}
  const headers=sheet.getRange(1,1,1,Math.max(10,sheet.getLastColumn())).getValues()[0];
  assertCalendarHeaders_(headers);
  // Aggiunge solo i campi finali mancanti. Non inserisce colonne nel mezzo dei dati.
  if(!headers[8]&&!headers[9])sheet.getRange(1,9,1,2).setValues([['Risultato','Note']]);
  if(String(headers[10]||'').trim()!=='Gruppo'){
    // Conserva anche eventuali colonne personalizzate già presenti a destra.
    backupCalendarSnapshot_(sheet,readCalendarSnapshot_(sheet));
    if(sheet.getLastColumn()>10)sheet.insertColumnAfter(10);
    ensureCalendarSize_(sheet,sheet.getLastRow(),11);sheet.getRange(1,11).setValue('Gruppo');
  }
  return sheet;
}
function eventType_(value){const type=normalizeEventType_(value);if(!isGameType_(type))throw new Error('Tipo gara non valido');return type;}
function splitCoaches_(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
function validateCoaches_(list){if(!Array.isArray(list))throw new Error('Mister non validi');const allowed=getPlayerNames_('Allenatori');const values=[...new Set(list.map(x=>safeText_(x,80)).filter(Boolean))];values.forEach(x=>{if(!allowed.includes(x))throw new Error('Mister non presente nella scheda Allenatori: '+x);});return values;}
/** Il chiamante deve possedere ScriptLock. Una sola scrittura dei contenuti. */
function formatCalendar_(sheet,force){
  const edited=Number(PropertiesService.getScriptProperties().getProperty(CALENDAR_EDIT_STAMP)||0);
  // Anche i salvataggi dall'app rispettano una compilazione manuale in corso.
  if(!force&&edited&&Date.now()-edited<60000)return {deferred:true};
  const before=readCalendarSnapshot_(sheet),layout=buildCalendarLayout_(before.values,before.formulas),size=Math.max(before.values.length,layout.rows.length);
  ensureCalendarSize_(sheet,size,layout.width);
  while(layout.rows.length<size){layout.rows.push(Array(layout.width).fill(''));layout.kinds.push('blank');}
  const changed=calendarFingerprint_(before.values,before.formulas)!==calendarFingerprint_(layout.rows,[],true);
  if(changed)backupCalendarSnapshot_(sheet,before);
  // LockService coordina gli script; il controllo aggiuntivo rileva le modifiche manuali.
  const latest=readCalendarSnapshot_(sheet);
  if(calendarFingerprint_(before.values,before.formulas)!==calendarFingerprint_(latest.values,latest.formulas))throw new Error('Il Calendario è stato modificato durante il riordino. I dati sono conservati; la manutenzione riproverà.');
  sheet.getRange(1,1,size,layout.width).breakApart();
  if(changed)sheet.getRange(1,1,size,layout.width).setValues(layout.rows);
  styleCalendarLayout_(sheet,layout);
  SpreadsheetApp.flush();
  const after=readCalendarSnapshot_(sheet);
  PropertiesService.getScriptProperties().setProperty(CALENDAR_SIGNATURE,calendarFingerprint_(after.values,after.formulas));
  return {games:layout.gameCount,incomplete:layout.incompleteCount};
}

function assertCalendarHeaders_(headers){
  for(let i=0;i<8;i++)if(String(headers[i]||'').trim()!==CALENDAR_HEADERS[i])throw new Error('Intestazioni del Calendario non riconosciute. Ripristina i nomi originali prima di riordinare: '+CALENDAR_HEADERS.join(', '));
  if((headers[8]||headers[9])&&(String(headers[8]).trim()!=='Risultato'||String(headers[9]).trim()!=='Note'))throw new Error('Le colonne Risultato e Note del Calendario sono state spostate. Riordino sospeso per conservare i dati.');
}

function readCalendarSnapshot_(sheet){
  const range=sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),Math.max(10,sheet.getLastColumn()));
  return {values:range.getValues(),formulas:range.getFormulas()};
}

function isCalendarGameRow_(row){const team=calendarTeam_(row),group=String(row[10]||groupFromTeamAlias_(row[1])).trim().toUpperCase();return CRESOLE_TEAMS.includes(team)&&team!=='Allenatori'&&['','A','B'].includes(group)&&(team==='Pulcini1'||!group)&&isGameType_(row[2])&&row[3]!==''&&row[3]!=null&&!isNaN(parseDate_(row[3]));}

function isCalendarDecoration_(row){
  if(row.some((value,index)=>index>1&&value!==''&&value!=null))return false;
  const text=String(row[1]||'').trim();
  return text==='Nessuna gara in programma'||text==='DA COMPLETARE — dati conservati'||CRESOLE_TEAMS.filter(t=>t!=='Allenatori').some(team=>['',' — 2017 A',' — 2017 B',' — DA ASSEGNARE'].some(suffix=>text===team.replace('_',' ')+' — CALENDARIO GARE'+suffix));
}

/** Conserva ogni riga dati, incluse formule, colonne extra e gare concomitanti. */
function buildCalendarLayout_(values,formulas){
  assertCalendarHeaders_(values[0]||[]);
  const hasGroup=String((values[0]||[])[10]||'').trim()==='Gruppo',width=Math.max(11,...values.map(row=>row.length+(row.length>10&&!hasGroup?1:0))),teams=CRESOLE_TEAMS.filter(t=>t!=='Allenatori'),groups={},incomplete=[],ids=new Set();
  teams.forEach(team=>groups[team]=[]);
  const writable=(row,index)=>Array.from({length:width},(_,col)=>{const formula=(formulas[index]||[])[col],value=row[col]==null?'':row[col];return formula||((typeof value==='string'&&value.charAt(0)==='=')?"'"+value:value);});
  values.slice(1).forEach((row,index)=>{
    const hasFormula=(formulas[index+1]||[]).some(Boolean);
    if(!hasFormula&&(row.every(value=>value===''||value==null)||isCalendarDecoration_(row)))return;
    const record=writable(row,index+1);if(!hasGroup&&row.length>10){record.splice(10,0,'');record.length=width;}
    if(isCalendarGameRow_(calendarReadableRow_(row,values[0]))){
      // Se una riga è stata copiata, conserva entrambe le gare con ID distinti.
      if(!record[0]||ids.has(String(record[0])))record[0]=Utilities.getUuid();
      record[1]=calendarTeam_(row);record[2]=normalizeEventType_(row[2]);record[10]=hasGroup?calendarGroup_(row):normalizeGroup_(calendarTeam_(row),groupFromTeamAlias_(row[1]));
      ids.add(String(record[0]));groups[calendarTeam_(row)].push({record:record,raw:row});
    }else incomplete.push(record);
  });
  const rows=[],kinds=[],push=(row,kind)=>{rows.push(row);kinds.push(kind);},header=Array.from({length:width},(_,i)=>i<11?CALENDAR_HEADERS[i]:(values[0][i-(!hasGroup?1:0)]||''));
  push(header,'header');let gameCount=0;
  teams.forEach(team=>{
    groups[team].sort((a,b)=>parseDate_(a.raw[3])-parseDate_(b.raw[3])||(calendarTimeText_(a.raw[4])||'99:99').localeCompare(calendarTimeText_(b.raw[4])||'99:99')||eventRank_(String(b.raw[2]).trim())-eventRank_(String(a.raw[2]).trim())||String(a.raw[5]||'').localeCompare(String(b.raw[5]||'')));
    const subgroups=team==='Pulcini1'?['A','B','']:[''];
    subgroups.forEach(group=>{
      const title=Array(width).fill('');title[1]=team.replace('_',' ')+' — CALENDARIO GARE'+(team==='Pulcini1'?(group?' — 2017 '+group:' — DA ASSEGNARE'):'');push(title,'team');
      const games=groups[team].filter(item=>team!=='Pulcini1'||item.record[10]===group);
      games.forEach(item=>{push(item.record,'game');gameCount++;});
      if(!games.length){const empty=Array(width).fill('');empty[1]='Nessuna gara in programma';push(empty,'empty');}
      push(Array(width).fill(''),'blank');push(Array(width).fill(''),'blank');
    });
  });
  if(incomplete.length){const title=Array(width).fill('');title[1]='DA COMPLETARE — dati conservati';push(title,'incompleteHeader');incomplete.forEach(row=>push(row,'incomplete'));}
  return {rows:rows,kinds:kinds,width:width,gameCount:gameCount,incompleteCount:incomplete.length};
}

function styleCalendarLayout_(sheet,layout){
  const typeColors={Campionato:{bg:'#ede9fe',fg:'#5b21b6'},Amichevole:{bg:'#fce7f3',fg:'#9d174d'},Torneo:{bg:'#fef3c7',fg:'#92400e'}},resultColors={Vinto:{bg:'#dcfce7',fg:'#166534'},Perso:{bg:'#fee2e2',fg:'#b91c1c'},Pareggiato:{bg:'#fef3c7',fg:'#92400e'}},backgrounds=[],fonts=[],weights=[];
  layout.rows.forEach((row,index)=>{
    const kind=layout.kinds[index],bg=Array(11).fill('#ffffff'),fg=Array(11).fill('#334155'),weight=Array(11).fill('normal');
    if(kind==='header'){bg.fill('#4338ca');fg.fill('#ffffff');weight.fill('bold');}
    if(kind==='team'){bg.fill('#e0e7ff');fg.fill('#312e81');weight.fill('bold');}
    if(kind==='empty'){bg.fill('#f8fafc');fg.fill('#64748b');}
    if(kind==='incompleteHeader'||kind==='incomplete'){bg.fill('#fff7ed');fg.fill('#9a3412');}
    if(kind==='game'){
      const color=typeColors[normalizeEventType_(row[2])];if(color){for(let c=1;c<8;c++){bg[c]=color.bg;fg[c]=color.fg;}bg[10]=color.bg;fg[10]=color.fg;}
      const outcome=resultColors[String(row[8]||'').split(' · ')[0]];if(outcome){bg[8]=outcome.bg;fg[8]=outcome.fg;weight[8]='bold';}
    }
    backgrounds.push(bg);fonts.push(fg);weights.push(weight);
  });
  const count=layout.rows.length,range=sheet.getRange(1,1,count,11);
  range.setBackgrounds(backgrounds).setFontColors(fonts).setFontWeights(weights).setFontStyle('normal').setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setHorizontalAlignment('left');
  sheet.getRange(1,1,count,1).setNumberFormat('@');sheet.getRange(2,4,count-1,1).setNumberFormat('dd/MM/yyyy');sheet.getRange(2,5,count-1,1).setNumberFormat('HH:mm');
  sheet.getRange(1,2,count,10).setWrap(true);
  sheet.setFrozenRows(1);sheet.hideColumns(1);
  [20,185,115,100,80,190,90,230,190,280,100].forEach((width,i)=>sheet.setColumnWidth(i+1,width));
  const groupRule=SpreadsheetApp.newDataValidation().requireValueInList(['A','B'],true).setAllowInvalid(false).build();sheet.getRange(2,11,count-1,1).clearDataValidations();
  layout.rows.forEach((row,index)=>{if(index&&calendarTeam_(row)==='Pulcini1')sheet.getRange(index+1,11).setDataValidation(groupRule);});
  sheet.setRowHeights(1,count,28);
  layout.kinds.forEach((kind,index)=>{if(kind==='blank')sheet.setRowHeight(index+1,12);});
}

function ensureCalendarSize_(sheet,rows,cols){
  if(sheet.getMaxRows()<rows)sheet.insertRowsAfter(sheet.getMaxRows(),rows-sheet.getMaxRows());
  if(sheet.getMaxColumns()<cols)sheet.insertColumnsAfter(sheet.getMaxColumns(),cols-sheet.getMaxColumns());
}

function calendarTimeText_(value){return value instanceof Date&&!isNaN(value)?Utilities.formatDate(value,Session.getScriptTimeZone(),'HH:mm'):String(value||'').trim();}
function calendarPendingId_(row){const identity=Array.from({length:11},(_,i)=>i===0?'':(row[i]??''));identity[1]=calendarTeam_(row);identity[2]=normalizeEventType_(row[2]);identity[3]=syncDateKey_(row[3]);identity[4]=calendarTimeText_(row[4]);identity[10]=calendarGroup_(row);return 'pending:'+calendarFingerprint_([identity],[]);}
function calendarMatchRows_(rows,id,team){
  const matches=[];
  for(let i=1;i<rows.length;i++)if(isCalendarGameRow_(rows[i])&&calendarTeam_(rows[i])===team&&(String(id).indexOf('pending:')===0?calendarPendingId_(rows[i])===id:String(rows[i][0])===id))matches.push(i+1);
  return matches;
}
function calendarFingerprint_(values,formulas,writing){
  const rows=values.map((row,index)=>row.map((value,col)=>{
    const formula=(formulas[index]||[])[col]||(writing&&typeof value==='string'&&value.charAt(0)==='='?value:'');
    if(formula)return {f:formula};
    return {v:writing&&typeof value==='string'&&value.indexOf("'=")===0?value.slice(1):value};
  }));
  while(rows.length>1&&rows[rows.length-1].every(cell=>!cell.f&&(cell.v===''||cell.v==null)))rows.pop();
  // Digest breve: anche calendari grandi rientrano nei limiti delle proprietà.
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(rows)));
}

/** Due copie a rotazione, nascoste, prima di ogni ricostruzione dei contenuti. */
function backupCalendarSnapshot_(sheet,snapshot){
  const ss=sheet.getParent(),props=PropertiesService.getScriptProperties(),next=Number(props.getProperty('c80_calendar_backup_index')||0)+1,name='Backup_Calendario_'+(next%2+1);
  let backup=ss.getSheetByName(name);if(!backup)backup=ss.insertSheet(name);
  const height=Math.max(snapshot.values.length,backup.getLastRow(),1),width=Math.max(snapshot.values[0].length,backup.getLastColumn(),10),rows=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>{
    const formula=(snapshot.formulas[r]||[])[c],value=(snapshot.values[r]||[])[c]??'';
    return formula||(typeof value==='string'&&value.charAt(0)==='='?"'"+value:value);
  }));
  ensureCalendarSize_(backup,height,width);backup.getDataRange().breakApart();backup.getRange(1,1,height,width).setValues(rows);backup.hideSheet();
  props.setProperties({c80_calendar_backup_index:String(next),c80_calendar_backup_date:new Date().toISOString()});
}

/** Da eseguire una sola volta dal menu del Foglio Google. */
function setupCalendarMaintenance(){
  const ui=SpreadsheetApp.getUi(),lock=LockService.getScriptLock();
  try{
    lock.waitLock(20000);
    const ss=SpreadsheetApp.getActive(),props=PropertiesService.getScriptProperties();props.setProperty('c80_spreadsheet_id',ss.getId());
    const sheet=getCalendar_();
    if(!ss.getSheetByName('Backup_Calendario_Iniziale'))sheet.copyTo(ss).setName('Backup_Calendario_Iniziale').hideSheet();
    const triggers=ScriptApp.getProjectTriggers();
    if(!triggers.some(trigger=>trigger.getHandlerFunction()==='maintainCalendar'))ScriptApp.newTrigger('maintainCalendar').timeBased().everyMinutes(1).create();
    if(!triggers.some(trigger=>trigger.getHandlerFunction()==='calendarStructureChanged'))ScriptApp.newTrigger('calendarStructureChanged').forSpreadsheet(ss).onChange().create();
    const result=formatCalendar_(sheet,true);
    ui.alert('Calendario sistemato',result.games+' gare conservate.\n'+result.incomplete+' righe incomplete conservate.\n\nManutenzione automatica attiva. È stata salvata una copia iniziale del Calendario.',ui.ButtonSet.OK);
  }catch(error){logError_('configurazione Calendario',error);ui.alert('Configurazione non completata',String(error.message||error),ui.ButtonSet.OK);}
  finally{try{try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}catch(_){}}
}

function calendarStructureChanged(e){
  if(e&&e.changeType==='EDIT')return; // onEdit ha già registrato l'ultima modifica.
  PropertiesService.getScriptProperties().setProperty(CALENDAR_EDIT_STAMP,String(Date.now()));
}

/** Trigger periodico: attende una pausa nella compilazione e riprova se serve. */
function maintainCalendar(){
  const props=PropertiesService.getScriptProperties(),edited=Number(props.getProperty(CALENDAR_EDIT_STAMP)||0);
  if(edited&&Date.now()-edited<60000)return;
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    const id=props.getProperty('c80_spreadsheet_id');if(!id)return;
    const ss=SpreadsheetApp.openById(id);SpreadsheetApp.setActiveSpreadsheet(ss);
    const sheet=getCalendar_(),pending=props.getProperties(),queueKeys=Object.keys(pending).filter(key=>key.indexOf(CALENDAR_EVENT_QUEUE)===0),rosterKeys=Object.keys(pending).filter(key=>key.indexOf('c80_lineup_roster_')===0);
    const before=readCalendarSnapshot_(sheet),changed=calendarFingerprint_(before.values,before.formulas)!==props.getProperty(CALENDAR_SIGNATURE)||edited!==Number(props.getProperty('c80_calendar_synced_stamp')||0);
    if(!changed&&!queueKeys.length&&!rosterKeys.length)return;
    rosterKeys.forEach(key=>{const context=JSON.parse(pending[key]);refreshLineupRosterRules_(context.team,context.group);});
    queueKeys.forEach(key=>{
      const event=JSON.parse(pending[key]),date=parseDate_(event.date);
      // Non ricrea una colonna cancellata o modificata dopo l'accodamento.
      if(readTeamEventsForSync_(event.team).some(existing=>sameDate_(existing.date,date)&&existing.type===event.type)){
        ensureStaffEvent_(date,event.type);if(isGameType_(event.type))appendCalendarEventForSync_(sheet,event.team,date,event.type);
      }
    });
    // Le gare valide del Calendario raggiungono presenze e Allenatori anche senza aprire l'app.
    syncCalendarRowsToAttendance_(sheet);
    const result=formatCalendar_(sheet);if(result.deferred)return;
    queueKeys.concat(rosterKeys).forEach(key=>{if(props.getProperty(key)===pending[key])props.deleteProperty(key);});
    if(Number(props.getProperty(CALENDAR_EDIT_STAMP)||0)===edited)props.setProperty('c80_calendar_synced_stamp',String(edited));
  }catch(error){logError_('manutenzione Calendario',error);}
  finally{try{try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}catch(_){}}
}

/** Legge una volta gli eventi esistenti e scrive solo quelli che mancano. */
function syncCalendarRowsToAttendance_(sheet){
  const events=sheet.getDataRange().getValues().slice(1).filter(isCalendarGameRow_),teamMaps={},staffState=readStaffStateForSync_(),staffWanted={};
  events.forEach(row=>{
    const team=calendarTeam_(row),type=normalizeEventType_(row[2]),date=parseDate_(row[3]),key=syncEventKey_(team,date,type),day=syncDateKey_(date);
    if(!teamMaps[team])teamMaps[team]=eventCountMap_(readTeamEventsForSync_(team),team);
    if(!teamMaps[team][key]){ensureEventColumn_(team,date,type);teamMaps[team][key]=1;}
    const wanted=staffWanted[day];if(!wanted||eventRank_(type)>eventRank_(wanted.type))staffWanted[day]={date:date,type:type};
  });
  Object.keys(staffWanted).forEach(day=>{const wanted=staffWanted[day],current=staffState[day];if(!current||eventRank_(wanted.type)>eventRank_(current.type))ensureStaffEvent_(wanted.date,wanted.type);});
}
function syncCalendarEvent_(team,date,type){if(!CRESOLE_TEAMS.includes(team)||team==='Allenatori'||isNaN(date))return;ensureEventColumn_(team,date,type);ensureStaffEvent_(date,type);}
function ensureEventColumn_(team,date,type){
  const sheet=getSheet_(team),last=sheet.getLastColumn(),stat=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1,values=stat>2?sheet.getRange(1,2,2,stat-2).getValues():[[],[]];
  const matches=[];for(let i=0;i<values[0].length;i++)if(sameDate_(parseDate_(values[0][i]),date))matches.push(i+2);
  if(matches.length){
    // Se ci sono vecchie copie, usa prima la colonna già compilata.
    const assenti=findAssentiRow_(sheet);matches.sort((a,b)=>{
      const count=col=>assenti>3?sheet.getRange(3,col,assenti-3,1).getValues().filter(row=>String(row[0]||'').trim()).length:0;
      return count(b)-count(a)||a-b;
    });
    const col=matches[0],cell=sheet.getRange(2,col),raw=String(cell.getValue()||''),existing=normalizeEventType_(raw);
    if(eventRank_(type)>eventRank_(existing))cell.setValue((raw.indexOf('🌧️')>-1?'🌧️ ':'')+normalizeEventType_(type));
    return col;
  }
  return insertEventColumn_(sheet,date,normalizeEventType_(type));
}
function ensureStaffEvent_(date,type){return ensureEventColumn_('Allenatori',date,type);}
function insertEventColumn_(sheet,date,type){const last=sheet.getLastColumn(),stat=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1,dates=stat>2?sheet.getRange(1,2,1,stat-2).getValues()[0]:[];let col=stat;for(let i=0;i<dates.length;i++)if(dates[i]&&parseDate_(dates[i])>date){col=i+2;break;}sheet.insertColumnBefore(col);const source=sheet.getRange(1,Math.max(2,col-1),sheet.getLastRow(),1),target=sheet.getRange(1,col,sheet.getLastRow(),1);source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false);target.offset(2,0,Math.max(0,sheet.getLastRow()-2),1).clearContent();sheet.getRange(1,col).setValue(date).setNumberFormat('dd/MM/yyyy');sheet.getRange(2,col).setValue(type);updateAssentiFormula_(sheet,col);updateStats_(sheet);return col;}
function eventRank_(type){type=normalizeEventType_(type);return type==='Campionato'?3:type==='Amichevole'?2:type==='Torneo'?1:0;}
function sameDate_(a,b){return a instanceof Date && b instanceof Date && !isNaN(a) && !isNaN(b) && a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function cleanTeam_(team){team=String(team).replace('Presenze_','').replace('Formazioni_','');if(!CRESOLE_TEAMS.includes(team))throw new Error('Squadra non valida');return team;}
function safeText_(v,max){v=String(v||'').trim();if(v.length>max)throw new Error('Testo troppo lungo');return /^[=+\-@]/.test(v)?"'"+v:v;}
function parseDate_(d){if(d instanceof Date)return d;const p=String(d||'').split(/[-/]/);if(p.length===3)return p[0].length===4?new Date(+p[0],+p[1]-1,+p[2]):new Date(+p[2],+p[1]-1,+p[0]);return new Date(d);}
function formatDate_(d){const x=parseDate_(d);return Utilities.formatDate(x,Session.getScriptTimeZone(),'dd/MM/yyyy');}
function columnLetter_(n){let s='';while(n){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=(n-r-1)/26;}return s;}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function normalizeEventType_(value){const text=String(value||'').replace('🌧️','').trim(),key=text.toLowerCase().replace(/\s+/g,' ');return {allenamento:'Allenamento',campionato:'Campionato',partita:'Campionato','partita campionato':'Campionato','partita di campionato':'Campionato',amichevole:'Amichevole',torneo:'Torneo',ritiro:'Ritiro'}[key]||text;}
function normalizeGroup_(team,value){const group=String(value||'').trim().toUpperCase();if(team!=='Pulcini1'){if(group)throw new Error('Questa categoria non ha squadre A/B');return '';}if(!['','A','B'].includes(group))throw new Error('Seleziona A, B oppure da assegnare');return group;}
function groupFromTeamAlias_(value){const match=String(value||'').trim().match(/^(?:Pulcini\s*1|2017)\s*[-_ ]?([AB])$/i);return match?match[1].toUpperCase():'';}
function calendarTeam_(row){return groupFromTeamAlias_(row[1])?'Pulcini1':String(row[1]||'').trim();}
function calendarReadableRow_(row,headers){return String((headers||[])[10]||'').trim()==='Gruppo'?row:row.slice(0,10).concat([''],row.slice(10));}
function calendarGroup_(row){const team=calendarTeam_(row);return normalizeGroup_(team,row[10]||groupFromTeamAlias_(row[1]));}
function gameIdentity_(row){return [calendarTeam_(row),calendarGroup_(row),syncDateKey_(row[3]),normalizeEventType_(row[2]),calendarTimeText_(row[4]),String(row[5]||'').trim().toLowerCase().replace(/\s+/g,' '),String(row[6]||'Casa').trim().toLowerCase()].join('|');}
function readCompletedOperation_(data){
  if(!data.operationId)return null;
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(String(data.operationId)))throw new Error('Identificativo salvataggio non valido');
  const raw=PropertiesService.getScriptProperties().getProperty('c80_operation_'+data.operationId);if(!raw)return null;
  const entry=JSON.parse(raw);if(entry.hash!==calendarFingerprint_([[JSON.stringify(data)]],[]))throw new Error('Identificativo salvataggio già usato per dati diversi');return entry.response;
}
function rememberCompletedOperation_(data,response){
  if(!data.operationId)return;
  const props=PropertiesService.getScriptProperties();props.setProperty('c80_operation_'+data.operationId,JSON.stringify({at:Date.now(),hash:calendarFingerprint_([[JSON.stringify(data)]],[]),response:response}));
  const completed=Object.entries(props.getProperties()).filter(([key])=>key.indexOf('c80_operation_')===0).map(([key,value])=>({key:key,at:JSON.parse(value).at})).sort((a,b)=>b.at-a.at);
  completed.forEach((entry,index)=>{if(index>=200||Date.now()-entry.at>7*86400000)props.deleteProperty(entry.key);});
}

/** Riparazione esplicita: nessuna eliminazione di copie durante la manutenzione. */
function buildDuplicateRepairPlan_(){
  const plan={calendar:[],attendance:[],manual:[]},sheet=SpreadsheetApp.getActive().getSheetByName('Calendario'),seen={};
  if(sheet){const range=sheet.getDataRange(),raw=range.getValues(),formulas=range.getFormulas(),rows=raw.map(row=>calendarReadableRow_(row,raw[0]));rows.slice(1).forEach((row,index)=>{
    if(!isCalendarGameRow_(row)||!String(row[5]||'').trim())return;
    const key=gameIdentity_(row),full=calendarDuplicateProof_(raw[index+1],formulas[index+1]||[],raw[0]),old=seen[key];
    if(old&&old.full===full)plan.calendar.push({row:index+2,keep:old.row,proof:full,team:calendarTeam_(row),date:formatDate_(row[3]),detail:'Copia identica della riga '+old.row+'; stessi mister, risultato, note e dati aggiuntivi'});
    else if(old)plan.manual.push({sheet:'Calendario',date:formatDate_(row[3]),detail:'Gare simili ma dati diversi: righe '+old.row+' e '+(index+2)+'. Conservate entrambe'});
    else seen[key]={row:index+2,full:full};
  });}
  CRESOLE_TEAMS.forEach(team=>{
    const attendance=SpreadsheetApp.getActive().getSheetByName(team);if(!attendance)return;
    const range=attendance.getDataRange(),values=range.getValues(),formulas=range.getFormulas(),stat=findStatStart_(values[0])||values[0].length+1,assenti=findAssentiRow_(attendance),days={};
    for(let col=2;col<stat;col++){
      const date=parseDate_(values[0][col-1]);if(isNaN(date)||!values[0][col-1])continue;
      const day=syncDateKey_(date),used=values.slice(2,assenti-1).filter((row,index)=>String(row[col-1]||'').trim()||(formulas[index+2]||[])[col-1]).length;
      (days[day]||(days[day]=[])).push({col:col,used:used,type:normalizeEventType_(values[1][col-1])});
    }
    Object.keys(days).forEach(day=>{
      const columns=days[day];if(columns.length<2)return;columns.sort((a,b)=>b.used-a.used||eventRank_(b.type)-eventRank_(a.type)||a.col-b.col);
      const highest=columns.slice().sort((a,b)=>eventRank_(b.type)-eventRank_(a.type))[0].type;
      columns.slice(1).forEach(column=>{
        const extra=values.slice(assenti).some((row,index)=>String(row[column.col-1]||'').trim()||(formulas[index+assenti]||[])[column.col-1]);
        if(!column.used&&!extra)plan.attendance.push({sheet:team,col:column.col,keep:columns[0].col,date:day,type:highest,detail:'Colonna senza presenze; conserva la colonna '+columnLetter_(columns[0].col)});
        else plan.manual.push({sheet:team,date:day,detail:'Colonne '+columnLetter_(columns[0].col)+' e '+columnLetter_(column.col)+' con dati: nessuna eliminazione automatica'});
      });
    });
  });
  return plan;
}
function calendarDuplicateProof_(raw,rawFormulas,headers){
  const row=calendarReadableRow_(raw,headers),proof=row.slice(),formulas=calendarReadableRow_(rawFormulas,headers).slice();
  proof[0]='';formulas[0]='';proof[1]=calendarTeam_(row);proof[2]=normalizeEventType_(row[2]);proof[3]=syncDateKey_(row[3]);proof[4]=calendarTimeText_(row[4]);proof[10]=calendarGroup_(row);
  return calendarFingerprint_([proof],[formulas]);
}
function emptyAttendanceCopy_(sheet,col,date){
  const range=sheet.getDataRange(),values=range.getValues(),formulas=range.getFormulas(),assenti=findAssentiRow_(sheet);
  if(!sameDate_(parseDate_(values[0][col-1]),parseDate_(date)))return false;
  return values.slice(2).every((row,index)=>index+3===assenti||(!String(row[col-1]||'').trim()&&!(formulas[index+2]||[])[col-1]));
}
function writeDuplicateRepairReport_(plan){
  const ss=SpreadsheetApp.getActive();let sheet=ss.getSheetByName('Controllo_Duplicati');if(!sheet)sheet=ss.insertSheet('Controllo_Duplicati');
  sheet.clear();const rows=[['Azione','Foglio','Data','Elemento','Dettaglio']];
  plan.calendar.forEach(item=>rows.push(['COPIA IDENTICA','Calendario',item.date,'Riga '+item.row,item.detail]));
  plan.attendance.forEach(item=>rows.push(['COLONNA VUOTA',item.sheet,item.date,columnLetter_(item.col),item.detail]));
  plan.manual.forEach(item=>rows.push(['CONTROLLO MANUALE',item.sheet,item.date,'',item.detail]));
  if(rows.length===1)rows.push(['NESSUNA AZIONE','','','','Nessun duplicato sicuro da rimuovere']);
  sheet.getRange(1,1,rows.length,5).setValues(rows);sheet.getRange(1,1,1,5).setBackground('#4338ca').setFontColor('#ffffff').setFontWeight('bold');sheet.setFrozenRows(1);sheet.setColumnWidth(5,440);sheet.activate();
}
function previewDuplicateRepair(){const plan=buildDuplicateRepairPlan_();writeDuplicateRepairReport_(plan);SpreadsheetApp.getUi().alert('Controllo pronto: '+plan.calendar.length+' copie identiche di gare, '+plan.attendance.length+' colonne vuote. Nessun dato modificato.');}
function applyDuplicateRepair(){
  const ui=SpreadsheetApp.getUi(),initial=buildDuplicateRepairPlan_();writeDuplicateRepairReport_(initial);
  if(!initial.calendar.length&&!initial.attendance.length){ui.alert('Nessun duplicato eliminabile automaticamente. Le righe con dati diversi sono conservate.');return;}
  if(ui.alert('Ripara duplicati sicuri','Rimuovere '+initial.calendar.length+' copie identiche di gare e '+initial.attendance.length+' colonne senza presenze? I fogli interessati verranno copiati prima della riparazione.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  const lock=LockService.getScriptLock();try{
    lock.waitLock(20000);const plan=buildDuplicateRepairPlan_(),ss=SpreadsheetApp.getActive(),stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss');
    const affected=[...new Set(plan.attendance.map(item=>item.sheet).concat(plan.calendar.length?['Calendario']:[]))];
    affected.forEach(name=>ss.getSheetByName(name).copyTo(ss).setName('Backup_Duplicati_'+name+'_'+stamp).hideSheet());
    plan.attendance.forEach(item=>{const sheet=ss.getSheetByName(item.sheet),cell=sheet.getRange(2,item.keep),raw=String(cell.getValue()||'');if(eventRank_(item.type)>eventRank_(raw))cell.setValue((raw.indexOf('🌧️')>-1?'🌧️ ':'')+item.type);});
    plan.calendar.slice().sort((a,b)=>b.row-a.row).forEach(item=>{
      const sheet=ss.getSheetByName('Calendario'),width=sheet.getLastColumn(),headers=sheet.getRange(1,1,1,width).getValues()[0],copy=sheet.getRange(item.row,1,1,width),original=sheet.getRange(item.keep,1,1,width);
      if(calendarDuplicateProof_(copy.getValues()[0],copy.getFormulas()[0],headers)!==item.proof||calendarDuplicateProof_(original.getValues()[0],original.getFormulas()[0],headers)!==item.proof)return;
      const removedId=String(copy.getValue()||''),keepId=String(original.getValue()||'');
      if(removedId&&keepId&&removedId!==keepId)relinkLineupGame_(removedId,keepId);
      sheet.deleteRow(item.row);
    });
    affected.filter(name=>name!=='Calendario').forEach(name=>{const sheet=ss.getSheetByName(name);plan.attendance.filter(item=>item.sheet===name).sort((a,b)=>b.col-a.col).forEach(item=>{if(emptyAttendanceCopy_(sheet,item.col,item.date))sheet.deleteColumn(item.col);});updateStats_(sheet);});
    if(ss.getSheetByName('Calendario'))formatCalendar_(ss.getSheetByName('Calendario'),true);
    writeDuplicateRepairReport_(buildDuplicateRepairPlan_());ui.alert('Riparazione completata. Gare diverse e colonne con presenze sono state conservate.');
  }catch(error){logError_('ripara duplicati',error);ui.alert(String(error.message||error));}finally{try{try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}catch(_){}}
}
function relinkLineupGame_(removedId,keepId){
  const props=PropertiesService.getDocumentProperties();Object.entries(props.getProperties()).filter(([key])=>key.indexOf('lineup_Formazioni_')===0).forEach(([key,value])=>{const lineup=JSON.parse(value);if(lineup.gameId===removedId){lineup.gameId=keepId;props.setProperty(key,JSON.stringify(lineup));}});
}
function logError_(where,error){try{const ss=SpreadsheetApp.getActive(),name='Log_Sistema';let s=ss.getSheetByName(name);if(!s){s=ss.insertSheet(name);s.getRange(1,1,1,3).setValues([['Quando','Dove','Errore']]);s.hideSheet();}s.appendRow([new Date(),where,String(error && error.stack || error)]);}catch(_){console.error(error);}}

/*
 * SINCRONIZZAZIONE AMMINISTRATIVA
 * Regole: i fogli squadra sono la fonte per date/tipi; Calendario conserva i
 * dettagli della gara; Allenatori è un riepilogo. Il piano non contiene mai
 * cancellazioni. I duplicati vengono soltanto elencati per controllo manuale.
 */
function buildFullSyncPlan_() {
  const teams=CRESOLE_TEAMS.filter(t=>t!=='Allenatori'), plan={actions:[],duplicates:[]}, actionKeys={}, teamMaps={};
  teams.forEach(team=>{teamMaps[team]=eventCountMap_(readTeamEventsForSync_(team),team);});
  const calendarEvents=readCalendarEventsForSync_(), calendarMap=eventCountMap_(calendarEvents);
  Object.keys(teamMaps).forEach(team=>collectDuplicateSyncKeys_(teamMaps[team],team,'Foglio squadra',plan));
  collectDuplicateSyncKeys_(calendarMap,'Calendario','Calendario',plan);
  const staffState=readStaffStateForSync_();

  teams.forEach(team=>readTeamEventsForSync_(team).forEach(event=>{
    planStaffSync_(staffState,event.date,event.type,'Foglio '+team,plan,actionKeys);
    if(isGameType_(event.type)) {
      const key=syncEventKey_(team,event.date,event.type);
      if(!calendarMap[key]) {
        addSyncAction_(plan,actionKeys,{kind:'calendar',team:team,date:event.date,type:event.type,source:'Foglio '+team,detail:'Aggiungere nel Calendario'});
        calendarMap[key]=1;
      }
    }
  }));

  calendarEvents.forEach(event=>{
    const team=event.team, key=syncEventKey_(team,event.date,event.type);
    if(!teamMaps[team][key]) {
      addSyncAction_(plan,actionKeys,{kind:'team',team:team,date:event.date,type:event.type,source:'Calendario',detail:'Aggiungere nel foglio squadra'});
      teamMaps[team][key]=1;
    }
    planStaffSync_(staffState,event.date,event.type,'Calendario ('+team+')',plan,actionKeys);
  });
  return plan;
}

function applyFullSyncPlan_(plan) {
  let calendarSheet=getCalendar_();
  plan.actions.filter(x=>x.kind==='staff').forEach(x=>ensureStaffEvent_(x.date,x.type));
  plan.actions.filter(x=>x.kind==='team').forEach(x=>ensureEventColumn_(x.team,x.date,x.type));
  plan.actions.filter(x=>x.kind==='calendar').forEach(x=>{
    appendCalendarEventForSync_(calendarSheet,x.team,x.date,x.type);
  });
  // Una sola riformattazione, invece di una per ogni gara inserita.
  formatCalendar_(calendarSheet);
}

function appendCalendarEventForSync_(sheet,team,date,type) {
  const rows=sheet.getDataRange().getValues();
  for(let r=1;r<rows.length;r++)if(isCalendarGameRow_(rows[r])&&calendarTeam_(rows[r])===team&&sameDate_(parseDate_(rows[r][3]),date))return false;
  const row=sheet.getLastRow()+1;
  ensureCalendarSize_(sheet,row,11);
  sheet.getRange(row,1,1,11).setValues([[Utilities.getUuid(),team,normalizeEventType_(type),date,'','','Casa','','','','']]);
  sheet.getRange(row,4).setNumberFormat('dd/MM/yyyy');
  return true;
}

function readTeamEventsForSync_(team) {
  const sheet=getSheet_(team), values=sheet.getDataRange().getValues(), headers=values[0]||[], stat=findStatStart_(headers)||headers.length+1, events=[];
  for(let c=1;c<stat-1;c++) {
    const date=parseDate_(headers[c]), type=normalizeEventType_((values[1]||[])[c]);
    if(!isNaN(date)&&type)events.push({team:team,date:date,type:type});
  }
  return events;
}

function readCalendarEventsForSync_() {
  const sheet=SpreadsheetApp.getActive().getSheetByName('Calendario');
  if(!sheet||sheet.getLastRow()<2)return [];
  const values=sheet.getDataRange().getValues();return values.slice(1).map(row=>calendarReadableRow_(row,values[0])).filter(isCalendarGameRow_).map(row=>({team:calendarTeam_(row),type:normalizeEventType_(row[2]),date:parseDate_(row[3])}));
}

function readStaffStateForSync_() {
  const state={}, events=readTeamEventsForSync_('Allenatori');
  events.forEach(event=>{const key=syncDateKey_(event.date),old=state[key];if(!old||eventRank_(event.type)>eventRank_(old.type))state[key]={date:event.date,type:event.type};});
  return state;
}

function eventCountMap_(events,forcedTeam) {
  const map={};
  events.forEach(event=>{const key=syncEventKey_(forcedTeam||event.team,event.date,event.type);map[key]=(map[key]||0)+1;});
  return map;
}

function collectDuplicateSyncKeys_(map,team,origin,plan) {
  Object.keys(map).forEach(key=>{if(map[key]>1){const parts=key.split('|'),calendar=origin==='Calendario';plan.duplicates.push({team:parts[0],date:parts[1],type:parts[2],source:origin,informational:calendar,detail:calendar?'Più gare nello stesso giorno ('+map[key]+'): tutte conservate separatamente':'Duplicato ('+map[key]+' occorrenze): controllare manualmente'});}});
}

function planStaffSync_(staffState,date,type,source,plan,actionKeys) {
  const key=syncDateKey_(date), current=staffState[key];
  if(!current) {
    addSyncAction_(plan,actionKeys,{kind:'staff',team:'Allenatori',date:date,type:type,source:source,detail:'Aggiungere nel foglio Allenatori'});
    staffState[key]={date:date,type:type};
  } else if(eventRank_(type)>eventRank_(current.type)) {
    addSyncAction_(plan,actionKeys,{kind:'staff',team:'Allenatori',date:date,type:type,source:source,detail:'Aggiornare Allenatori: '+current.type+' → '+type});
    staffState[key]={date:date,type:type};
  }
}

function addSyncAction_(plan,actionKeys,action) {
  const key=action.kind+'|'+action.team+'|'+syncDateKey_(action.date)+'|'+action.type;
  if(actionKeys[key])return;
  actionKeys[key]=true;plan.actions.push(action);
}

function isGameType_(type){return ['Campionato','Amichevole','Torneo'].includes(normalizeEventType_(type));}
function syncDateKey_(date){return Utilities.formatDate(parseDate_(date),Session.getScriptTimeZone(),'yyyy-MM-dd');}
function syncEventKey_(team,date,type){return String(team)+'|'+syncDateKey_(date)+'|Giornata';}

function syncPlanSummary_(plan) {
  const count=kind=>plan.actions.filter(x=>x.kind===kind).length;
  return 'Correzioni previste: '+plan.actions.length+'\n• Allenatori: '+count('staff')+'\n• Fogli squadra: '+count('team')+'\n• Calendario: '+count('calendar')+'\n• Duplicati da controllare: '+plan.duplicates.filter(item=>!item.informational).length+'\n• Giorni con più gare conservate: '+plan.duplicates.filter(item=>item.informational).length;
}

function writeFullSyncReport_(plan,status) {
  const ss=SpreadsheetApp.getActive(),name='Controllo_Sincronizzazione';let sheet=ss.getSheetByName(name);
  if(!sheet)sheet=ss.insertSheet(name);
  sheet.getDataRange().breakApart();sheet.clear();
  const rows=[['STATO: '+status,'','','','',''],['','','','','',''],['Azione','Squadra','Data','Tipo evento','Origine','Dettaglio']];
  plan.actions.forEach(action=>rows.push([action.kind==='staff'?'ALLENATORI':action.kind==='team'?'FOGLIO SQUADRA':'CALENDARIO',action.team,formatDate_(action.date),action.type,action.source,action.detail]));
  plan.duplicates.forEach(item=>rows.push([item.informational?'GARE CONCOMITANTI':'CONTROLLO MANUALE',item.team,item.date,item.type,item.source,item.detail]));
  if(rows.length===3)rows.push(['NESSUNA AZIONE','','','','','Fogli già allineati']);
  sheet.getRange(1,1,rows.length,6).setValues(rows);
  sheet.getRange(1,1,1,6).merge().setBackground('#e0e7ff').setFontColor('#312e81').setFontWeight('bold');
  sheet.getRange(3,1,1,6).setBackground('#4338ca').setFontColor('#ffffff').setFontWeight('bold');
  if(rows.length>3)sheet.getRange(4,1,rows.length-3,6).createTextFinder('CONTROLLO MANUALE').matchEntireCell(true).findAll().forEach(cell=>sheet.getRange(cell.getRow(),1,1,6).setBackground('#fef3c7'));
  [170,150,100,130,190,360].forEach((width,index)=>sheet.setColumnWidth(index+1,width));
  sheet.setFrozenRows(3);sheet.activate();
}
