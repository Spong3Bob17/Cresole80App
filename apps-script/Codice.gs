/**
 * Backend Cresole 80. Da incollare integralmente nel progetto Apps Script e
 * distribuire come nuova versione della Web App. I dati restano nel foglio.
 */
const CRESOLE_TEAMS = ['Esordienti2', 'Pulcini2', 'Pulcini1', 'Primi_Calci', 'Piccoli_Amici', 'Allenatori'];
const CRESOLE_STATUSES = ['Presente', 'Assente', 'Giustificato', 'Infortunato', ''];

/** Sincronizza le colonne create manualmente nei fogli presenze. */
function onEdit(e) {
  try {
    const range=e && e.range; if(!range) return;
    const sheet=range.getSheet(), team=sheet.getName(), col=range.getColumn(), row=range.getRow();
    if(!CRESOLE_TEAMS.includes(team)||team==='Allenatori'||col<2||(row!==1&&row!==2))return;
    const date=parseDate_(sheet.getRange(1,col).getValue()), type=String(sheet.getRange(2,col).getValue()||'').replace('🌧️','').trim();
    if(isNaN(date)||!type)return;
    ensureStaffEvent_(date,type);
    if(['Campionato','Amichevole','Torneo'].includes(type)) upsertCalendarFromAttendance_(team,date,type);
  } catch(error) { logError_('onEdit',error); }
}

function doGet(e) {
  try {
    const team = cleanTeam_(e.parameter.team || 'Esordienti2');
    const mode = e.parameter.mode || 'presenze';
    if (mode === 'calendario') return json_(Object.assign({status:'success'},getGames_(team)));
    if (mode === 'formazioni') return json_({status:'success', team:team, lineups:readLineup_(team)});
    return json_(getAttendance_(team, mode, e.parameter.allHistory === 'true'));
  } catch (error) { logError_('GET', error); return json_({status:'error', message:'Impossibile caricare i dati.'}); }
}

function doPost(e) {
  const lock = LockService.getDocumentLock();
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Richiesta vuota');
    const data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== 'object') throw new Error('Dati non validi');
    lock.waitLock(20000); // impedisce sovrascritture tra due allenatori
    const team = cleanTeam_(data.team || 'Esordienti2');
    let result;
    switch (data.action) {
      case 'saveAttendance': result = saveAttendance_(team, data); break;
      case 'addPlayer': result = addPlayer_(team, data.name); break;
      case 'addEvent': result = addEvent_(team, data); break;
      case 'saveLineup': result = saveLineup_(team, data); break;
      case 'saveGame': result = saveGame_(team, data); break;
      default: throw new Error('Azione non riconosciuta');
    }
    return json_(Object.assign({status:'success'}, result || {}));
  } catch (error) { logError_('POST', error); return json_({status:'error', message:error.message || 'Salvataggio non riuscito.'}); }
  finally { try { lock.releaseLock(); } catch (_) {} }
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
    rawEvents.push({col:c+1,date:formatDate_(values[0][c]),type:type.replace('🌧️','').trim()||'Allenamento',isRain:type.indexOf('🌧️')>-1,dateObj:parseDate_(values[0][c])});
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
  const type=safeText_(data.type || 'Allenamento',40); if(['Amichevole','Campionato','Torneo'].includes(type) && !safeText_(data.opponent,80)) throw new Error('Per una partita inserisci l’avversario'); const sheet=getSheet_(team), last=sheet.getLastColumn(), stat=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0]) || last+1;
  const dates=sheet.getRange(1,2,1,stat-2).getValues()[0]; let col=stat;
  for(let i=0;i<dates.length;i++) if(dates[i] && parseDate_(dates[i]) > date) {col=i+2;break;}
  sheet.insertColumnBefore(col); const source=sheet.getRange(1,Math.max(2,col-1),sheet.getLastRow(),1), target=sheet.getRange(1,col,sheet.getLastRow(),1); source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false); source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false); target.offset(2,0,Math.max(0,sheet.getLastRow()-2),1).clearContent();
  sheet.getRange(1,col).setValue(date).setNumberFormat('dd/MM/yyyy'); sheet.getRange(2,col).setValue(type); updateAssentiFormula_(sheet,col); updateStats_(sheet); if(team!=='Allenatori')ensureStaffEvent_(date,type);
  let game=null; if(['Amichevole','Campionato','Torneo'].includes(type)) game=saveGame_(team,{date:data.date,time:data.time,opponent:data.opponent,venue:data.venue,type:type,coaches:data.coaches||[]});
  return {newEvent:{col:col,date:formatDate_(date),type:type,isRain:false},game:game};
}

