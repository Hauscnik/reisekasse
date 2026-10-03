# Reisekasse

Installierbare Web-App (PWA) zum Erfassen von Reiseausgaben, zur Budgetkontrolle und zur Abrechnung zwischen mehreren Personen. Die Daten bleiben auf dem Gerät; Sicherung und Abgleich laufen über Dateien (JSON), Bearbeiten in Excel über CSV.

- App: `index.html`, `style.css`, `app.js`
- Dateiformat und Zusammenführen: `sync.js`, Tabelle (CSV): `csv.js`
- Rechenlogik ohne Oberfläche: `calc.js` (`RKCALC`) – Kontoinhaber, Budget-Sichten, Abrechnung. Wird vor `csv.js` und `app.js` geladen.
- Offline-Funktion: `sw.js` – **bei jeder Änderung `VERSION` erhöhen**, sonst bekommen installierte Apps das Update nicht.
- Tests: `tests.html` im Browser öffnen
- App-Symbole neu erzeugen: `python tools/make_icons.py`

Wechselkurse: [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api). Schrift: Figtree (SIL Open Font License, siehe `fonts/OFL.txt`).

## Gemeinsame Kasse und Budget-Sichten

- `joint.members`: Personen-IDs der Kontoinhaber der gemeinsamen Kasse. Gelöschte Personen zählen nicht. Neue Personen sind nicht automatisch Inhaber.
- `budgetFor`: `'joint'` (Standard) oder `'group'` – für welche Sicht das Gesamtbudget gilt.
- Sicht **Kontoinhaber**: Jede Ausgabe, an der alle Inhaber beteiligt sind, zählt mit dem Anteil der Inhaber. Sicht **Ganze Gruppe**: Ausgaben für alle zählen voll.
- Abrechnung: Zahlt die Kasse und sind alle Inhaber beteiligt, sind deren Anteile neutral. Alle anderen Anteile gehen an die Kasse zurück.
- Ältere Dateien (ohne die Felder) ergänzt `normalizeTrip`: alle Personen werden Inhaber, `budgetFor` wird `'joint'`. Das Dateiformat bleibt 1. Bei zwei Personen, die beide Inhaber sind, rechnet die App wie bisher.
