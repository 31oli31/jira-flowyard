# 🎄 Flowyard — 3D Jira Logistics Campus

Interaktive 3D-Visualisierung eines Jira-Boards: Tickets fahren als Pakete über
vier Förderbänder (To Do → In Progress → In Review → In Testing). Die Oberfläche
läuft komplett im Browser, **jede Jira-Kommunikation geht über den Node-Backend-
Proxy** – keine CORS-Probleme, keine Zugangsdaten im Frontend.

```
Browser ──HTTP──▶ Express (server/) ──Basic/Bearer──▶ Jira Cloud REST API
   │                    │
   │                    └─ data/settings.json (nicht-geheime UI-Einstellungen)
   └─ Three.js (lokal aus node_modules/three)
```

## Features

- **3D-Campus** mit Förderbändern, Gabelstaplern und fünf Themes (Corporate,
  Christmas, Halloween, Summer, Night Shift), gebaut mit Three.js 0.128. Jedes
  Theme bringt eigene Farben, Lichtstimmung, Deko und Wetterpartikel mit
  (Schnee, Glut, Blütenblätter, Neonfunken).
- **Live-KPIs**: Die Topbar zählt aktive Pakete, Tickets in Bearbeitung
  (`In Progress`, `In Review`, `In Testing`) und bereits ausgelieferte Pakete
  (`Released`) direkt aus den geladenen Tickets – keine geschätzten Werte.
- **Animate-Modus** (`A` oder ▶ in der Topbar): ein scripted Demo-Lauf schickt
  Pakete durch die Lanes, startet die Release-Animation und lässt den LKW
  pendeln. Rein visuell, ohne Schreibzugriffe auf Jira; im Live-Modus bleibt der
  Button bei einem Hinweis deaktiviert.
- **Theme-Auswahl** als barrierefreies Dropdown (Button + `listbox` mit
  Tastaturnavigation). Die Auswahl landet in `localStorage` und in der URL.
- **Besser erkennbare Tickets**: Der Jira-Key ist als Label direkt auf jedem
  Paket gedruckt; beim Hover zeigt der Tooltip zusätzlich den Ticket-Titel
  (sowie Status/Meta).
- **Lebendige Deko (Christmas)**: Elfen, Santa, Lebkuchen, Schneemänner,
  Nussknacker und Stand-Rentiere reagieren auf Klicks mit zufälligen
  Animationen (Hochspringen, Tanzen oder im Kreis rennen).
- **Schlitten-Release (Christmas)**: Bei einem Release fliegt der Schlitten
  mit Rentieren (statt wie der LKW zu fahren) von Tor 4 los, nimmt Anlauf,
  zieht einen Rundkurs über der Lagerhalle, variiert dabei die Flughöhe und
  wirft das Paket über der Lagerhalle ab, bevor er wieder landet. Die Strecke
  wird pro Flug neu als zufälliger, geschlossener Spline (centripetal
  Catmull-Rom, bogenlängenparametrisiert) erzeugt – Start und Landung liegen
  immer auf der geraden Straße, der Rundkurs dazwischen ist jedes Mal anders.
  Das Gespann fährt dabei immer vorwärts (Kurs folgt der tatsächlichen
  Fahrtrichtung) und der Schlitten knickt als Anhänger passend zum gefahrenen
  Kurvenverlauf ab. Nutzersteuerung (Fahren) unterbricht den Flug.
- **Fahrersicht (Cockpit)**: `C` oder 🎥 in den Szenen-Werkzeugen setzt die
  Kamera auf den Fahrersitz – beim Flug im Schlitten, beim Fahrbetrieb im LKW.
  Die Kamera wird vom Fahrzeug mitgeführt und blickt in Fahrtrichtung, inklusive
  Gieren, Nicken und (gedämpftem) Wanken; gerendert wird dafür eine echte
  Perspektivkamera statt der orthogonalen Übersicht. Mit gedrückter Maustaste
  lässt sich der Kopf drehen (begrenzter Blickwinkel, Doppelklick zentriert
  wieder); Ausschalten stellt die vorher eingestellte Ansicht exakt wieder her.
