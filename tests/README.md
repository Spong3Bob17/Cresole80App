# Verifica del campetto

Eseguire dalla cartella principale della repository:

```sh
node --test tests/app.test.cjs tests/calendar.test.cjs
```

I test automatici eseguono il JavaScript di `index.html` in Node con un DOM simulato e risposte API fittizie. Verificano rendering, gestori dei pulsanti HTML, convocati, cambio tempo, conferme/annullamento, svuotamento, prestiti, sostituzioni, salvataggio, caricamenti lenti o errati e separazione A/B. Non scrivono sui Fogli Google. Non sono una verifica visiva in un browser o su uno smartphone reale.

## Prova manuale isolata

```sh
node tests/serve-formation-fixture.cjs
```

Aprire `http://127.0.0.1:4173/` sullo stesso computer e scegliere Formazioni. Usare `?blocked-confirm=1` per simulare i dialoghi nativi bloccati. La prova usa quattro giocatori inventati e salvataggi solo in memoria; ricaricando si azzerano. Fermare il server con Ctrl+C. Non pubblicare questa pagina di prova su GitHub Pages e non incollarla nell'Apps Script.

Controlli manuali: togliere una spunta e cambiare tempo prima di Applica; confermare e annullare Applica/Svuota; aggiungere un quinto tempo; assegnare e rimuovere un giocatore; impostare una sostituzione dalla panchina; aggiungere un prestito; salvare e cambiare gruppo A/B. Lo svuotamento deve interessare soltanto il tempo indicato e nessuna operazione deve modificare le presenze.
