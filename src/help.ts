/* Guida dell'app. Regola: ogni nuova funzione si descrive qui nello stesso aggiornamento, e si cambia GUIDE_DATE. */
export const GUIDE_DATE = '4 novembre 2026'
export interface HelpItem { q: string; a: string[]; to?: [string, string] }
export interface HelpSection { id: string; title: string; items: HelpItem[] }
export const HELP: HelpSection[] = [
  { id: 'inizio', title: 'Per iniziare', items: [
    { q: "Cos'è BackToRun", a: ["È un'app per prepararti alla corsa: ti dice cosa fare ogni giorno, ti guida durante l'allenamento e tiene traccia di come stai andando."] },
    { q: 'Come la installo sul telefono', a: ["Apri l'indirizzo dell'app con Chrome su Android e scegli l'installazione dal menu del browser.", "Dopo l'installazione chiudila e riaprila una volta: da quel momento funziona anche senza rete."] },
    { q: 'Come mi muovo nell\'app', a: ['In basso trovi sempre cinque voci: Home, Allenati, Consulta, Impara e Profilo.', 'Il logo in alto a sinistra riporta alla Home.'] },
    { q: 'Quale piano scelgo', a: ['Puoi usare il piano base, creare un piano per la tua gara oppure scrivere la tua tabella. Se cambi piano, gli allenamenti registrati restano.'], to: ['mio-piano', 'Apri Il mio piano'] },
  ] },
  { id: 'home', title: 'Home', items: [
    { q: 'Cosa mostra', a: ['La seduta di oggi, con un pulsante per partire subito, e gli avvisi sul corpo se hai segnalato dolori o un blocco.', 'Se la seduta ha più blocchi, vedi anche il suo schema: la larghezza indica la durata stimata e l\'altezza l\'intensità.'] },
    { q: 'La domanda del mattino', a: ['Il giorno dopo una corsa l\'app chiede se hai gonfiore. La risposta serve alle regole di sicurezza del piano.'] },
  ] },
  { id: 'allenati', title: 'Allenarsi', items: [
    { q: 'La seduta del giorno', a: ['In Allenati vedi seduta, blocchi, fiato e fatica attesi. Da qui puoi fare il riscaldamento, avviare la guida, registrare e aprire la scheda che spiega il lavoro del giorno.'], to: ['oggi', 'Apri Allenati'] },
    { q: 'Come funziona l\'allenamento guidato', a: ['Tocca Avvia allenamento guidato, scegli come misurare la distanza, poi Prepara la partenza e Avvia.', 'L\'app annuncia ogni tratto con suoni, vibrazione e voce, e mostra quanto manca, il fiato atteso e il tratto successivo.', 'Lo schermo si blocca per evitare tocchi accidentali: tieni premuto il pulsante per sbloccarlo. Puoi mettere in pausa, saltare un tratto o terminare prima.', 'Alla fine vedi i tratti svolti e con un tocco passi alla registrazione, con i dati già inseriti.'] },
    { q: 'GPS del telefono o orologio', a: ['Con il GPS i tratti a distanza finiscono da soli. Con l\'orologio guardi i km sul polso e tocchi Fatto a fine tratto.', 'Se in Profilo non indichi un orologio, l\'app propone il GPS. Puoi comunque cambiare prima di ogni partenza.', 'Con il GPS tieni l\'app aperta e lo schermo acceso: a telefono bloccato GPS, suoni e vibrazione possono fermarsi.'] },
    { q: 'Costruire un allenamento', a: ['Il wizard ha tre passi: scegli un modello, adatti i blocchi e controlli fiato e fatica attesi.', 'I blocchi sono riscaldamento, corsa continua, ripetute, salite, allunghi e defaticamento. Ognuno può essere a tempo o a distanza, e puoi modificarlo, duplicarlo, spostarlo o toglierlo.'], to: ['costruisci', 'Costruisci un allenamento'] },
    { q: 'La forza', a: ['Scegli palestra o casa. Per ogni esercizio vedi serie, ripetizioni, recupero e cosa hai fatto l\'ultima volta, e l\'app suggerisce quando aumentare.', 'Spunta le serie: parte il recupero. Con Vedi come si fa apri l\'illustrazione dell\'esercizio.'] },
    { q: 'Routine e timer libero', a: ['Riscaldamento, defaticamento e mobilità sono sequenze a tempo con segnali a ogni cambio. Il timer libero alterna corsa e cammino.'], to: ['routine', 'Apri le routine'] },
  ] },
  { id: 'registra', title: 'Registrare', items: [
    { q: 'Registrare a mano', a: ['Indica tipo di attività, data, distanza, durata, fatica e, se vuoi, frequenza cardiaca e note. Per la corsa la fatica è obbligatoria, perché decide come proseguire.'], to: ['registra', 'Registra un allenamento'] },
    { q: 'Importare dall\'orologio', a: ['Esporta il file dall\'app del tuo orologio o da Strava e caricalo con Carica file. Sono accettati FIT, GPX, TCX e i file .gz degli archivi Strava, per corsa, bici e nuoto.', 'Su Android puoi anche usare Condividi sul file e scegliere BackToRun.', 'Se la data coincide con una corsa del piano, l\'allenamento si collega da solo alla seduta.'] },
    { q: 'Segnalare i dolori', a: ['Con Aggiungi una zona scegli una o più parti del corpo. Per ognuna indichi intensità da 0 a 10, lato e momento in cui è comparso il dolore.', 'Nel piano base il ginocchio è sempre presente. Le regole di sicurezza usano il valore più alto tra tutte le zone.', 'L\'app non fa diagnosi: se un dolore torna o peggiora, fatti visitare.'] },
  ] },
  { id: 'consulta', title: 'Consultare', items: [
    { q: 'Il piano', a: ['Mostra tutte le settimane divise per fase. Da ogni seduta puoi avviare la guida, registrare o leggere cos\'è quel lavoro.', 'Puoi ripetere una settimana, e saltare quelle indicate come saltabili: il calendario si aggiorna da solo.'], to: ['piano', 'Apri il piano'] },
    { q: 'Andamento', a: ['Raccoglie km fatti e previsti, carico, fatica, dolori, zone che tornano più spesso ed efficienza. Dal dettaglio di una corsa vedi anche grafici e intertempi, se ci sono i dati.'], to: ['andamento', 'Apri Andamento'] },
    { q: 'Il test della Scala', a: ['Sono cinque round di corsa facile, sempre più lunghi. Nel piano base il risultato indica da quale settimana partire; nei piani personali serve solo a misurarti.'], to: ['test', 'Apri il test'] },
    { q: 'Creare o modificare un piano', a: ['Per creare un piano indichi gara, data, livello attuale e giorni disponibili. L\'app avvisa se la data è troppo vicina.', 'In un piano personale puoi modificare ogni seduta con il wizard o scriverla a mano, duplicare le settimane e copiarle in quelle vuote.'], to: ['mio-piano', 'Apri Il mio piano'] },
  ] },
  { id: 'impara', title: 'Impara', items: [
    { q: 'Cosa trovi', a: ['Schede su tipi di allenamento, esercizi di forza e mobilità: a cosa servono, quando farli, come si eseguono ed errori comuni. Molte hanno un\'illustrazione e le fonti.', 'Puoi cercare per nome. Le illustrazioni funzionano anche offline: negli esercizi vedi la posizione iniziale e quella finale.'], to: ['impara', 'Apri Impara'] },
  ] },
  { id: 'profilo', title: 'Profilo', items: [
    { q: 'Calendario e gara', a: ['Puoi cambiare inizio del piano, settimana di partenza, data e nome della gara. Nei piani personali, se sposti la gara si sposta tutto il calendario.'], to: ['impostazioni', 'Apri Profilo'] },
    { q: 'Frequenza cardiaca e orologio', a: ['Con la FC massima l\'app calcola le zone e mostra i battiti durante la guida. Il valore più affidabile viene da un test o da una gara corta, non da una formula per età.', 'L\'orologio serve a scegliere come misurare la distanza negli allenamenti guidati.'] },
    { q: 'Backup', a: ['Scarica un backup una volta al mese. Il file JSON si può ripristinare; il CSV serve per consultare i dati in un foglio di calcolo.'] },
    { q: 'Invitare altre persone', a: ['Solo l\'amministratore vede la sezione Persone. Ogni invito vale una volta per 7 giorni, fino a 10 persone in tutto. Da lì puoi anche creare un link per una nuova password o eliminare un profilo.', 'Ognuno vede nell\'app solo i propri dati.'] },
  ] },
  { id: 'problemi', title: 'Problemi frequenti', items: [
    { q: 'Sono senza rete', a: ['Puoi continuare a usare l\'app. Quello che salvi resta in attesa e si sincronizza da solo quando torna la connessione. In alto vedi quanti dati sono in attesa.', 'Il primo avvio richiede la rete.'] },
    { q: 'Il GPS non parte o è debole', a: ['Controlla il permesso di posizione del browser e aspetta GPS pronto all\'aperto, lontano da edifici alti. Se non funziona, passa all\'orologio.'] },
    { q: 'Non sento suoni o voce', a: ['Controlla il volume e il silenzioso del telefono. Tieni lo schermo acceso con l\'app aperta.'] },
    { q: 'Non vedo l\'ultima versione', a: ['Chiudi e riapri l\'app. Se l\'icona resta vecchia, rimuovi l\'app e installala di nuovo: i dati stanno sul server e restano.'] },
    { q: 'Ho dimenticato la password', a: ['Chiedi all\'amministratore un link per crearne una nuova.'] },
  ] },
]