function getGames_(team) {
  const sheet=getCalendar_(), values=sheet.getDataRange().getValues(), all=team==='Allenatori', coaches=getPlayerNames_('Allenatori');
  const rows=[],manualRows=[]; values.slice(1).forEach((r,index)=>{const eventTeam=String(r[1]||''),type=String(r[2]||''),date=parseDate_(r[3]);if(!CRESOLE_TEAMS.includes(eventTeam)||eventTeam==='Allenatori'||!['Campionato','Amichevole','Torneo'].includes(type)||isNaN(date))return;rows.push(r);if(!r[0]){r[0]=Utilities.getUuid();sheet.getRange(index+2,1).setValue(r[0]);manualRows.push(r);}});
  if(manualRows.length){manualRows.forEach(r=>syncCalendarEvent_(String(r[1]),parseDate_(r[3]),String(r[2]||'Campionato')));formatCalendar_(sheet);}
  const games=rows.filter(r=>all || String(r[1])===team).map(r=>({id:String(r[0]),team:String(r[1]),type:String(r[2]||'Campionato'),date:formatDate_(r[3]),dateIso:Utilities.formatDate(parseDate_(r[3]),Session.getScriptTimeZone(),'yyyy-MM-dd'),time:String(r[4]||''),opponent:String(r[5]||''),venue:String(r[6]||'Casa'),coaches:splitCoaches_(r[7])}));
  games.sort((a,b)=>(a.dateIso+a.time).localeCompare(b.dateIso+b.time)); return {games:games,coaches:coaches};
}

function upsertCalendarFromAttendance_(team,date,type){
  const sheet=getCalendar_(), rows=sheet.getDataRange().getValues();
  for(let r=1;r<rows.length;r++)if(String(rows[r][1])===team&&String(rows[r][2])===type&&sameDate_(parseDate_(rows[r][3]),date))return;
  const row=sheet.getLastRow()+1;sheet.getRange(row,1,1,8).setValues([[Utilities.getUuid(),team,type,date,'','','Casa','']]);sheet.getRange(row,4).setNumberFormat('dd/MM/yyyy');formatCalendar_(sheet);
}

function saveGame_(team,data) {
  if(team==='Allenatori') throw new Error('Seleziona una squadra, non Staff'); const date=parseDate_(data.date), opponent=safeText_(data.opponent,80), venue=data.venue==='Fuori'?'Fuori':'Casa', time=/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time||'')?data.time:'', type=eventType_(data.type || 'Campionato'), coaches=validateCoaches_(data.coaches || []);
  if(isNaN(date)||!opponent) throw new Error('Data o avversario non validi'); const sheet=getCalendar_(), id=String(data.id||''); let row=0;
  if(id) { const ids=sheet.getRange(2,1,Math.max(0,sheet.getLastRow()-1),1).getValues(); for(let i=0;i<ids.length;i++)if(String(ids[i][0])===id){row=i+2;break;} }
  if(!row){row=sheet.getLastRow()+1; sheet.getRange(row,1).setValue(Utilities.getUuid());} sheet.getRange(row,2,1,7).setValues([[team,type,date,time,opponent,venue,coaches.join(', ')]]); sheet.getRange(row,4).setNumberFormat('dd/MM/yyyy'); syncCalendarEvent_(team,date,type); formatCalendar_(sheet); return {message:'Evento salvato'};
}

function saveLineup_(team,data) {
  if(['Piccoli_Amici','Allenatori'].includes(team)) throw new Error('Categoria senza modulo tattico');
  const lineup=normalizeLineup_(team,data.lineup||{}), name='Formazioni_'+team;
  const ss=SpreadsheetApp.getActive(), sheet=ss.getSheetByName(name)||ss.insertSheet(name), allowed=getPlayerNames_(team).concat(lineup.prestiti);
  validateLineup_(lineup,allowed); drawLineup_(sheet,lineup,team,allowed); return {message:'Formazione salvata'};
}