- **Easter Egg**: Klick auf den LKW (bzw. Schlitten im Christmas-Theme) macht
  ihn fahrbar – `WASD`/Pfeiltasten lenken, `Esc` lässt ihn stehen, ein
  Doppelklick setzt ihn zurück an die Ladefläche. Animate- und
  Release-Animationen übernehmen das Fahrzeug und beenden den Fahrbetrieb.
- **Aufgeräumte Oberfläche**: Das Ticket-Panel ist standardmäßig eingeklappt
  (`P` oder ☰ öffnet es) und die Jira-Einstellungen liegen in einer eigenen
  Schublade (⚙). Der Panel-Zustand wird lokal gemerkt.
- **Paket-Kontextmenü**: Rechtsklick auf ein Paket öffnet Aktionen für
  Workflow-Status, Release, Kamera-Fokus, „In Jira öffnen“ und „Ticket-Key
  kopieren“ – mit Tastaturnavigation und `Esc` zum Schließen.
- **Paket-Browser**: `/` oder 📦 öffnet eine durchsuchbare Paketliste mit
  Statusfiltern und Live-Zählern. Treffer werden im 3D-Campus hervorgehoben,
  nicht passende Pakete abgedunkelt; ein Klick selektiert das Paket, Enter
  öffnet zusätzlich das Detail-Panel.
- **Deep-Links**: `?theme=christmas` startet direkt im Christmas-Modus,
  `#JIRA-1026` (oder `?ticket=JIRA-1026`) selektiert ein Paket, zoomt darauf
  und öffnet das Detail-Panel. Auswahl und Theme werden in der URL gehalten,
  sodass sich Zustände verlinken lassen.
- **Sync-Feedback**: Ladezustand mit Skeletons in der Paketliste, ein
  Retry-/Settings-Banner bei Fehlern und ein Hinweis, wenn Jira keine Tickets
  liefert; Statusänderungen werden über eine Live-Region angekündigt.
- **Mock-Modus** ohne Jira-Zugang: 40 Beispielpakete, Workflow-Buttons und
  Ticket-Erstellung funktionieren lokal.
- **Live-Modus** gegen Jira Cloud: Tickets per JQL/Label/Projekt laden,
  automatisches Polling, Workflow-Status per Jira-Transition ändern,
  Tickets im Modal anlegen, Verbindung testen.
- **Status-Mapping**: beliebige Jira-Workflow-Namen werden auf sechs Lanes
  abgebildet (`To Do`, `In Progress`, `In Review`, `In Testing`, `Release`,
  `Released`) – inklusive Aliassen für gängige Namen und Overrides per
  `JIRA_STATUS_MAP`.
- **Sicherheit**: Credentials nur serverseitig, Rate-Limit, CSP/Security-Header,
  JQL-Injection-Schutz, validierte Settings, Timeouts und Retries.

## Schnellstart

Voraussetzung: Node.js ≥ 20.12 (entwickelt mit Node 24).

```bash
npm install
cp .env.example .env      # Werte eintragen
npm start                 # http://127.0.0.1:3000
```

Für Entwicklung mit Auto-Reload:

```bash
npm run dev
```

Ohne `.env` startet die App im Mock-Modus. Der Server meldet beim Start, ob
ein `.env` geladen wurde und ob der Jira-Proxy aktiv ist.

## Bedienung

| Eingabe | Wirkung |
|---------|---------|
| Linksklick auf Paket | Paket auswählen |
| Rechtsklick auf Paket | Kontextmenü: Details, Statuswechsel, Release, Jira-Link, Key kopieren |
| Doppelklick auf Paket | Nächster Workflow-Status |
| Klick auf LKW/Schlitten | Easter Egg: Fahrzeug übernehmen (`WASD` oder Pfeiltasten) |
| Klick auf Deko-Figur (Christmas) | Zufällige Animation: Springen, Tanzen oder Kreisrennen |
| Doppelklick auf LKW/Schlitten | Fahrzeug zurück zur Ladefläche setzen |
| `Esc` (im Fahrzeug) | Fahrzeug stehen lassen |
| `A` | Animate-Modus starten/stoppen |
| `C` | Fahrersicht/Cockpit ein-/ausschalten |
| `/` | Paket-Browser mit Suche und Statusfiltern öffnen |
| `P` | Ticket-Panel ein-/ausblenden |
| `Esc` | Theme-Menü, Kontextmenü, Paket-Browser, Einstellungen, Panel oder Modal schließen |
| 📦 in der Topbar | Paket-Browser öffnen |
| ⚙ in der Topbar | Jira-Einstellungen als Schublade öffnen |
| ▶ in der Topbar | Animate-Modus starten/stoppen |
| 🎥 in den Szenen-Werkzeugen | Fahrersicht/Cockpit ein-/ausschalten |

