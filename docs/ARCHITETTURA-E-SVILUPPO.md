# Architettura e sviluppo

## Obiettivo

L'applicazione gestisce le presenze delle squadre, le formazioni, il calendario delle gare e la disponibilità degli allenatori. Google Sheets rimane il pannello operativo leggibile dallo staff; l'app offre un inserimento più semplice da PC e telefono.

## Architettura attuale

```text
Utente → GitHub Pages (index.html) → Web App Google Apps Script → Foglio Google
                                                        ├─ schede delle squadre
                                                        ├─ Allenatori
                                                        ├─ Calendario
                                                        ├─ Formazioni_<squadra>
                                                        └─ Controllo_Sincronizzazione
```

L'app non accede direttamente al foglio: ogni lettura e salvataggio passa dalla Web App Apps Script. Questo è importante: il foglio non deve essere esposto al pubblico.

## Dati e responsabilità dei fogli

| Foglio | Contenuto | Regola |
|---|---|---|
| `Esordienti2`, `Pulcini2`, `Pulcini1`, `Primi_Calci`, `Piccoli_Amici` | Elenco atleti e presenze della categoria | I nuovi eventi riutilizzano una colonna per giorno; rosa e statistiche comuni ad A/B |
| `Allenatori` | Elenco allenatori e disponibilità a tutti gli eventi | Non è una squadra e non deve ricevere gare proprie |
| `Calendario` | Solo Campionato, Amichevole e Torneo delle squadre | È il riepilogo delle gare |
| `Divise` | Taglia, numero maglia e consegna di maglia/pantaloncini/calze | Una pagina suddivisa per squadra |
| `Formazioni_<squadra>` | Formazione corrente della squadra, tempi, piazzati, corner, panchina e sostituzioni | Generato dall'app |
| `Formazioni_Pulcini1_A`, `Formazioni_Pulcini1_B` | Formazioni correnti indipendenti delle squadre 2017 | Il vecchio `Formazioni_Pulcini1` resta conservato |
| `Log_Sistema` | Errori tecnici | Nascosto, da consultare solo in caso di problemi |

## Flussi supportati

1. Un allenamento creato nell'app viene inserito nel foglio della squadra e nel foglio `Allenatori`.
2. Una partita, amichevole o torneo creato nell'app viene inserito nel foglio della squadra, in `Calendario` e in `Allenatori`.
3. Una nuova colonna evento creata manualmente nella riga Data e nella riga Tipo del foglio di una squadra viene rilevata dallo script. Se è una gara, viene aggiunta anche al calendario; tutti gli eventi vengono riportati agli allenatori.
4. Dopo l'attivazione della manutenzione, una nuova riga valida aggiunta manualmente in `Calendario` viene riportata nel foglio della relativa squadra e in `Allenatori` dal processo automatico. La lettura del calendario dall'app non riscrive il foglio.
5. Ogni squadra usa una sola scheda formazioni, aggiornata per la gara successiva. Può contenere quattro o più tempi, giocatori per calci piazzati, difesa su corner avversario, panchina e sostituzioni di metà tempo.
6. Ogni gara può avere fino a quattro risultati parziali, un esito calcolato sui tempi e una nota. Il calendario conserva esito e nota nello stesso blocco della squadra.

Per gli allenatori, in uno stesso giorno viene conservato un unico evento: la priorità è Campionato, poi Amichevole, poi Torneo, poi Allenamento. In questo modo non ci sono colonne duplicate nel loro foglio.

## Sincronizzazione amministrativa controllata

Nel Foglio Google, il menu in alto `Amministrazione Cresole 80` offre due comandi pensati per rimettere in ordine inserimenti fatti a mano:

1. `Anteprima sincronizzazione completa` crea il foglio `Controllo_Sincronizzazione` e mostra esattamente quali righe mancano, senza modificare alcun dato.
2. `Applica correzioni mancanti` chiede una seconda conferma e applica solo le azioni dell'anteprima: aggiunge gli eventi mancanti nei fogli squadra, le gare mancanti in `Calendario` e gli eventi mancanti nel foglio `Allenatori`. Se nello stesso giorno il foglio Allenatori contiene un evento di priorità inferiore, lo aggiorna alla priorità maggiore.

Il comando non elimina eventi, non modifica presenze, risultati, note, avversari, orari o mister. Più gare della stessa categoria/data/tipo vengono indicate come `GARE CONCOMITANTI`, con il nome reale della categoria: vengono tutte conservate. Eventuali duplicati nelle colonne delle presenze restano segnalati per controllo manuale. Il menu è una protezione pratica, non una barriera di sicurezza: chi ha permesso di modifica sul file può comunque vederlo e usarlo.

## Integrità e manutenzione del Calendario

Eseguire una volta `Amministrazione Cresole 80 → Sistema Calendario e attiva manutenzione`, dall'account che gestisce il progetto. Il comando conserva una copia iniziale del foglio e installa due trigger: `maintainCalendar`, periodico, e `calendarStructureChanged`, per gli interventi sulla struttura del file. Ripeterlo dallo stesso account non crea altri trigger uguali.