function readLineup_(team) {
  const empty=normalizeLineup_(team,{}), name='Formazioni_'+team, sheet=SpreadsheetApp.getActive().getSheetByName(name); if(!sheet)return empty;
  const props=PropertiesService.getDocumentProperties().getProperty('lineup_'+name), result=props?normalizeLineup_(team,JSON.parse(props)):empty;
  lineupOffsets_(tempoKeys_(result).length).forEach((p,i)=>{const t=result['tempo'+(i+1)],map=roleCells_(sheet,p.r,p.c,team);Object.keys(map).forEach(role=>t.titolari[role]=String(map[role].getValue()||'').trim());['angoli','palo1','palo2','ultimo'].forEach((key,n)=>t.piazzati[key]=String(sheet.getRange(p.r+1+n,p.c+8).getValue()||'').trim());['palo','vertice','contropiede'].forEach((key,n)=>t.difesaCorner[key]=String(sheet.getRange(p.r+7+n,p.c+8).getValue()||'').trim());});return result;
}

function tempoKeys_(lineup){return Object.keys(lineup).filter(k=>/^tempo\d+$/.test(k)).sort((a,b)=>Number(a.slice(5))-Number(b.slice(5)));}
function lineupOffsets_(count){const base=[{r:3,c:2},{r:3,c:12},{r:18,c:2},{r:18,c:12}];for(let i=4;i<count;i++)base.push({r:34+(i-4)*15,c:2});return base;}
function normalizeLineup_(team,lineup) { const x={prestiti:Array.isArray(lineup.prestiti)?lineup.prestiti.map(n=>safeText_(n,80)).filter(Boolean):[]}, keys=Object.keys(lineup).filter(k=>/^tempo\d+$/.test(k));['tempo1','tempo2','tempo3','tempo4'].forEach(t=>{if(!keys.includes(t))keys.push(t);});keys.forEach(t=>{const current=lineup[t]||{};x[t]={titolari:Object.assign({},current.titolari),piazzati:Object.assign({},current.piazzati),difesaCorner:Object.assign({},current.difesaCorner),sostituzioni:Object.assign({},current.sostituzioni)};delete x[t].difesaCorner.alto;}); return x; }
function validateLineup_(lineup,allowed) { tempoKeys_(lineup).forEach(t=>{const current=lineup[t], starters=Object.values(current.titolari).filter(Boolean); if(new Set(starters).size!==starters.length)throw new Error('Un atleta è schierato due volte'); starters.forEach(n=>{if(!allowed.includes(n))throw new Error('Atleta non valido');}); Object.values(current.piazzati).concat(Object.values(current.difesaCorner)).filter(Boolean).forEach(n=>{if(!starters.includes(n))throw new Error('Piazzati e corner devono essere giocatori in campo');});const incoming=[];Object.keys(current.sostituzioni||{}).forEach(role=>{const sub=current.sostituzioni[role]||{},out=String(sub.out||''),into=String(sub.in||'');if(!out&&!into)return;if(current.titolari[role]!==out||!allowed.includes(into)||starters.includes(into))throw new Error('Sostituzione non valida');incoming.push(into);});if(new Set(incoming).size!==incoming.length)throw new Error('Un atleta non può entrare due volte nello stesso tempo');}); }

