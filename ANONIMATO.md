# Anonimato — checklist

L’app **non salva** IP, user-agent o altri dati che identificano visitatori o chi scrive. I like usano solo un cookie lato browser; i post sono solo titolo, testo e (opzionale) immagine.

Per massimizzare l’anonimato quando pubblichi e gestisci il blog:

## Account e deploy

- **Email:** usa un indirizzo anonimo (Proton, Tutanota, o alias usa-e-getta) per Vercel e per il DB (Neon).
- **GitHub:** se colleghi un repo, usa un account che non sia legato al tuo nome (o fai deploy solo da CLI con `vercel`, senza collegare repo).
- **Pagamento:** su Vercel il piano free non richiede carta. Se in futuro usi un piano a pagamento, considera metodi che espongono meno la tua identità.

## Quando accedi all’admin

- **Sempre in VPN** (o Tor) quando apri `/admin` e scrivi/modifichi post. Così l’IP che vede il provider non è il tuo di casa/ufficio.
- Non condividere il link all’admin (contiene la chiave). Usa un password manager o un posto sicuro solo tuo.

## Dominio

- Usare solo `*.vercel.app` riduce i collegamenti con chi sei (nessun whois, nessun acquisto dominio).
- Se usi un dominio proprio, acquistalo in modo anonimo (es. con crypto) e verifica che il whois sia privato.

## Cosa l’app non fa (per design)

- Nessun salvataggio di IP, fingerprint o log delle richieste.
- Nessuna data/ora precisa sui post (solo “today”, “yesterday”, ecc.).
- In produzione l’URL dell’admin non viene scritto nei log del server.

## Riassunto

Più anonimato = account anonimi + VPN (o Tor) quando usi l’admin + niente dominio personale riconducibile a te. Il codice è già pensato per non tracciare chi legge o chi scrive.
