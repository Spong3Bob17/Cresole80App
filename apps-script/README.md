# Backend Google Apps Script

Il backend non deve vivere soltanto nell'editor web di Apps Script. Esportarlo e salvarlo qui con il nome `Codice.gs` prima di una modifica importante o di un rilascio.

## Procedura consigliata

1. Aprire il progetto Apps Script collegato al foglio principale.
2. Copiare tutto il contenuto del file di backend.
3. Creare o aggiornare `apps-script/Codice.gs` nella repository.
4. Fare le modifiche sul file versionato.
5. Incollare il risultato nell'editor Apps Script.
6. Creare una nuova versione della Web App e distribuire.
7. Dopo questo aggiornamento, ricaricare il Foglio Google ed eseguire **Amministrazione Cresole 80 → Sistema Calendario e attiva manutenzione**. Autorizzare il comando: salva una copia iniziale, sistema il calendario e installa il riordino automatico per gli inserimenti manuali. Dallo stesso account, il comando riutilizza eventuali trigger già installati.

## Verifica locale del Calendario

Eseguire dalla cartella del progetto:

```text
node tests/calendar.test.cjs
node tests/app.test.cjs
```

I test verificano la conservazione delle gare e dei loro dati durante aggiunte e riordini, la separazione delle gare concomitanti, le righe vuote, l'ordine cronologico, le formule, i backup e la manutenzione. Usano una simulazione dei servizi di Google Sheets; l'attivazione dei trigger richiede il progetto Apps Script reale.

Per l'aggiornamento 2017 A/B e convocati bisogna pubblicare anche il nuovo `index.html`. Seguire [le istruzioni di migrazione](../docs/2017-A-B-E-CONVOCATI.md). La riparazione dei duplicati vecchi è un comando separato con anteprima e backup, non una cancellazione automatica durante il riordino.

Non pubblicare in questo file ID di fogli, password, token o chiavi private.
