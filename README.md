# BackToRun

La tua app di preparazione alla maratona: piano, allenamenti guidati a blocchi con GPS del telefono o orologio, registrazione manuale o da file FIT, GPX e TCX, dolori per zona del corpo, lavori extra, test, andamento e schede con animazioni nella sezione Impara.

Ogni persona può usare il piano base, creare un piano per la propria gara (distanza, data, livello, giorni) oppure scrivere la propria tabella. Il piano personale sta in `user_plans`; il piano base resta quello di `shared/plan.json`. Il generatore è in `shared/generator.ts`.

Gira gratis su Cloudflare (Workers e D1). Tempo stimato per la pubblicazione: 15 minuti.

## Pubblicazione

Il database `backtorun-db` esiste già su Cloudflare e il suo ID è in `wrangler.toml`.

1. In Cloudflare apri **Workers & Pages**, scegli **Create application**, poi **GitHub**.
2. Scegli il repository `backtorun`. Il nome del Worker deve essere esattamente `backtorun`.
3. Comando di build: `npm run build`. Comando di deploy: `npx wrangler deploy`.
4. Conferma con **Save and Deploy**.
5. Nel Worker apri **Settings**, poi **Variables and Secrets**, e aggiungi il Secret `SETUP_CODE` con un codice inventato da te.
6. Apri l'indirizzo `workers.dev` con Chrome su Android, crea nome utente e password e installa l'app dal menu.
7. Chiudi e riapri l'app una volta: da quel momento funziona anche senza rete.

Dopo l'installazione, nell'app del tuo orologio puoi usare **Condividi** su un file FIT, GPX o TCX e scegliere BackToRun.

## Persone

Il primo account è l'amministratore. In **Impostazioni**, **Persone** puoi creare fino a 9 inviti: ogni link vale 7 giorni e una sola volta. Da lì generi anche una nuova password per chi l'ha persa, o elimini un profilo con i suoi dati. Ognuno vede solo i propri dati.

## Aggiornamenti

Ogni modifica caricata su GitHub viene pubblicata in automatico.

## Backup

In **Impostazioni** puoi scaricare un backup JSON e un CSV. Fai un backup al mese: il piano gratuito non è un archivio garantito.

## Limiti del piano gratuito

100.000 richieste API al giorno, 5 milioni di righe lette e 100.000 scritte al giorno, 5 GB di spazio. Per una persona sono ampiamente sufficienti.

## Sviluppo locale

    npm install
    npm run build
    npx wrangler dev --local    # usa .dev.vars con SETUP_CODE=...
    npm test

La libreria FIT di Garmin ha una propria licenza: `node_modules/@garmin/fitsdk/LICENSE.txt`.

## Forza, timer e routine

La logica sta in `shared/training.ts`, senza chiamate esterne. La scheda di forza (`#/forza`) traduce in numeri gli schemi del piano, salva le serie dentro l'attività (`sets`) e tiene la seduta aperta sul telefono finché non viene salvata. Il timer (`#/timer`) e le routine (`#/routine`) calcolano tutto dall'orologio e programmano in anticipo i suoni.

## Analisi delle corse

`shared/analysis.ts` calcola zone, tempo in zona, deriva cardiaca, carico settimanale e confronto della cadenza. La FC massima sta nello stato di ogni persona e le percentuali delle zone sono quelle della tabella Excel. Il dettaglio della corsa è in `#/corsa`.
