# Reisekasse

Installierbare Web-App (PWA) zum Erfassen von Reiseausgaben, zur Budgetkontrolle und zur Abrechnung zwischen mehreren Personen. Die Daten bleiben auf dem Gerät; Sicherung und Abgleich laufen über Dateien (JSON), Bearbeiten in Excel über CSV.

- App: `index.html`, `style.css`, `app.js`
- Dateiformat und Zusammenführen: `sync.js`, Tabelle (CSV): `csv.js`
- Offline-Funktion: `sw.js` – **bei jeder Änderung `VERSION` erhöhen**, sonst bekommen installierte Apps das Update nicht.
- Tests: `tests.html` im Browser öffnen
- App-Symbole neu erzeugen: `python tools/make_icons.py`

Wechselkurse: [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api). Schrift: Figtree (SIL Open Font License, siehe `fonts/OFL.txt`).