function drawLineup_(sheet,lineup,team,players) {
  const offsets=lineupOffsets_(tempoKeys_(lineup).length), rule=players.length?SpreadsheetApp.newDataValidation().requireValueInList(players,true).setAllowInvalid(false).build():null;
  offsets.forEach((p,i)=>{const t=lineup['tempo'+(i+1)], pitch=sheet.getRange(p.r,p.c,11,7); pitch.clearContent(); pitch.setBorder(true,true,true,true,false,false,'#15803d',SpreadsheetApp.BorderStyle.SOLID_MEDIUM); sheet.getRange(p.r,p.c+2,1,3).setBorder(true,true,true,true,false,false,'#000000',SpreadsheetApp.BorderStyle.SOLID); sheet.getRange(p.r-1,p.c).setValue((i+1)+'° TEMPO').setFontWeight('bold'); const map=roleCells_(sheet,p.r,p.c,team); Object.keys(map).forEach(role=>{map[role].setValue(t.titolari[role]||'').setHorizontalAlignment('center').setFontSize(9);if(rule)map[role].setDataValidation(rule);}); writeBlock_(sheet,p.r,p.c+7,'Piazzati',t.piazzati,['angoli','palo1','palo2','ultimo'],['Angoli','1° Palo','2° Palo','Ultimo'],rule);sheet.getRange(p.r+10,p.c+7,1,2).clearContent().clearDataValidations();writeBlock_(sheet,p.r+6,p.c+7,'Corner avversario',t.difesaCorner,['palo','vertice','contropiede'],['Palo','Vertice','Contropiede'],rule);writeBench_(sheet,p.r+11,p.c,players.filter(name=>!Object.values(t.titolari).includes(name)),t.sostituzioni);});
  PropertiesService.getDocumentProperties().setProperty('lineup_'+sheet.getName(),JSON.stringify(lineup));
}
function roleCells_(sheet,r,c,team){if(team.indexOf('Esordienti')>-1)return {POR:sheet.getRange(r+1,c+3),DIF_SX:sheet.getRange(r+3,c+1),DIF_DX:sheet.getRange(r+3,c+5),MED_SX:sheet.getRange(r+5,c+2),MED_DX:sheet.getRange(r+5,c+4),EST_SX:sheet.getRange(r+6,c),TREQ:sheet.getRange(r+6,c+3),EST_DX:sheet.getRange(r+6,c+6),PUNTA:sheet.getRange(r+9,c+3)};if(team==='Primi_Calci')return {POR:sheet.getRange(r+1,c+3),DIF_SX:sheet.getRange(r+3,c+1),DIF_DX:sheet.getRange(r+3,c+5),CEN:sheet.getRange(r+5,c+3),PUNTA:sheet.getRange(r+8,c+3)};return {POR:sheet.getRange(r+1,c+3),DIF_SX:sheet.getRange(r+3,c+1),DIF_DX:sheet.getRange(r+3,c+5),CEN_SX:sheet.getRange(r+5,c+1),CEN_CC:sheet.getRange(r+5,c+3),CEN_DX:sheet.getRange(r+5,c+5),PUNTA:sheet.getRange(r+8,c+3)};}
function writeBlock_(sheet,row,col,title,data,keys,labels,rule){sheet.getRange(row,col,1,2).merge().setValue(title).setFontWeight('bold');keys.forEach((key,i)=>{sheet.getRange(row+1+i,col).setValue(labels[i]+':');const cell=sheet.getRange(row+1+i,col+1);cell.setValue(data[key]||'');if(rule)cell.setDataValidation(rule);});}
function writeBench_(sheet,row,col,players,sostituzioni){const swaps=Object.values(sostituzioni||{}).filter(x=>x&&x.out&&x.in).map(x=>x.out+' → '+x.in);sheet.getRange(row,col,1,7).merge().setValue('Panchina: '+(players.length?players.join(', '):'—')+(swaps.length?' | Sostituzioni metà tempo: '+swaps.join(', '):'')).setFontSize(9).setBackground('#f8fafc');}

