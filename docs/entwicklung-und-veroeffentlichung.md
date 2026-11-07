# Entwicklung und Veröffentlichung

## GitHub einmalig einrichten

Die folgenden Einstellungen beziehen sich auf [schniko/Codepfad](https://github.com/schniko/Codepfad). GitHub Actions baut die Website, veröffentlicht den Lernpfad-Katalog und erstellt Desktop-Releases.

### 1. GitHub Actions erlauben

Unter **Settings → Actions → General → Actions permissions** die verwendeten Actions zulassen. Bei einer eingeschränkten Auswahl werden `actions/*`, `dtolnay/rust-toolchain`, `swatinem/rust-cache` und `tauri-apps/tauri-action` benötigt. Falls Actions vollständig deaktiviert ist, zuerst aktivieren.

Die Workflows deklarieren ihre benötigten Token-Rechte selbst: Pages benötigt `pages: write` und `id-token: write`, Lernpfad-Feed und Desktop-Releases benötigen `contents: write`. Ein eigener Personal Access Token und ein selbst angelegtes `GITHUB_TOKEN`-Secret sind nicht nötig. Der Standard unter **Workflow permissions** kann auf Lesezugriff bleiben, sofern keine Organisationsrichtlinie die angeforderten Rechte blockiert. Eine Branch-Regel darf den Workflow nicht am Schreiben des Branches `content-v1` hindern.

### 2. Website über GitHub Pages aktivieren

1. Unter **Settings → Pages → Build and deployment → Source** den Eintrag **GitHub Actions** auswählen. Keinen Veröffentlichungsbranch auswählen.
2. Die lokalen Änderungen auf `main` committen und pushen. Der Workflow **Website veröffentlichen** baut und testet den Browserbetrieb und veröffentlicht ausschließlich `Desktop/dist/`.
3. Unter **Actions → Website veröffentlichen** den erfolgreichen Lauf öffnen. Alternativ mit **Run workflow → main → Run workflow** manuell starten.
4. Die veröffentlichte Adresse steht beim Deployment und unter **Settings → Pages**. Für Codepfad ist die Domain <https://codepfad.eu/> eingetragen.

Das Environment `github-pages` wird beim ersten Deployment automatisch angelegt. Falls dort unter **Settings → Environments → github-pages** Einschränkungen für Deployment-Branches eingerichtet sind, muss `main` zugelassen sein. Für automatische Veröffentlichungen ist keine manuelle Freigabe des Environments erforderlich.

Änderungen an Oberfläche, Lernpfaden oder Website-Build auf `main` veröffentlichen die Website erneut. Desktop-Installer werden dadurch noch nicht gebaut. Der Browser-Test prüft sowohl `/Codepfad/` als auch `/`, damit die Website auch mit eigener Domain funktioniert. Zugangscodes und Musterlösungen sind in den ausgelieferten Kursdaten lesbar; die Codes sind eine Unterrichtshilfe und kein vertraulicher Zugriffsschutz.

### 3. Eigene Domain verbinden

Die Domain muss nicht im Quellcode hinterlegt werden. Auch eine `CNAME`-Datei ist bei diesem Actions-Deployment nicht erforderlich. Erst die Domain auf GitHub eintragen, danach die DNS-Einträge beim Domainanbieter setzen.

1. Empfohlen: Unter den **persönlichen GitHub-Settings → Pages → Add a domain** die gekaufte Domain verifizieren. GitHub zeigt dafür einen individuellen TXT-Eintrag an. Diesen beim Domainanbieter anlegen und anschließend **Verify** wählen. Den TXT-Eintrag dauerhaft behalten.
2. Im **Repository → Settings → Pages → Custom domain** die gewünschte Adresse ohne `https://` und ohne Pfad eintragen und speichern, beispielsweise `deinedomain.de` oder `lernen.deinedomain.de`.
3. Beim Domainanbieter die zum gewünschten Namen passenden DNS-Einträge setzen:

| Gewünschte Adresse | DNS-Typ | Name/Host | Ziel/Wert |
| --- | --- | --- | --- |
| `deinedomain.de` | A | `@` | `185.199.108.153` |
| `deinedomain.de` | A | `@` | `185.199.109.153` |
| `deinedomain.de` | A | `@` | `185.199.110.153` |
| `deinedomain.de` | A | `@` | `185.199.111.153` |
| `www.deinedomain.de` | CNAME | `www` | `schniko.github.io` |
| alternativ `lernen.deinedomain.de` | CNAME | `lernen` | `schniko.github.io` |

Für die Hauptdomain die vier A-Einträge und ergänzend `www` anlegen; GitHub leitet zwischen Hauptdomain und `www` automatisch auf die gewählte Custom domain weiter. Wenn ausschließlich `lernen.deinedomain.de` verwendet werden soll, genügt dessen CNAME-Eintrag. Das CNAME-Ziel enthält weder `https://` noch `/Codepfad/`. Manche Anbieter erwarten beim Namen statt `@` die vollständige Domain oder ein leeres Feld.

Vorhandene A-/AAAA-/CNAME-Einträge, die denselben Webseitennamen auf einen anderen Webhost zeigen lassen, entsprechend ersetzen; MX- und TXT-Einträge für E-Mail behalten. Keine Wildcard (`*`) verwenden. Wenn IPv6 gewünscht ist, nennt die unten verlinkte GitHub-Anleitung zusätzlich die vier passenden AAAA-Einträge.

Nach erfolgreicher DNS-Prüfung unter **Repository → Settings → Pages** die Option **Enforce HTTPS** aktivieren. GitHub stellt das Zertifikat automatisch bereit; DNS-Übernahme und Zertifikatsbereitstellung können bis zu 24 Stunden benötigen. Der Lernpfad ist dann direkt an der Wurzel der eigenen Domain erreichbar, ohne `/Codepfad/`.

### 4. Update-Schlüssel für Desktop-Releases hinterlegen

Unter **Settings → Secrets and variables → Actions → New repository secret** anlegen:

| Secret | Inhalt |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Vollständiger Inhalt der lokalen Datei `.codepfad-keys/updater.key`, einschließlich aller Zeilen. Keinen lokalen Dateipfad eintragen. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Nur bei einem passwortgeschützten Schlüssel: dessen Passwort. Sonst weglassen. |

Den bestehenden Schlüssel außerhalb des Repositorys sichern und weiterverwenden: Sein öffentlicher Gegenpart steht bereits in `Desktop/src-tauri/tauri.conf.json`. Ein neu erzeugter, anderer Schlüssel kann vorhandene Installationen nicht aktualisieren. Den privaten Schlüssel nicht committen, in eine Repository-Variable schreiben oder in Workflow-Protokollen ausgeben. Das ignorierte Verzeichnis `.codepfad-keys/` wird nicht veröffentlicht.

Das ist die Signatur für Tauri-Updates. Die vorbereiteten Mac-Installer sind ad hoc signiert, Windows-Installer haben noch keine Herausgebersignatur. Apple Developer ID/Notarisierung und Windows-Code-Signing sind davon getrennt und noch nicht eingerichtet; Betriebssysteme können beim ersten Öffnen entsprechend warnen.

### 5. Ersten Desktop-Release bauen

1. Alle vorgesehenen Änderungen nach `main` pushen, einschließlich der Workflow-Dateien, `Desktop/package-lock.json` und `Desktop/src-tauri/Cargo.lock`.
2. Die Version lokal prüfen. Für den vorbereiteten Stand ist sie `0.1.1`:

   ```sh
   cd Desktop
   npm run check:release -- app-v0.1.1
   cd ..
   ```

3. Auf dem gewünschten, bereits gepushten Commit einen passenden Tag erstellen und pushen:

   ```sh
   git tag app-v0.1.1
   git push origin app-v0.1.1
   ```

4. Unter **Actions → Desktop-Release** den Lauf verfolgen. Erst werden Version, Lockdateien und das Vorhandensein des Schlüssels geprüft; danach bauen GitHubs Rechner nacheinander Mac Apple Silicon, Mac Intel und Windows x64. Sie laden Installer, Update-Pakete und die gemeinsame `latest.json` in einen **Release-Entwurf**. Der private Schlüssel wird zum Signieren benötigt, auch beim ersten Release.
5. Unter **Releases** den Entwurf öffnen und erst nach erfolgreichem Abschluss aller drei Builds veröffentlichen. Vorher die zwei DMGs, den Windows-Installer, die Mac-Update-Archive und `latest.json` auf Vollständigkeit prüfen. Nicht veröffentlichen, während noch ein Build läuft: Der Entwurf wird bis zuletzt ergänzt.

Für einen erneuten Versuch mit demselben Tag kann **Actions → Desktop-Release → Run workflow** genutzt werden: Workflow-Branch `main` auswählen und im Feld **tag** den bereits vorhandenen Tag `app-v0.1.1` angeben. Gebaut wird ausdrücklich der Tag, nicht der aktuelle Stand von `main`. Wiederholungen funktionieren, solange der Release noch ein Entwurf ist. Bereits veröffentlichte Versionen nicht mit anderen Builds überschreiben; dafür eine neue Version und einen neuen Tag verwenden.

Nach der Veröffentlichung stehen die Downloads unter <https://github.com/schniko/Codepfad/releases/latest> bereit. Die installierte App nutzt die `latest.json` dieses Releases für Updates. Für diese Verteilung wird ein öffentliches Repository vorausgesetzt; der vorbereitete App-Updater und Lernpfad-Feed enthalten keine Anmeldung für private Repositories.

### Weitere Versionen

Für eine neue Version, etwa `0.1.2`, im Ordner `Desktop/` zuerst `npm version 0.1.2 --no-git-tag-version` ausführen; das aktualisiert `package.json` und `package-lock.json`. Dann dieselbe Version in `src-tauri/tauri.conf.json`, im Abschnitt `[package]` von `src-tauri/Cargo.toml` und nur beim Paket `name = "codepfad"` in `src-tauri/Cargo.lock` setzen. Mit `npm run check:release -- app-v0.1.2` prüfen, die Dateien committen/pushen und anschließend den Tag `app-v0.1.2` erstellen und pushen.

Für reine Kursänderungen genügt ein Push auf `main`: Website und Lernpfad-Feed aktualisieren sich automatisch. Dafür ist weder ein neuer App-Tag noch ein neuer Desktop-Installer nötig. Den Workflow **Lernpfade veröffentlichen** beim ersten Einrichten bei Bedarf manuell auf `main` starten, damit der Branch `content-v1` bereitsteht.

Offizielle Anleitungen: [Pages mit GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [eigene Domain und DNS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Domain-Verifizierung](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages), [Tauri-Builds auf GitHub](https://v2.tauri.app/distribute/pipelines/github/), [Tauri-Update-Signaturen](https://v2.tauri.app/plugin/updater/).

## Lernpfade pflegen

Unter `Lernpfade/<id>/` liegt pro Kurs eine `lernpfad.json` mit Katalogdaten und Schritten. Bilder gehören in den Unterordner `assets/`. Für einen neuen Kurs einen bestehenden Ordner kopieren, die `id` an den Ordnernamen anpassen und Titel, Thema, Reihenfolge, Zugangscode, Bilder und Schritte bearbeiten. Der Build entdeckt neue Ordner automatisch. Ein leerer Zugangscode öffnet den Kurs direkt. Codes und Musterlösungen sind im öffentlichen Repository lesbar.

Der Desktop-Quellcode liegt unter `Desktop/`. `editor/` enthält die Oberfläche, `src-tauri/` die native Anwendung. Der Paketgenerator legt den sortierten Katalog mit sämtlichen Bildern und einer SHA-256-Prüfsumme unter `Desktop/dist/content/` ab.

## Lokal entwickeln und bauen

Voraussetzungen sind Node.js ab 22, Rust mit Cargo und die nativen [Tauri-Buildwerkzeuge](https://v2.tauri.app/start/prerequisites/) für das Betriebssystem. Auf Windows werden die MSVC-C++-Buildtools und die WebView2-Laufzeit benötigt.

```sh
cd Desktop
npm ci
npm run dev
```

`npm run build -- --bundles app,dmg` erstellt auf dem Mac die App und das Disk-Image. `npm run build -- --bundles nsis` erzeugt auf Windows den Installer. Die Ergebnisse liegen unter `src-tauri/target/release/bundle/`. Zum Bearbeiten eines Kurses bei laufender Entwicklung `npm run prepare:content` ausführen und die Ansicht neu laden.

Für die Browser-Integrationstests einmal `npx playwright install chromium` und anschließend `npm test` ausführen. Alternativ kann `CHROME_PATH` auf eine vorhandene Chrome-Programmdatei zeigen.

## Updates aus schniko/Codepfad

**Lernpfade.** Beim ersten Start ist der mitgelieferte Katalog verfügbar. Die App schaut beim Start im Hintergrund auf dem öffentlichen Branch `content-v1` nach einer neuen Prüfsumme. Sie lädt das zugehörige Datenpaket, prüft Prüfsumme, Aufgaben und Bilder und speichert es in einer einzigen IndexedDB-Transaktion. Ab der nächsten Kursauswahl gilt der neue Stand. Bei einem fehlgeschlagenen Abruf ist der letzte nutzbare Stand weiterhin verfügbar.

Der GitHub-Actions-Workflow „Lernpfade veröffentlichen“ erzeugt den Branch und das Manifest bei Änderungen auf `main`. Er lässt sich für die erste Veröffentlichung auch manuell starten. GitHub Actions benötigt Schreibzugriff auf den Branch. Lernende brauchen bei einem öffentlichen Repository weder Git noch ein GitHub-Konto.

**Programmversionen.** Der native Updater prüft das neueste veröffentlichte GitHub Release. Er lädt ein verfügbares Paket im Hintergrund und prüft seine Signatur. In der Bibliothek erscheint anschließend die Schaltfläche zur Installation und zum Neustart.

1. Den privaten Update-Schlüssel separat sichern und als Repository-Secret `TAURI_SIGNING_PRIVATE_KEY` hinterlegen. Bei einem passwortgeschützten Schlüssel zusätzlich `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` setzen. Der zugehörige öffentliche Schlüssel steht in `Desktop/src-tauri/tauri.conf.json`.
2. Die Version in `tauri.conf.json`, `Cargo.toml` und `package.json` anheben und die Lockdateien aktualisieren. Mit `npm run check:release` prüfen und den passenden Tag, etwa `app-v0.1.2`, auf GitHub pushen.
3. Der Workflow „Desktop-Release“ baut nacheinander für Apple Silicon, Intel-Macs und Windows x64. Nach erfolgreichem Build den Release-Entwurf mit den Installern und der gemeinsamen `latest.json` veröffentlichen.

Die Tauri-Update-Signatur schützt Programmupdates. Für die öffentliche Verteilung mit verifizierter Herausgeberidentität kommen Apple Developer ID samt Notarisierung sowie Windows-Code-Signing hinzu. Der vorbereitete lokale Mac-Build verwendet eine Ad-hoc-Signatur.

### Build auf dem Einrichtungsmac

Die beim ersten Build installierte Rust-Toolchain liegt lokal im ignorierten Verzeichnis `.codepfad-build/`. Für weitere Builds in einem neuen Terminal im Repository-Stamm:

```sh
export CARGO_HOME="$PWD/.codepfad-build/cargo"
export RUSTUP_HOME="$PWD/.codepfad-build/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
cd Desktop
npm run build -- --bundles app,dmg
```

Der lokale private Update-Schlüssel liegt separat unter `.codepfad-keys/updater.key`. Er ist nur für das Benutzerkonto lesbar und wird von Git ignoriert. Diesen Schlüssel vor dem ersten öffentlichen Release sicher außerhalb des Arbeitsordners sichern.