### Themes

| ID | Name | Stimmung |
|----|------|----------|
| `corporate` | Corporate | Tageslicht-Campus, kein Wetter |
| `christmas` | Christmas | Schnee, Werkstatt-Deko, rosa Himmel, Schlitten-Flug mit Paket-Abwurf bei Release |
| `halloween` | Halloween | Kürbisse, Fledermäuse, Nebel, Glut |
| `summer` | Summer | Hafen, Palmen, Blütenblätter |
| `neon` | Night Shift | Nachtschicht, Neonringe, Funken |

Das Theme ändert Palette, Licht, Deko und Wetterpartikel der Szene. Partikel werden
in drei Tiefenebenen gerendert; die vorderste Ebene ignoriert den Tiefenpuffer,
damit auch bei orthografischer Kamera immer sichtbare Flocken im Bild liegen.

### URL-Zustand

| Parameter | Beispiel | Wirkung |
|-----------|----------|---------|
| `theme` | `?theme=christmas` | Startet im Christmas-Modus (`corporate` ist Default und wird nicht geschrieben) |
| `ticket` | `?ticket=JIRA-1026` | Selektiert ein Paket und öffnet das Panel |
| Hash | `#JIRA-1026` | Wie `?ticket=`, gut für Slack- und Review-Links |

Die App schreibt die aktuelle Auswahl und das Theme per `history.replaceState`
zurück in die URL. Beim Wechsel des Themes wird der Theme-Parameter
entsprechend gesetzt oder entfernt.

## Konfiguration (`.env`)

`.env` wird ausschließlich serverseitig gelesen (`process.loadEnvFile`) und ist
per `.gitignore` ausgeschlossen.

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Listen-Adresse. Im Container `HOST=0.0.0.0`. |
| `JIRA_BASE_URL` | – | z. B. `https://your-domain.atlassian.net` |
| `JIRA_AUTH_MODE` | automatisch | `basic` (E-Mail + API-Token), `bearer` (PAT), `none` |
| `JIRA_EMAIL` | – | Atlassian-Konto für Basic Auth |
| `JIRA_API_TOKEN` | – | API-Token bzw. PAT |
| `JIRA_LABEL` | – | Startwert für den Label-Filter |
| `JIRA_PROJECT_KEY` | – | Startwert für den Projektfilter |
| `JIRA_ISSUE_KEY` | – | Ein einzelnes Ticket laden |
| `JIRA_QUANTITY_FIELD` | – | optionales Jira-Feld für die Paketmenge |
| `JIRA_POLL_INTERVAL_MS` | `15000` | Polling-Intervall |
| `JIRA_AUTO_REFRESH` | `true` | Auto-Refresh beim Start |
| `JIRA_MAX_RESULTS` | `200` | Obergrenze pro Suche |
| `JIRA_ISSUE_TYPE` | `Task` | Issuetype beim Anlegen |
| `JIRA_STATUS_MAP` | `{}` | JSON-Overrides, z. B. `{"Peer Review":"In Review"}` |
| `JIRA_TIMEOUT_MS` | `12000` | HTTP-Timeout pro Jira-Call |
| `JIRA_RETRIES` | `2` | Retries bei 429/5xx |
| `JIRA_CACHE_TTL_MS` | `5000` | Server-Cache für Suchergebnisse |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `240` | API-Rate-Limit |
| `SETTINGS_FILE` | `data/settings.json` | Pfad der UI-Einstellungen |

Nicht-geheime UI-Einstellungen (Label, Projekt, Intervall …) werden über
`PUT /api/config` in `data/settings.json` gespeichert. Die Datei wird atomar
geschrieben und beim Start gegen die Defaults validiert.

## Scripts