function updateStats_(sheet) { const assenti=findAssentiRow_(sheet), last=sheet.getLastColumn(), first=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1, start='B', end=columnLetter_(first-1), labels=['Tot. P','Tot. A','Tot. G','Tot. I'], values=['Presente','Assente','Giustificato','Infortunato'], colors=['#dcfce7','#ffe4e6','#fef3c7','#f3e8ff']; if(sheet.getMaxColumns()<first+3)sheet.insertColumnsAfter(sheet.getMaxColumns(),first+3-sheet.getMaxColumns()); for(let i=0;i<4;i++){const col=first+i;sheet.getRange(1,col).setValue(labels[i]).setBackground(colors[i]);sheet.getRange(2,col).setValue('Riepilogo').setBackground(colors[i]);sheet.getRange(1,col,sheet.getLastRow(),1).clearDataValidations();for(let r=3;r<assenti;r++)sheet.getRange(r,col).setFormula('=COUNTIF('+start+r+':'+end+r+'; "'+values[i]+'")');} }
function updateAssentiFormula_(sheet,col){const row=findAssentiRow_(sheet);if(row>3){const l=columnLetter_(col);sheet.getRange(row,col).setFormula('=COUNTIF('+l+'3:'+l+(row-1)+'; "Assente")');}}
function findAssentiRow_(sheet){const a=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();for(let i=0;i<a.length;i++)if(String(a[i][0]).trim().toLowerCase()==='assenti')return i+1;throw new Error('Riga Assenti non trovata');}
function findStatStart_(headers){for(let i=1;i<headers.length;i++)if(String(headers[i]||'').trim().indexOf('Tot.')===0)return i+1;return 0;}
function getPlayerNames_(team){const s=getSheet_(team),r=findAssentiRow_(s);return s.getRange(3,1,Math.max(0,r-3),1).getValues().flat().map(x=>String(x).trim()).filter(Boolean);}
function getSheet_(team){const s=SpreadsheetApp.getActive().getSheetByName(team);if(!s)throw new Error('Scheda non trovata');return s;}
function getCalendar_(){const ss=SpreadsheetApp.getActive(),name='Calendario';let s=ss.getSheetByName(name);if(!s){s=ss.insertSheet(name);s.getRange(1,1,1,8).setValues([['ID','Squadra','Tipo','Data','Ora','Avversario','Campo','Mister']]);s.setFrozenRows(1);}const headers=s.getRange(1,1,1,Math.max(8,s.getLastColumn())).getValues()[0];if(String(headers[2]||'')!=='Tipo'){s.insertColumnAfter(2);s.insertColumnAfter(7);s.getRange(1,1,1,8).setValues([['ID','Squadra','Tipo','Data','Ora','Avversario','Campo','Mister']]);}return s;}
function eventType_(value){return ['Campionato','Amichevole','Torneo'].includes(String(value))?String(value):'Campionato';}
function splitCoaches_(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
function validateCoaches_(list){if(!Array.isArray(list))throw new Error('Mister non validi');const allowed=getPlayerNames_('Allenatori');const values=[...new Set(list.map(x=>safeText_(x,80)).filter(Boolean))];values.forEach(x=>{if(!allowed.includes(x))throw new Error('Mister non presente nella scheda Allenatori: '+x);});return values;}
function formatCalendar_(sheet){const cols=8,colors={Campionato:{bg:'#ede9fe',fg:'#5b21b6'},Amichevole:{bg:'#fce7f3',fg:'#9d174d'},Torneo:{bg:'#fef3c7',fg:'#92400e'}},teams=CRESOLE_TEAMS.filter(t=>t!=='Allenatori'),last=Math.max(2,sheet.getLastRow()),raw=sheet.getRange(2,1,last-1,cols).getValues(),data=raw.filter(r=>CRESOLE_TEAMS.includes(String(r[1]))&&String(r[1])!=='Allenatori'&&['Campionato','Amichevole','Torneo'].includes(String(r[2]))&&!isNaN(parseDate_(r[3])));data.sort((a,b)=>teams.indexOf(String(a[1]))-teams.indexOf(String(b[1]))||eventRank_(b[2])-eventRank_(a[2])||parseDate_(a[3])-parseDate_(b[3]));sheet.getRange(1,1,1,cols).setValues([['ID','Squadra','Tipo','Data','Ora','Avversario','Campo','Mister']]).setBackground('#4338ca').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');sheet.setFrozenRows(1);sheet.hideColumns(1);[20,130,115,95,80,190,90,220].forEach((w,i)=>sheet.setColumnWidth(i+1,w));sheet.getRange(2,1,last-1,cols).breakApart().clear({contentsOnly:false});let row=2;teams.forEach(team=>{sheet.getRange(row,2,1,7).merge().setValue(team.replace('_',' ')+' — CALENDARIO GARE').setBackground('#e0e7ff').setFontColor('#312e81').setFontWeight('bold').setFontSize(11);row++;const games=data.filter(r=>String(r[1])===team);if(!games.length){sheet.getRange(row,2,1,7).merge().setValue('Nessuna gara in programma').setBackground('#f8fafc').setFontColor('#64748b').setFontStyle('italic');row+=2;return;}sheet.getRange(row,1,games.length,cols).setValues(games);sheet.getRange(row,4,games.length,1).setNumberFormat('dd/MM/yyyy');games.forEach((game,i)=>{const color=colors[game[2]]||{bg:'#ffffff',fg:'#1f2937'};sheet.getRange(row+i,2,1,7).setBackground(color.bg).setFontColor(color.fg).setFontWeight('bold');});row+=games.length+1;});}
function syncCalendarEvent_(team,date,type){if(!CRESOLE_TEAMS.includes(team)||team==='Allenatori'||isNaN(date))return;ensureEventColumn_(team,date,type);ensureStaffEvent_(date,type);}
function ensureEventColumn_(team,date,type){const sheet=getSheet_(team), last=sheet.getLastColumn(), stat=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1, dates=sheet.getRange(1,2,1,stat-2).getValues()[0];for(let i=0;i<dates.length;i++)if(sameDate_(parseDate_(dates[i]),date)&&String(sheet.getRange(2,i+2).getValue()).replace('🌧️','').trim()===type)return;insertEventColumn_(sheet,date,type);}
function ensureStaffEvent_(date,type){const sheet=getSheet_('Allenatori'),last=sheet.getLastColumn(),stat=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1,dates=sheet.getRange(1,2,1,stat-2).getValues()[0];for(let i=0;i<dates.length;i++)if(sameDate_(parseDate_(dates[i]),date)){const cell=sheet.getRange(2,i+2),existing=String(cell.getValue()).replace('🌧️','').trim();if(eventRank_(type)>eventRank_(existing))cell.setValue(type);return;}insertEventColumn_(sheet,date,type);}
function insertEventColumn_(sheet,date,type){const last=sheet.getLastColumn(),stat=findStatStart_(sheet.getRange(1,1,1,last).getValues()[0])||last+1,dates=sheet.getRange(1,2,1,stat-2).getValues()[0];let col=stat;for(let i=0;i<dates.length;i++)if(dates[i]&&parseDate_(dates[i])>date){col=i+2;break;}sheet.insertColumnBefore(col);const source=sheet.getRange(1,Math.max(2,col-1),sheet.getLastRow(),1),target=sheet.getRange(1,col,sheet.getLastRow(),1);source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false);target.offset(2,0,Math.max(0,sheet.getLastRow()-2),1).clearContent();sheet.getRange(1,col).setValue(date).setNumberFormat('dd/MM/yyyy');sheet.getRange(2,col).setValue(type);updateAssentiFormula_(sheet,col);updateStats_(sheet);}
function eventRank_(type){return type==='Campionato'?3:type==='Amichevole'?2:type==='Torneo'?1:0;}
function sameDate_(a,b){return a instanceof Date && b instanceof Date && !isNaN(a) && !isNaN(b) && a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function cleanTeam_(team){team=String(team).replace('Presenze_','').replace('Formazioni_','');if(!CRESOLE_TEAMS.includes(team))throw new Error('Squadra non valida');return team;}
function safeText_(v,max){v=String(v||'').trim();if(v.length>max)throw new Error('Testo troppo lungo');return /^[=+\-@]/.test(v)?"'"+v:v;}
function parseDate_(d){if(d instanceof Date)return d;const p=String(d||'').split(/[-/]/);if(p.length===3)return p[0].length===4?new Date(+p[0],+p[1]-1,+p[2]):new Date(+p[2],+p[1]-1,+p[0]);return new Date(d);}
function formatDate_(d){const x=parseDate_(d);return Utilities.formatDate(x,Session.getScriptTimeZone(),'dd/MM/yyyy');}
function columnLetter_(n){let s='';while(n){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=(n-r-1)/26;}return s;}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function logError_(where,error){try{const ss=SpreadsheetApp.getActive(),name='Log_Sistema';let s=ss.getSheetByName(name);if(!s){s=ss.insertSheet(name);s.getRange(1,1,1,3).setValues([['Quando','Dove','Errore']]);s.hideSheet();}s.appendRow([new Date(),where,String(error && error.stack || error)]);}catch(_){console.error(error);}}

