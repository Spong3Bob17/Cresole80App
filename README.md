# S.S. Cresole 80 — Gestione presenze e formazioni

Applicazione web per organizzare presenze, calendario, partite e formazioni delle squadre del S.S. Cresole 80. L'interfaccia è pubblicata su GitHub Pages; i dati sono gestiti da Google Sheets tramite Google Apps Script.

## Documentazione

- [Architettura e sviluppo](docs/ARCHITETTURA-E-SVILUPPO.md): struttura, regole tecniche, sicurezza, distribuzione e attività ancora aperte.
- [Guida operativa](docs/GUIDA-UTENTE.md): uso dell'app e dei Fogli Google, con le modifiche consentite e quelle da non fare.

## Struttura della repository

```text
index.html              Applicazione web
manifest.json           Configurazione PWA
apps-script/            Istruzioni per esportare il backend Apps Script
docs/                   Documentazione tecnica e guida per gli utenti
```

## Pubblicazione rapida

1. Caricare `index.html`, `manifest.json` e la cartella `docs` su GitHub.
2. Esportare e versionare il backend Apps Script seguendo `apps-script/README.md`, poi copiarlo nell'editor Apps Script associato al foglio principale.
3. Creare una **nuova versione** della Web App Apps Script e distribuire l'aggiornamento.
4. Verificare che `API_URL` in `index.html` corrisponda all'URL `/exec` della Web App.

Le istruzioni complete, incluse le verifiche dopo ogni rilascio, sono nel documento tecnico.
