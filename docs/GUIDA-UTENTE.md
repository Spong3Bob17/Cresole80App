# Guida per allenatori e segreteria

## A cosa serve l'app

L'app permette di gestire presenze, eventi, calendario e formazioni delle squadre del Cresole 80. Da telefono è preferibile usare l'app; il Foglio Google è utile per controlli e inserimenti amministrativi più manuali.

## Regola principale

Per una normale attività, inserire e modificare i dati dall'app. Usare il Foglio Google solo seguendo le regole di questa guida. Così le squadre, il calendario e gli allenatori rimangono allineati.

## Presenze

1. Aprire la squadra dalla barra laterale.
2. Scegliere la pagina Presenze.
3. Per ogni atleta selezionare Presente, Assente, Giustificato o Infortunato.
4. Se serve, attivare l'icona pioggia per l'evento.
5. Premere Salva e attendere il messaggio di conferma.

Se la connessione manca, non chiudere subito l'app: il salvataggio viene mantenuto localmente e verrà ritentato. Appena possibile, controllare che sia comparso il messaggio di salvataggio effettuato.

## Inserire un atleta

1. Entrare nella squadra corretta.
2. Usare il pulsante per aggiungere un giocatore.
3. Inserire solo nome e cognome, senza note personali o dati sanitari.
4. Salvare e controllare che l'atleta compaia anche nel foglio della squadra.

## Inserire un allenamento

1. Aprire la squadra.
2. Selezionare Aggiungi evento.
3. Selezionare `Allenamento` e la data.
4. Salvare.

L'allenamento viene aggiunto al foglio della squadra e alla disponibilità degli allenatori. Non compare nel foglio `Calendario`, che raccoglie solo gare, amichevoli e tornei.

## Inserire partita, amichevole o torneo

1. Aprire la squadra e il calendario.
2. Aggiungere la gara scegliendo tipo, data, ora, avversario e Casa/Fuori.
3. Selezionare uno o più mister presenti.
4. Salvare.

L'evento viene riportato automaticamente nel calendario generale, nel foglio della squadra e nel foglio `Allenatori`. Nell'app la casa è indicata con `🏠`, la trasferta con `✈️`.

La pagina degli allenatori visualizza gli eventi di tutte le squadre: allenamenti, partite, amichevoli e tornei. Da lì si consulta il programma; le gare si aggiungono dalla pagina della singola squadra.

## Inserire risultato e nota

1. Aprire Calendario e toccare la gara già creata.
2. Premere **Risultato e nota**.
3. Inserire i gol del Cresole e dell'avversario per ogni tempo disputato.
4. Aggiungere una nota libera, se serve, e salvare.

L'esito è calcolato contando i tempi: più tempi vinti significa `Vinto`, più tempi persi significa `Perso`; in parità è `Pareggiato`. Il foglio `Calendario` mostra il risultato in verde, rosso o giallo e conserva la nota a fianco.

## Gestione divise

1. Selezionare la squadra e aprire **Gestione Divise**.
2. Inserire taglia e numero di maglia.
3. Toccare `👕`, `🩳` o `🧦` quando l'articolo è stato consegnato: l'icona diventa verde.
4. Premere **Salva divise**.

Il foglio `Divise` viene creato automaticamente e contiene tutte le squadre nella stessa pagina. La sezione non è disponibile per gli allenatori.

## Formazioni

1. Selezionare la squadra e aprire Formazioni.
2. Compilare i giocatori in campo per ciascun tempo.
4. Indicare calci piazzati e difesa su corner avversario: palo, vertice e contropiede.
5. Salvare la formazione.

La panchina viene calcolata con i giocatori non schierati in quel tempo. Tocca un giocatore in panchina per indicare chi sostituirà a metà tempo: sul campetto comparirà `⇄` con il nome di chi entra. I nomi nei blocchi dei corner e dei piazzati devono essere giocatori effettivamente in campo in quel tempo. Se un torneo richiede più tempi, usa il pulsante laterale **Aggiungi Tempo / Campetto**.

Ogni squadra usa un foglio fisso, chiamato `Formazioni_<squadra>`. Per i 2017 ci sono due fogli distinti e fissi, `Formazioni_Pulcini1_A` e `Formazioni_Pulcini1_B`. La formazione è quella corrente: prima della gara successiva usa il pulsante di pulizia per preparare la nuova.

Nella sezione **Giocatori disponibili / convocati** puoi selezionare gli atleti utilizzabili per la formazione corrente, senza modificare presenze o statistiche. Per i 2017, il selettore A/B mantiene separate le due formazioni. Vedi la [guida a 2017 A/B e convocati](2017-A-B-E-CONVOCATI.md) per assegnare le gare esistenti, utilizzare le checkbox nel foglio e riparare le vecchie copie.

## Come usare il Foglio Google in sicurezza

### È possibile fare

- Inserire o aggiornare lo stato di presenza nelle celle degli atleti.
- Aggiungere un atleta inserendo una riga immediatamente **sopra** la riga `Assenti`, mantenendo formati e convalide della riga precedente.
- Creare manualmente un evento di una squadra aggiungendo una nuova colonna prima delle colonne `Tot.`: data nella riga 1 e tipo nella riga 2.
- Aggiungere una nuova gara nel foglio `Calendario` compilando squadra, tipo, data, ora, avversario, campo e mister. Lasciare vuota la colonna ID: la manutenzione la genera automaticamente.
- Compilare le celle della formazione e usare le tendine già presenti.

