# BackToRun

Regola obbligatoria: ogni nuova funzione, o modifica visibile a chi usa l'app, va descritta in italiano nella guida `src/help.ts` nello stesso aggiornamento, cambiando anche `GUIDE_DATE`. Se una funzione viene tolta, va tolta anche dalla guida.

Il codice è pubblicato in automatico da Cloudflare a ogni push su `main`.

Regola obbligatoria: ogni pubblicazione con effetti per chi usa l'app aggiunge in cima a `CHANGELOG.md` una nuova versione, nel formato `## X.Y.Z - AAAA-MM-GG`, con le sezioni `### Aggiunto`, `### Modificato` e `### Tolto` usate quando servono, e aggiorna `version` in `package.json` allo stesso numero. Cresce Y per una funzione nuova o cambiata, con Z a 0, e Z per una correzione. Le pubblicazioni solo tecniche non creano una versione. L'app mostra questo file nella pagina Novità e un test controlla che versione e formato siano coerenti.
