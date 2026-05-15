# InsightCollector

Applicazione web per la raccolta, validazione e condivisione di insight professionali all'interno di un'organizzazione.

## Funzionalita'

**Raccolta insight**
Chiunque puo' inserire osservazioni di campo tramite un form strutturato (titolo, cliente, settore, categoria, team, testo). E' disponibile sia l'inserimento manuale sia uno strumento di parsing AI che estrae i campi da testo libero, con supporto opzionale all'input vocale via trascrizione audio.

**Flusso di validazione**
Gli insight vengono salvati come bozze e resi visibili a tutta l'organizzazione solo dopo l'approvazione di un Team Leader. Questo garantisce la qualita' e la pertinenza dei contenuti condivisi.

**Esplora Dati**
Vista a griglia degli insight pubblicati con filtri per cliente, settore e categoria e ricerca full-text. Ogni insight e' aperto in una modale con dettaglio completo e la possibilita' di segnalarlo come utile (upvote).

**Classifica**
Podio individuale e ranking per team basati su un sistema a punti: ogni insight pubblicato vale 50 punti, ogni upvote ricevuto vale 10.

**Analytics**
Dashboard con grafici Chart.js: distribuzione per categoria, velocita' di inserimento settimanale, top clienti per numero di insight, contributo dei team. Filtrabili per periodo e con esportazione CSV.

**AI Assistant (Brain)**
Interfaccia chat che interroga il database degli insight pubblicati tramite un modello LLM. Le risposte citano esplicitamente gli insight rilevanti con riferimenti cliccabili che aprono la modale di dettaglio.

**Content Studio**
Genera post social (LinkedIn, Instagram, Twitter) o report di sintesi a partire dagli insight selezionati o da una direttiva testuale. Il contesto e' sempre costruito sugli insight reali nel database, con regole anti-allucinazione che impediscono al modello di citare fonti esterne.

**Gestione Team**
Ogni utente puo' creare team e aggiungere membri tramite un picker con ricerca per nome o email sul database utenti. I team sono usati per filtrare le bozze da validare e le analisi.

## Stack tecnico

- **Frontend**: HTML/CSS/JavaScript vanilla, Single Page Application con routing client-side
- **Backend**: Vercel Serverless Functions (`/api`)
- **Database e Auth**: Supabase (PostgreSQL + Row Level Security)
- **AI**: Groq API con modello `llama-3.3-70b-versatile`; trascrizione audio via Whisper
- **Grafici**: Chart.js

## Struttura del progetto

```
/
|-- index.html          # Struttura HTML e viste SPA
|-- style.css           # Stili globali con variabili CSS e media query
|-- app.js              # Logica applicativa completa (auth, render, eventi)
|-- api/
|   |-- ask-brain.js    # Endpoint AI Assistant
|   |-- content-studio.js # Endpoint generazione contenuti
|   |-- parse-insight.js  # Endpoint parsing AI del form
|   |-- transcribe.js     # Endpoint trascrizione audio
```

## Variabili d'ambiente

| Variabile | Descrizione |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chiave anonima Supabase |
| `GROQ_API_KEY` | Chiave API Groq |

## Ruoli utente

Il sistema usa un livello numerico per determinare i permessi. I ruoli principali in ordine crescente di accesso sono: `consulente`, `team_leader`, `responsabile`, `lead`, `engagement_manager`, `practice_manager`, `bu_manager`, `admin`. I ruoli staff (`marketing`, `sales`, `hr`, `operations`) hanno accesso al Content Studio ma non alle funzioni gestionali.

## Deploy

Il progetto e' pensato per il deploy su Vercel. Le variabili d'ambiente vanno configurate nel dashboard Vercel. Supabase richiede la creazione manuale delle tabelle `insights`, `profiles`, `teams`, `team_members`, `clients` e `user_upvotes`.
