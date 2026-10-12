# 2017 A/B, giocatori disponibili e duplicati

## Cosa cambia

`Pulcini1` è la categoria 2017. Rosa, foglio delle presenze, statistiche e divise rimangono unici. La distinzione A/B riguarda soltanto le gare e le formazioni. Per le nuove sedute si riutilizza una sola colonna per categoria e giorno, anche quando A e B giocano due partite o ci sono tipi diversi di evento. Il tipo giornaliero usa la priorità Campionato, Amichevole, Torneo, Allenamento/Ritiro. Le presenze già registrate non vengono spostate né modificate dal nuovo inserimento.

Una presenza giornaliera indica la disponibilità della giornata: non distingue le due partite. La lista dei convocati appartiene esclusivamente alla formazione corrente e non scrive alcuna presenza o statistica.

## Attivare l'aggiornamento

1. Copiare il contenuto aggiornato di `apps-script/Codice.gs` in Apps Script e salvare.
2. Distribuire una nuova versione della Web App sullo stesso URL `/exec`.
3. Pubblicare il nuovo `index.html` su GitHub Pages.
4. Ricaricare il Foglio Google e usare **Amministrazione Cresole 80 → Sistema Calendario e attiva manutenzione**. Il comando può essere ripetuto dallo stesso account: riutilizza i trigger già installati.
5. Aggiornare l'app sul telefono e verificare la comparsa del selettore A/B nelle formazioni.

Non rinominare il foglio `Pulcini1`: è il foglio comune delle presenze. Non creare copie delle rose per A e B.

## Assegnare le gare già inserite

Le gare esistenti vengono conservate con i loro ID, date, orari, avversari, mister, risultati e note. Il programma non decide autonomamente quali siano A o B: inizialmente rimangono **da assegnare**.

Nell'app:

1. Aprire Pulcini 1 — 2017 e Calendario Gare.
2. Aprire una gara esistente, scegliere **2017 A** o **2017 B** e premere Salva.
3. Usare il filtro Tutte / A / B / Da assegnare per controllare il risultato.

Nel Foglio Google:

1. Aprire `Calendario`.
2. Nella nuova colonna **Gruppo** (K), selezionare `A` o `B` sulla riga della gara esistente.
3. Lasciare **Squadra** come `Pulcini1` e attendere la manutenzione.

Il calendario ha blocchi 2017 A, 2017 B e Da assegnare, ordinati per data e ora. La colonna Gruppo viene aggiunta senza spostare i primi dieci campi; eventuali colonne personalizzate già presenti a destra vengono conservate. Se erano già state scritte le etichette `Pulcini1A`/`Pulcini1B` nella colonna Squadra, la manutenzione le riconosce e le converte in categoria comune e Gruppo.

Per creare una nuova gara usare A o B nel modulo di inserimento. Due gare con stessa data e avversario ma gruppi diversi restano separate. Se non si conosce ancora il gruppo, lasciarlo da assegnare. Per correggere o assegnare una gara già presente, aprire quella gara: non crearne una nuova.

## Preparare le formazioni

1. Aprire Formazioni & Campo.
2. Per i 2017 selezionare A oppure B. Per le altre categorie non cambia il selettore della squadra.
3. Se desiderato, scegliere una gara di riferimento. La lista mostra soltanto le gare della categoria e del gruppo selezionato.
4. Espandere **Giocatori disponibili / convocati**, selezionare i giocatori per quella formazione e premere **Applica giocatori selezionati**.
5. Preparare tempi, panchina, sostituzioni e calci piazzati; premere Salva Formazione.

Con **Usa rosa completa**, tutti i giocatori della categoria e i prestiti rimangono disponibili. Una selezione vuota significa invece nessun convocato. Panchina, scelta dei giocatori per il campo e riepilogo dei tempi si riferiscono soltanto alla lista applicata. Se si esclude un atleta già schierato, l'app chiede conferma prima di rimuoverlo dai campetti.

La selezione dei convocati è disponibile anche per Esordienti, Pulcini 2 e Primi Calci. Non trasferisce atleti tra categorie e non li segna come presenti o assenti. I prestiti rimangono relativi alla formazione corrente.

A e B hanno due schede fisse, `Formazioni_Pulcini1_A` e `Formazioni_Pulcini1_B`, aggiornate per la gara successiva. Non si creano fogli a ogni partita. Il vecchio `Formazioni_Pulcini1` resta conservato: dall'app si può usare **Importa la formazione precedente non assegnata** per copiarlo nella bozza A o B, poi salvarla esplicitamente.

La formazione e la lista sono quelle correnti: collegare una gara è un riferimento, non crea un archivio delle formazioni di tutte le partite.

## Convocati direttamente nel Foglio Google

Nella scheda Formazioni corrispondente, le colonne W:Y mostrano giocatori, checkbox Convocato e origine Rosa/Prestito. Attivare **Usa lista convocati** in X1 e spuntare gli atleti desiderati in X. Disattivare X1 per utilizzare nuovamente l'intera rosa.

L'app legge queste checkbox al successivo caricamento della formazione. La manutenzione aggiorna anche le tendine e la panchina del foglio dopo le modifiche manuali. Le assegnazioni già presenti non vengono cancellate dal cambio di checkbox: se si esclude un atleta schierato, correggere il campetto prima di salvare nuovamente dall'app.

## Perché si creavano copie e come evitarle

Il backend normalizza le etichette: `amichevole`, `Amichevole` e le varianti con spazi indicano lo stesso tipo. Inoltre ogni salvataggio dell'app ha un identificativo che rimane uguale durante i retry e la sincronizzazione offline. La creazione ripetuta di una gara con stessa categoria, gruppo, data, tipo, ora, avversario e campo riutilizza la gara esistente, senza sovrascriverne risultato o nota.

La manutenzione non elimina automaticamente le copie vecchie. Per sistemarle:

1. Usare **Amministrazione Cresole 80 → Anteprima duplicati**.
2. Controllare il foglio `Controllo_Duplicati`.
3. Usare **Ripara duplicati sicuri (con backup)** e confermare se l'anteprima è corretta.

Il comando rimuove soltanto copie complete di gare con tutti gli altri dati identici, oppure colonne giornaliere duplicate senza presenze, formule sugli atleti o altri dati. Prima copia i fogli interessati in schede di backup nascoste. Righe con note, risultati, mister, formule o dati aggiuntivi diversi e colonne delle presenze compilate restano conservate e segnalate per controllo manuale. Due gare A/B non vengono considerate la stessa gara. Se una formazione era collegata all'ID di una copia eliminata, il riferimento salvato viene spostato sulla gara conservata.

Il foglio `Controllo_Duplicati`, come `Controllo_Sincronizzazione`, è soltanto un report: eliminarlo non cancella gare o presenze; verrà ricreato al controllo successivo.
