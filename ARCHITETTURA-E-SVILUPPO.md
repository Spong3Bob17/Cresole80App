# Architettura e sviluppo

## Obiettivo

L'applicazione gestisce le presenze delle squadre, le formazioni, il calendario delle gare e la disponibilità degli allenatori. Google Sheets rimane il pannello operativo leggibile dallo staff; l'app offre un inserimento più semplice da PC e telefono.

## Architettura attuale

```text
Utente → GitHub Pages (index.html) → Web App Google Apps Script → Foglio Google
                                                        ├─ schede delle squadre
                                                        ├─ Allenatori
                                                        ├─ Calendario
                                                        └─ Formazioni_<squadra>_<gara>
```

L'app non accede direttamente al foglio: ogni lettura e salvataggio passa dalla Web App Apps Script. Questo è importante: il foglio non deve essere esposto al pubblico.

## Dati e responsabilità dei fogli

| Foglio | Contenuto | Regola |
|---|---|---|
| `Esordienti2`, `Pulcini2`, `Pulcini1`, `Primi_Calci`, `Piccoli_Amici` | Elenco atleti e presenze della squadra | Una colonna per ogni evento |
| `Allenatori` | Elenco allenatori e disponibilità a tutti gli eventi | Non è una squadra e non deve ricevere gare proprie |
| `Calendario` | Solo Campionato, Amichevole e Torneo delle squadre | È il riepilogo delle gare |
| `Formazioni_<squadra>_<id gara>` | Formazione per una gara, tempi, piazzati, corner e panchina | Generato dall'app |
| `Log_Sistema` | Errori tecnici | Nascosto, da consultare solo in caso di problemi |

## Flussi supportati

1. Un allenamento creato nell'app viene inserito nel foglio della squadra e nel foglio `Allenatori`.
2. Una partita, amichevole o torneo creato nell'app viene inserito nel foglio della squadra, in `Calendario` e in `Allenatori`.
3. Una nuova colonna evento creata manualmente nella riga Data e nella riga Tipo del foglio di una squadra viene rilevata dallo script. Se è una gara, viene aggiunta anche al calendario; tutti gli eventi vengono riportati agli allenatori.
4. Una nuova riga valida aggiunta manualmente in `Calendario` viene riportata nel foglio della relativa squadra e in `Allenatori` alla prima lettura del calendario dall'app.
5. Le formazioni sono legate all'identificativo della gara e possono includere i quattro tempi, giocatori per calci piazzati, difesa su corner avversario e panchina calcolata automaticamente.

Per gli allenatori, in uno stesso giorno viene conservato un unico evento: la priorità è Campionato, poi Amichevole, poi Torneo, poi Allenamento. In questo modo non ci sono colonne duplicate nel loro foglio.

## Regole tecniche importanti

- L'ID nel foglio `Calendario` è tecnico: deve rimanere nascosto e non deve essere modificato o eliminato.
- I nomi dei fogli elencati sopra sono identificativi tecnici. Non rinominarli.
- Le prime due righe dei fogli squadra sono strutturali: data nella riga 1, tipo nella riga 2.
- Le colonne `Tot. P`, `Tot. A`, `Tot. G` e `Tot. I`, la riga `Assenti` e le formule sono strutturali.
- Le scritture dell'app passano attraverso `LockService` Apps Script, che evita sovrascritture quando due allenatori salvano nello stesso momento.
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