| Befehl | Zweck |
|--------|-------|
| `npm start` | Produktionsstart (`server/index.js`) |
| `npm run dev` | Start mit `--watch` |
| `npm test` | Alle Unit-/API-Tests (`node --test test/*.test.js`) |
| `npm run check` | Syntax-Check der Server- und Frontend-Module |
| `npm run build:extension` | Extension nach `dist/extension` bauen |
| `npm run dist` | Extension bauen + Store-Archive und Checksumen erzeugen |
| `npm run icons` | Extension-Icons neu generieren |

## API

Alle Routen liegen unter `/api`, antworten JSON und sind rate-limitiert.
Fehler haben die Form `{ "error": { "message": "...", "hint"?: "..." } }`.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/api/health` | Status, Version, `jiraConfigured` |
| `GET` | `/api/config` | App- und Jira-Konfiguration (ohne Secrets) + Capabilities |
| `PUT` | `/api/config` | Erlaubte Settings ändern: `label`, `projectKey`, `quantityField`, `issueKey`, `pollIntervalMs`, `autoRefresh`, `maxResults` |
| `GET` | `/api/jira/connection` | Verbindungstest (`/myself`) |
| `GET` | `/api/jira/projects` | Sichtbare Projekte (Key/Name) |
| `GET` | `/api/jira/tickets` | Suche; Query-Parameter `label`, `project`, `issueKey`, `maxResults` |
| `GET` | `/api/jira/tickets/:key` | Einzelnes Ticket |
| `POST` | `/api/jira/tickets` | Ticket anlegen (`summary` Pflicht; optional `projectKey`, `label`, `description`, `quantity`, `quantityField`, `issueType`) |
| `GET` | `/api/jira/tickets/:key/transitions` | Verfügbare Transitionen |
| `POST` | `/api/jira/tickets/:key/transitions` | Transition ausführen (`transitionId` oder `targetStatus`) |

Normalisiertes Ticket:

```json
{
  "tickets": [
    {
      "id": "DEMO-2219",
      "title": "Improve client decorator logging",
      "status": "In Progress",
      "jiraStatus": "In Progress",
      "quantity": 1,
      "tag": "#christmas-2026",
      "labels": ["christmas-2026"],
      "updated": "2026-11-09T23:06:01.316+0100",
      "priority": "Major",
      "assignee": "Alex Example",
      "issueType": "Task"
    }
  ],
  "meta": { "count": 1, "jql": "…", "cached": false, "fetchedAt": "…" }
}
```

## Status-Mapping

Kanonische Lanes: `To Do`, `In Progress`, `In Review`, `In Testing` – plus
`Release` und `Released` für abgeschlossene Workflows. Die Zuordnung passiert in
`server/lib/status.js`:

1. exakter Treffer auf einen kanonischen Namen,
2. Alias-Tabelle (z. B. `Code Reviewed`, `In Test PM`, `Ready For Integration`
   → `In Testing`; `In Code Review`, `Feedback` → `In Review`),
3. Override aus `JIRA_STATUS_MAP`,
4. Fallback `To Do`.

Workflow-Buttons senden den gewünschten Zielstatus; das Backend holt die
verfügbaren Transitionen und wählt die passende aus. Ist keine Transition
verfügbar (z. B. weil der Workflow sie nicht erlaubt), antwortet die API mit
einem erklärenden Fehler und das UI zeigt einen Toast.

## Projektstruktur

```
server/
  index.js            Bootstrap, .env laden, Server starten
  app.js              Express-App, Security-Header, Static Hosting
  config.js           Environment-Parsing und Defaults
  routes/api.js       REST-Endpunkte, Validierung, Transition-Auswahl
  lib/jira-client.js  Jira REST (Basic/Bearer, Retries, Timeout, Pagination)
  lib/status.js       Status-Mapping und Overrides
  lib/jql.js          JQL-Builder mit Escaping
  lib/normalize.js    Jira-Issue → Campus-Ticket
  lib/settings-store.js  Validierte, atomare JSON-Persistenz
  lib/cache.js        TTL-Cache
  lib/http.js         asyncHandler, Fehler, Rate-Limit
public/
  index.html          Markup, Import Map für Three.js
  css/styles.css      Layout, Themes, Modal, Toasts
  js/engine.js        Three.js-Szene (Campus, Tickets, Themes, Wetter, Demo-Animation)
  js/app.js           UI-State, Workflow, Modal, Polling
  js/api.js           Fetch-Wrapper für /api