- Ogni squadra ha un blocco, seguito da due righe vuote. Le gare sono ordinate per data e ora, indipendentemente dal tipo e dal momento di inserimento. Campionati, amichevoli e tornei mantengono i colori pastello; tutte le righe hanno Arial 10 senza corsivo. Titoli e risultati hanno una formattazione coerente.
- Il piano di riordino viene costruito in memoria, poi scritto con una sola `setValues`, senza svuotare prima i contenuti. Il foglio non contiene più celle unite nei blocchi: una copia/incolla o una riga inserita non può espandere una fusione sopra una gara.
- Il processo conserva tutte le righe dati, incluse formule e colonne aggiuntive. Le righe incomplete o non riconosciute vengono mostrate nella sezione `DA COMPLETARE — dati conservati`, anziché essere scartate.
- Gare nello stesso giorno non vengono fuse. Gli ID esistenti restano invariati; le righe prive di ID e le copie con ID ripetuto ricevono un identificativo distinto.
- Prima di una ricostruzione dei contenuti vengono aggiornati due fogli di backup a rotazione, `Backup_Calendario_1` e `Backup_Calendario_2`. `Backup_Calendario_Iniziale` resta la copia precedente al primo intervento. Questi tre fogli sono nascosti e non aumentano a ogni gara. Per consultarli usare il menu dei fogli nascosti di Google Sheets.
- POST, manutenzione e sincronizzazione amministrativa usano lo stesso `ScriptLock`. `onEdit` registra solo gli eventi da elaborare, incluse modifiche su più colonne. La manutenzione attende almeno 60 secondi dall'ultima modifica manuale; il riordino avviene normalmente entro circa 1–2 minuti dalla fine della compilazione. Anche il salvataggio dall'app rimanda il riordino se qualcuno sta compilando manualmente il foglio.
- Prima di riscrivere, lo script controlla nuovamente il contenuto: se è cambiato durante la preparazione, interrompe il riordino e riprova in seguito. Il lock coordina gli script, ma non blocca materialmente l'editor del Foglio Google; questo controllo riduce il rischio di conflitti con interventi manuali.
- Le intestazioni non riconosciute interrompono l'operazione; il backend non inserisce più colonne al centro dei dati indovinando la struttura. Le modifiche a gare e risultati con collegamenti ambigui si fermano invece di scegliere una partita a caso.

La manutenzione riguarda le aggiunte e il riordino. Non propaga automaticamente le cancellazioni o la rimozione delle vecchie colonne delle presenze dopo uno spostamento di data: rimangono operazioni amministrative da progettare separatamente.

I test locali si eseguono con `node tests/calendar.test.cjs` e `node tests/app.test.cjs`. Simulano le operazioni sui fogli e la logica dell'interfaccia, verificando conservazione dei dati, gare concomitanti, ordinamento, formule, backup, inserimenti manuali, liste dei convocati, retry e concorrenza. I trigger, le autorizzazioni e la resa visiva vanno poi verificati nel progetto Apps Script e nel browser reali.

## Categoria 2017 con squadre A/B

La categoria tecnica resta `Pulcini1`. Ogni gara può avere `group: A/B/''`; il foglio Calendario conserva i primi dieci campi e aggiunge `Gruppo` come undicesimo. Le etichette legacy `Pulcini1A/B` nel calendario vengono convertite conservando ID e dettagli. Le vecchie gare senza gruppo restano da assegnare, anziché essere attribuite a una squadra per ipotesi.

La chiave delle presenze è categoria e giorno. La chiave della gara contiene categoria, gruppo, data, tipo normalizzato, ora, avversario e campo; gli ID continuano a identificare le modifiche puntuali. Nessuna selezione dei convocati produce scritture sulle presenze.

Le formazioni hanno `convocati: null` per la rosa intera, `convocati: []` per una lista esplicitamente vuota, oppure un elenco di nomi ammessi in rosa/prestiti. `gameId` è un riferimento facoltativo alla gara dello stesso gruppo. Il backend valida titolari, sostituzioni e piazzati contro la lista disponibile. Le colonne W:Y del foglio Formazioni consentono la modifica manuale della lista; X1 attiva il filtro. Il processo periodico aggiorna tendine e panchina preservando le assegnazioni esistenti.

Caricamenti e bozze dell'app sono distinti per categoria/gruppo. Le risposte arrivate dopo un cambio di squadra vengono ignorate. I payload offline contengono il gruppo originale e un `operationId` stabile. Il backend conserva fino a 200 risposte completate per sette giorni e rifiuta il riutilizzo dello stesso identificativo con dati diversi. La creazione delle gare e delle sedute è inoltre idempotente sui rispettivi dati, anche per client precedenti.