### Non modificare

- I nomi dei fogli delle squadre, `Allenatori`, `Calendario`, `Log_Sistema` e i fogli `Formazioni_...`.
- La riga 1 (date) e la riga 2 (tipi) delle colonne già esistenti.
- La riga `Assenti`.
- Le colonne di riepilogo che iniziano con `Tot.` e le loro formule.
- La colonna ID nascosta del foglio `Calendario`.
- I nomi standard dei tipi evento: `Allenamento`, `Campionato`, `Amichevole`, `Torneo`.
- Formattazioni, formule o convalide delle colonne evento, salvo che si sappia esattamente cosa si sta facendo.

## Inserire manualmente un evento nel foglio squadra

1. Individuare la prima colonna `Tot.` a destra delle presenze.
2. Inserire una colonna prima di essa.
3. Copiare formato e convalide dalla colonna evento vicina.
4. In riga 1 inserire la data come `gg/mm/aaaa`.
5. In riga 2 inserire uno dei tipi standard.

Per `Campionato`, `Amichevole` e `Torneo`, l'evento verrà riportato nel calendario generale al successivo aggiornamento. Per aggiungere avversario, ora, casa/fuori e mister, completare poi la riga nel foglio `Calendario` oppure usare l'app.

## Inserire manualmente una gara nel foglio Calendario

Inserire una nuova riga normale sotto all'ultimo blocco di squadra (non dentro una riga con il titolo della squadra) e compilare questi campi. Con la manutenzione attiva, la gara viene riordinata automaticamente nel blocco della squadra corretta, per data e ora:

| Colonna | Valore |
|---|---|
| Squadra | Nome esatto della squadra, ad esempio `Pulcini1` |
| Tipo | `Campionato`, `Amichevole` o `Torneo` |
| Data | Data della gara |
| Ora | Facoltativa, nel formato `HH:MM` |
| Avversario | Nome della squadra avversaria |
| Campo | `Casa` oppure `Fuori` |
| Mister | Uno o più nomi presenti nel foglio `Allenatori`, separati da virgola |
| Gruppo | Solo per `Pulcini1`: `A`, `B` oppure vuoto se da assegnare |

Non compilare né rendere visibile la colonna ID. Dopo aver terminato l'inserimento, attendere circa 1–2 minuti: la manutenzione mette in ordine il calendario e aggiunge l'evento alla squadra e agli allenatori, anche senza aprire l'app. Se una riga è incompleta, rimane visibile nella sezione `DA COMPLETARE — dati conservati`: completarla lì e attendere il prossimo riordino.

Se una categoria ha due partite nello stesso giorno, inserire due righe distinte con i rispettivi avversari e orari. Per i 2017 compilare anche il Gruppo A/B. Entrambe vengono conservate, con i propri mister, risultati e note. Per i nuovi eventi il foglio delle presenze riutilizza una sola colonna per categoria e giorno; per gli allenatori rimane il riepilogo giornaliero. Le copie vecchie non vengono unite silenziosamente: usare l'anteprima duplicati.

## Attivare il calendario ordinato automaticamente (una sola volta)

1. Incollare e salvare il backend aggiornato in Apps Script e distribuire una nuova versione della Web App.
2. Ricaricare il Foglio Google.
3. Aprire `Amministrazione Cresole 80 → Sistema Calendario e attiva manutenzione`.
4. Completare l'autorizzazione Google richiesta alla prima attivazione.

Il comando riordina le gare presenti mantenendo tutti i dati, salva una copia iniziale e attiva il riordino automatico per gli inserimenti successivi. Ogni squadra resta separata dalle altre con due righe vuote. Le righe usano tutte lo stesso stile; i colori distinguono il tipo di evento e l'esito. I backup sono tre fogli nascosti di numero fisso, consultabili dall'amministratore dal menu dei fogli nascosti.

## Rimettere in ordine eventi inseriti a mano (solo amministratore)

Se sono state aggiunte più date manualmente in fogli diversi, usare il menu in alto del Foglio Google `Amministrazione Cresole 80`:

1. Scegliere `Anteprima sincronizzazione completa`.
2. Leggere il nuovo foglio `Controllo_Sincronizzazione`: indica cosa verrebbe aggiunto e gli eventuali duplicati da controllare.
3. Solo se il prospetto è corretto, scegliere `Applica correzioni mancanti` e confermare.

La sincronizzazione aggiunge soltanto eventi mancanti tra i fogli squadra, il calendario gare e gli allenatori. Non cancella nulla e non modifica presenze, risultati, note, avversari, orari o mister. Le righe `GARE CONCOMITANTI` sono informazioni: più partite nello stesso giorno restano separate e non richiedono una correzione. I duplicati nelle presenze vanno valutati a mano.

## In caso di problema

- Se l'app carica lentamente, ricaricare una sola volta e verificare la connessione.
- Se compare “server non raggiungibile”, aspettare qualche secondo e riprovare: Apps Script può avere brevi ritardi di avvio.
- Se un evento manca in una pagina, verificare prima data e tipo nel foglio della squadra.
- Non creare lo stesso evento più volte per tentativi ripetuti. In caso di dubbio, controllare il calendario prima di inserirlo di nuovo.
- Per errori tecnici, l'amministratore può controllare il foglio nascosto `Log_Sistema`.