test/                 node:test-Suiten (API, Jira-Client, JQL, Status, Settings, Extension)
extension-src/        Extension-Quellen: manifest.json, Options-Seite, portierte Jira-Module
scripts/              Build-Skripte (Extension-Build, Packaging, Icon-Generierung)
dist/                 Build-Ausgabe: extension/ + Store-Archive (gitignored)
data/settings.json    Laufzeit-Settings (gitignored)
```

Three.js wird nicht von einem CDN geladen, sondern aus
`node_modules/three` unter `/vendor/three` ausgeliefert und im Browser über
eine Inline-Import-Map als `three` / `three/addons/` aufgelöst. Deshalb erlaubt
die CSP `'unsafe-inline'` für `script-src`.

## Tests

```bash
npm test          # Unit-/API-Tests
npm run test:e2e  # Headless-Chrome-Smoke-Test der UI
```

Die Unit-Suiten decken ab: API-Routen inkl. Rate-Limit und Fehlerantworten,
Jira-Client (Auth, Pagination, Retry, Fallback auf Offset-Suche), JQL-Escaping
und Injection-Schutz, Status-Mapping/Aliase/Overrides sowie das atomare
Settings-Store-Verhalten inkl. defekter Datei.

`npm run test:e2e` startet einen eigenen Server auf Port `3311` (per
`E2E_PORT` änderbar) und prüft Panel-Zustand, Paket-Browser inkl. Suche,
Kontextmenü, Deep-Links, Theme-Menü samt URL-Update, Animate-Modus, die
datengetriebenen KPIs und den schmalen Viewport. Die Schnee-Sichtbarkeit wird
gemessen: derselbe Frame wird mit und ohne Wetterebene aufgenommen und die
abweichenden Pixel gezählt. Voraussetzung ist ein installiertes
Chrome/Chromium; der Pfad lässt sich über `CHROME_PATH` setzen. Fehlt der
Browser, wird der Test übersprungen statt fehlzuschlagen.

## Browser-Extension (Chrome & Firefox)

Der Campus läuft auch als eigenständige Browser-Extension (Manifest V3) – ganz
ohne den Node-Server. Die Jira-REST-API wird **direkt aus dem Browser**
aufgerufen; die Proxy-Logik (JQL-Builder, Status-Mapping, Normalisierung,
Transition-Auswahl, Validierung) wurde dafür 1:1 in Browser-Module portiert.

```
Toolbar-Icon ──▶ extension/index.html (Campus-Seite)
                     │
                     ├─ js/api.js          gleiche Schnittstelle wie /api/*
                     │    └─ js/lib/*      portierte Server-Logik
                     └─ chrome.storage.local  Zugangsdaten + Settings (lokal)
```

### Bauen und installieren

```bash
npm install
npm run build:extension      # erzeugt ./dist/extension
```

- **Chrome**: `chrome://extensions` → *Developer mode* → *Load unpacked* →
  Ordner `dist/extension` wählen. Toolbar-Icon öffnet den Campus in einem Tab.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary
  Add-on* → `dist/extension/manifest.json`.

### Verteilen (`npm run dist`)

`npm run dist` baut die Extension und erzeugt zusätzlich upload-fertige
Archive unter `dist/`:

| Artefakt | Zweck |
|----------|-------|
| `jira-flowyard-<version>-chrome.zip` | Chrome Web Store (Manifest ohne Firefox-Keys) |
| `jira-flowyard-<version>-firefox.zip` | Mozilla Add-ons (mit Gecko-ID; ggf. zu `.xpi` umbenennen) |
| `SHA256SUMS.txt` | SHA-256-Checksumen beider Archive |

Die Archive sind deterministisch (feste Zeitstempel, sortierte Einträge) und
werden ohne externe Tools direkt in Node erzeugt.

### Konfiguration

Zugangsdaten werden ausschließlich in der Optionsseite der Extension
(⚙ im Jira-Panel oder Rechtsklick → Optionen) gepflegt:

- **Jira base URL** – Cloud (`…atlassian.net`) oder self-hosted
- **Auth** – automatisch (Email + API-Token → Basic, nur Token → Bearer),
  explizit Basic/Bearer oder `none` für Reverse-Proxy-Setups
- **Status-Map** – JSON-Overrides wie `JIRA_STATUS_MAP` des Servers
- **Issue-Typ** – Default beim Anlegen von Tickets

Beim Speichern **und** beim Verbindungstest fragt die Extension die
**Host-Berechtigung** für die Jira-Instanz ab (einmalig, per Browser-Dialog —
die Anfrage muss synchron innerhalb des Klick-Gestus erfolgen, Chrome erhält
Gesten nicht über `await`s hinweg). Fehlt der Zugriff später, melden die
Jira-Aufrufe einen klaren Fehler mit Anleitung statt eines kryptischen
CORS-Logs. Zugangsdaten liegen nur in `chrome.storage.local` – kein Sync,
kein Server. `npm test` deckt die
portierten Module (JQL-Escaping, Status-Mapping, Settings-Schema,
Transition-Auswahl, Browser-Jira-Client) mit eigenen Suiten ab.

### Architektur-Hinweise

- `extension-src/` enthält die Extension-Quellen; `scripts/build-extension.mjs`
  assembliert `dist/extension` daraus plus `public/` (Campus-Seite) und
  `node_modules/three` (gepatcht auf relative Imports, da Extension-CSPs
  keine Inline-Import-Maps erlauben).
- `scripts/package-extension.mjs` (`npm run dist`) packt `dist/extension`
  zusätzlich als Store-Archive und schreibt Checksumen.
- `js/api.js` implementiert dieselbe Schnittstelle wie der alte
  `/api`-Fetch-Wrapper; deshalb bleibt `app.js` bis auf Texte identisch.
- Alle Patches im Build-Skript matchen exakt und lassen den Build bei
  Abweichungen bewusst fehlschlagen.

## Docker

```bash
docker build -t jira-flowyard .
docker run --rm -p 3000:3000 --env-file .env \
  -e HOST=0.0.0.0 -e NODE_ENV=production \
  -v "$PWD/data:/app/data" jira-flowyard
```

Oder mit Compose:

```bash
docker compose up --build
```

Das Volume für `/app/data` hält die UI-Einstellungen über Container-Neustarts
hinweg. `.env` wird nie ins Image kopiert.

## Sicherheit

- Zugangsdaten existieren nur in `.env` bzw. der Prozessumgebung; `/api/config`
  gibt nur `configured`, `authMode`, Site und Filterwerte zurück.
- `.env`, `data/settings.json`, `tmp/` und Logs sind gitignored.
- JQL-Werte werden escaped/validiert; Issue-Keys müssen dem Muster
  `PROJECT-123` entsprechen.
- Security-Header: CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- Das Rate-Limit gilt für alle `/api`-Routen; Request-Bodies sind auf 64 kB
  begrenzt.
- Für öffentliches Hosting: hinter Reverse Proxy mit TLS und Authentifizierung
  betreiben, `HOST` bewusst setzen und einen read-only API-Token verwenden,
  wenn keine Schreibzugriffe nötig sind.

## Bekannte Grenzen

- Keine Benutzerverwaltung – die App ist für den lokalen/internen Gebrauch
  gedacht.
- Jira-Cloud-Workflows unterscheiden sich pro Projekt; nicht jede gewünschte
  Lane ist per Transition erreichbar. Das Backend liefert dann einen Fehler
  statt still etwas anderes zu setzen.
- Der Campus ist eine Visualisierung, kein Ersatz für das Jira-Board; es werden
  nur die im UI gesetzten Filter geladen.
- **Extension-Token**: Die Extension speichert Zugangsdaten in
  `chrome.storage.local`. Für höhere Sicherheit wären `chrome.storage.session`
  oder ein OS-Keychain sinnvoll; Token-Scopes sollten im README der Extension
  dokumentiert werden.
- **i18n**: UI-Texte sind englisch, die Dokumentation deutsch. Eine
  `Intl`-basierte Lokalisierung würde beides sauber trennen.
- **Sehr große Boards**: Jedes Paket wird gerendert. Bei deutlich mehr als den
  aktuellen ~200 Tickets wären Clustering oder LOD der nächste Schritt.
