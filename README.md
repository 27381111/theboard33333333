# myblog

Blog anonimo in stile early internet / 4chan golden age.

## Requisiti

- Node.js 18+

## Avvio in locale

```bash
npm install
npm start
```

In locale usa **SQLite** (file `data/blog.db`). Post e like sono salvati lì.

- **Board:** http://localhost:31337
- **Admin:** http://localhost:31337/admin (protetto da password, vedi sotto)

## Deploy su Vercel

Post e like passano sempre da **database**:
- **In locale:** SQLite (file sul disco).
- **Su Vercel:** Postgres (Neon). Niente filesystem persistente, quindi serve un DB hosted.

### 1. Database Postgres (Neon)

1. Vai su [Vercel Marketplace](https://vercel.com/marketplace) e aggiungi l’integrazione **Neon** (o crea un progetto su [Neon](https://neon.tech)).
2. Collega il progetto Vercel al database: ti verranno impostate le variabili d’ambiente (es. `POSTGRES_URL` o `DATABASE_URL`).

### 2. Variabili d’ambiente su Vercel

Imposta nel progetto Vercel:

- `POSTGRES_URL` oppure `DATABASE_URL` — connection string del database Neon (di solito la imposta l’integrazione).
- `ADMIN_PASSWORD` — password per il pannello admin (/admin). Solo tu la conosci: impostala nelle variabili d’ambiente su Vercel (e in locale con `export ADMIN_PASSWORD="tua_password"` prima di `npm start` se vuoi usare l’admin in locale).

### 3. Deploy

```bash
vercel
```

Oppure connetti il repo GitHub a Vercel: il deploy si farà ai push.

### 4. Immagini su Vercel

Su Vercel il filesystem non è persistente: i file caricati in `public/uploads` **non vengono conservati** tra una richiesta e l’altra.

Opzioni:

- **Vercel Blob:** aggiungi l’integrazione “Vercel Blob” al progetto e (se vuoi) adatta il codice per salvare le immagini lì e mettere l’URL nel post.
- **Niente immagini in produzione:** puoi usare solo titolo e testo e lasciare il campo immagine vuoto.

In locale le immagini restano in `public/uploads` e funzionano normalmente.

## Admin

- Creare post (titolo, descrizione, immagine opzionale).
- Eliminare post.

## Struttura

- `server.js` — Express, route, upload.
- `lib/db.js` — accesso al DB (SQLite in locale, Postgres su Vercel).
- `data/blog.db` — database SQLite (solo in locale).
- `public/` — CSS e upload immagini (in locale).
- `views/` — template EJS.
- `api/index.js` — entry point per Vercel serverless.
- `vercel.json` — configurazione deploy Vercel.