I duplicati preesistenti vengono riparati soltanto con il comando amministrativo dedicato e con backup dei fogli interessati. La riparazione verifica nuovamente le righe prima di eliminarle, mantiene le copie con dati differenti e aggiorna eventuali riferimenti alle gare nelle formazioni salvate. Dettagli operativi nella [guida 2017 A/B e convocati](2017-A-B-E-CONVOCATI.md).

Riferimenti Google: [trigger semplici e limiti di onEdit](https://developers.google.com/apps-script/guides/triggers), [trigger installabili](https://developers.google.com/apps-script/guides/triggers/installable), [operazioni sui range](https://developers.google.com/apps-script/reference/spreadsheet/range).

## Regole tecniche importanti

- L'ID nel foglio `Calendario` è tecnico: deve rimanere nascosto e non deve essere modificato o eliminato.
- I nomi dei fogli elencati sopra sono identificativi tecnici. Non rinominarli.
- Le prime due righe dei fogli squadra sono strutturali: data nella riga 1, tipo nella riga 2.
- Le colonne `Tot. P`, `Tot. A`, `Tot. G` e `Tot. I`, la riga `Assenti` e le formule sono strutturali.
- Le scritture dell'app e le operazioni amministrative passano attraverso lo stesso `ScriptLock` Apps Script, che serializza le esecuzioni del progetto.
- L'app tenta nuovamente le richieste temporaneamente non raggiungibili e conserva localmente i salvataggi non inviati per riprovarli.

## Attività necessarie per una struttura solida

Queste sono le priorità, nell'ordine consigliato.

1. **Versionare il backend.** Esportare il file dall'editor Apps Script in `apps-script/Codice.gs` e conservarlo nella repository. Ogni modifica va fatta nel file versionato prima di copiarla in Apps Script. Non modificare solo l'editor Apps Script, altrimenti si perde la cronologia.
2. **Proteggere l'accesso.** L'attuale Web App, se distribuita come accessibile a chiunque, deve essere considerata pubblica: chi conosce l'URL può tentare chiamate all'API. La soluzione robusta è l'accesso con account Google autorizzati oppure un backend Firebase con Firebase Authentication e regole di sicurezza. Non mettere una password segreta fissa dentro `index.html`.
3. **Definire una sorgente primaria per ogni dato.** Finché il foglio e l'app sono entrambi modificabili, le regole di sincronizzazione devono restare esplicite. Per ora il foglio è la fonte amministrativa; l'app è il metodo preferito di inserimento.
4. **Completare modifiche ed eliminazioni.** La creazione manuale è sincronizzata; vanno ancora progettate e testate la modifica di un evento già esistente e la sua eliminazione, così da aggiornare o rimuovere correttamente tutte le copie collegate.
5. **Aggiungere tracciabilità.** Registrare chi ha creato o modificato presenze, eventi e formazioni, con data e ora. Il foglio `Log_Sistema` registra solo errori tecnici, non lo storico delle azioni.
6. **Backup e ripristino.** Creare un backup automatico giornaliero del file Google Sheets e verificare periodicamente che sia possibile ripristinarlo.
7. **Test di rilascio.** Prima di pubblicare: testare una presenza, un allenamento, una gara, una modifica gara, una formazione e la visualizzazione da telefono su almeno due squadre.
8. **Prestazioni.** Tenere leggere le risposte della Web App, leggere solo le colonne necessarie e usare cache per rose e dati che cambiano raramente. Se l'uso cresce, valutare Firestore come database operativo mantenendo Google Sheets come pannello e archivio.

## Sicurezza e privacy operativa

I dati di atleti minorenni e le informazioni su presenze/infortuni vanno trattati con attenzione. Condividere il foglio solo con persone autorizzate, evitare link pubblici, rimuovere rapidamente gli ex collaboratori e usare il minimo indispensabile di dati nell'app. Non inserire certificati, documenti, indirizzi o note sanitarie nel foglio delle presenze.

## Procedura di rilascio

1. Salvare e rivedere le modifiche nella repository.
2. Copiare l'intero contenuto di `apps-script/Codice.gs` nel progetto Apps Script collegato al foglio.
3. In Apps Script: **Distribuisci → Gestisci deployment → Modifica → Nuova versione → Esegui il deployment**.
4. Aprire l'URL `/exec` e verificare che restituisca JSON, non una pagina HTML di errore.
5. Pubblicare la parte frontend su GitHub Pages.
6. Aprire l'app da PC e smartphone, svuotando la cache del browser se compare una versione precedente.

## Evoluzione verso Firebase

Non è necessario migrare subito. Se aumentano utenti simultanei, richieste in tempo reale, notifiche o vincoli di accesso, la migrazione consigliata è graduale:

1. Firestore per calendario ed eventi;
2. sincronizzazione controllata verso Google Sheets;
3. presenze e formazioni;
4. autenticazione e ruoli.

Google Sheets deve restare una copia operativa ben formattata. Non è consigliato rendere Firestore e il foglio due database indipendenti modificabili senza una coda di sincronizzazione e regole contro i conflitti.
