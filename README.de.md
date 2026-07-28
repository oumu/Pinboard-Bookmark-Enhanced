# Pinboard Bookmark Enhanced

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | **Deutsch** | [Français](README.fr.md) | [日本語](README.ja.md) | [Polski](README.pl.md) | [Русский](README.ru.md)

Eine Chrome-Erweiterung für [Pinboard](https://pinboard.in): AI-Tags und Zusammenfassungen, eine eingebaute Leseansicht mit Übersetzung und Markierungen sowie 13 Themes für die Website selbst.

> **Hinweis:** Erfordert ein Pinboard.in-Konto — [Pinboard](https://pinboard.in) ist ein unabhängiger, **kostenpflichtiger** Lesezeichendienst. Diese Erweiterung ist ein Drittanbieter-Client, der sich mit deinem eigenen API-Token mit deinem bestehenden Pinboard-Konto verbindet. Sie ist nicht mit Pinboard verbunden, wird nicht von Pinboard gesponsert oder unterstützt. Zur Nutzung dieser Erweiterung musst du bereits ein kostenpflichtiges Pinboard.in-Konto besitzen (oder eines anlegen).

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## Funktionen

### Speichern
- **Ein Klick, alles ausgefüllt** – Titel, Beschreibung und markierter Text werden übernommen, Tracking-Parameter aus der URL entfernt
- **Per Tastenkürzel speichern** – ohne das Popup zu öffnen; auf Wunsch alle offenen Tabs auf einmal
- **Funktioniert auch offline** – Speicherungen landen in einer lokalen Warteschlange und werden nach der Wiederverbindung erneut übertragen

![Speichern mit einem Klick, AI-Tags und Zusammenfassung](docs/cws-assets/originals/screenshot-1-save.png)

### Tags
- **AI-Tags und Zusammenfassung** – gelesen wird der Artikeltext ohne Werbung, Menüs und Seitenleisten; eigener API-Schlüssel, 14 Anbieter oder ein beliebiger OpenAI-kompatibler Endpunkt
- **Autovervollständigung** – aus deinen Tags, Pinboards Vorschlägen und Ein-Klick-Voreinstellungen
- **Tags aufräumen** – doppelte und selten genutzte Tags finden und in Stapeln zusammenführen

### Lesen
- **Jede Seite wird zur Leseansicht** – Markdown-Ansicht mit Inhaltsverzeichnis, Suche und Fußnoten-Vorschau
- **Markieren in fünf Farben, mit Notizen** – Markierungen und Notizen überstehen Neu-Rendern, Übersetzung und Änderungen an der Seite
- **Seite übersetzen oder befragen** – Ganzseiten-Übersetzung mit zweisprachiger Ansicht; Antworten zitieren die Quelle und springen direkt dorthin
- **Wörter beim Lesen nachschlagen und wiederholen**: Online-Definitionen oder das optionale Offline-Wörterbuch Chinesisch–Englisch nutzen; Vokabeln speichern, suchen, sortieren und gruppieren; alle Einträge des aktuellen Pinboard-Kontos exportieren oder an Anki senden, unterstützte Wörter an Eudic senden
- **Senden oder herunterladen** – an [Obsidian](https://obsidian.md), ein GitHub Gist oder einen beliebigen Webhook senden; als `.md`, `.html` oder `.epub` für den E-Reader herunterladen

![Leseansicht mit zweisprachiger Übersetzung und Markierungen](docs/cws-assets/originals/screenshot-2-reader.png)

![Die Seite befragen, Antworten zitieren die Quelle](docs/cws-assets/originals/screenshot-3-ask.png)

### Pinboard nach deinem Geschmack
- **13 Themes für pinboard.in** (Dracula · Nord · Catppuccin · Solarized · …) plus dein eigenes CSS
- **Automatisch in die [Wayback Machine](https://web.archive.org) archivieren** – auf Wunsch bei jedem Speichern; Seiten bleiben erreichbar, auch wenn der Originallink tot ist
- **Sicherung und Synchronisierung**: Chrome Sync teilt Einstellungen nur zwischen Geräten, auf denen du die Synchronisierung aktivierst. Die Synchronisierung von Zugangsdaten musst du separat einschalten. Manuelle JSON-Sicherungen enthalten Einstellungen und auf Wunsch Markierungen, Notizen, den Wortschatz des aktuellen Pinboard-Kontos sowie deine API-Schlüssel. Wenn du auf jedem Gerät in Chrome angemeldet bist und Google Drive separat verbindest, wird dieser Wortschatz synchronisiert.
- **9 Sprachen** · anpassbare Tastenkürzel · Speicherung primär lokal · kein Tracking

![13 Themes für pinboard.in](docs/cws-assets/originals/screenshot-4-themes.png)

## Installation

**[→ Im Chrome Web Store installieren](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)** (empfohlen)

Oder als entpackte Erweiterung aus einem Release-ZIP laden:
1. Lade das neueste [Release-ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest) herunter
2. Entpacken
3. `chrome://extensions/` → **Entwicklermodus** aktivieren → **Entpackte Erweiterung laden** → entpackten Ordner auswählen

Der Quellcode verwendet eine eigene feste Entwicklungs-ID und kann deshalb zu Testzwecken neben der Version aus dem Chrome Web Store installiert werden. Das Release-ZIP verwendet dagegen die ID des Chrome Web Store und kann nicht gleichzeitig mit der Store-Version im selben Chrome-Profil installiert sein. Chrome Sync kann die Einstellungen teilen, nachdem die Einstellungssynchronisierung auf jedem Gerät aktiviert wurde. Vor dem Wechsel von einem älteren entpackten Release zuerst dessen Einstellungen exportieren und die Sicherung nach dem Laden des neuen Releases importieren.

Nach der Installation: Auf das Symbol in der Symbolleiste klicken → deinen [Pinboard-API-Token](https://pinboard.in/settings/password) einfügen → speichern

## Datenschutz

Kein Tracking, keine Analytik, keine Telemetrie. Für neue Nutzer werden Einstellungen und Zugangsdaten standardmäßig auf diesem Gerät gespeichert. Die Synchronisierung gewöhnlicher Einstellungen wird auf jedem Gerät separat aktiviert. Die Synchronisierung von Zugangsdaten ist eine kontoweite Chrome-Option, an der aber nur Geräte mit aktivierter Einstellungssynchronisierung teilnehmen; andere Geräte verwenden weiterhin ihre lokalen Zugangsdaten. Bei neuen Nutzern ist die Synchronisierung von Zugangsdaten standardmäßig deaktiviert. Sind bei einem Upgrade bereits nicht leere Zugangsdaten in Chrome Sync vorhanden, bleibt sie zur Vermeidung von Datenverlust aktiviert. Wenn sie aktiviert ist, werden API-Schlüssel, Tokens, Passwörter und Export-Zugangsdaten über Chrome Sync geteilt; sie sind nur verschleiert, nicht verschlüsselt. Gespeicherte Lesezeichen, Seiteninhalte und die Offline-Warteschlange gelangen nicht in Chrome Sync. KI-Anfragen werden **nur** über Funktionen gesendet, die du aktivierst oder nutzt — KI-Tags/-Zusammenfassung, Fragen zur Seite, Übersetzung, Erklärung einer markierten Passage oder der optionale Schnellüberblick über die wichtigsten Punkte — und gehen direkt an den von dir konfigurierten Anbieter. Bei der Installation wird nur der Zugriff auf Pinboard gewährt; KI, Jina, in Batch ausgewählte Websites sowie optionale Export- und Archivierungsziele fordern erst bei der jeweiligen Aktion nur die Berechtigung für die konkrete Website an. Benutzerdefinierte Netzwerkendpunkte müssen HTTPS verwenden; HTTP ist nur für `localhost`, `127.0.0.1` und `[::1]` zulässig. Die Seiten der Erweiterung setzen eine strikte Content-Security-Policy durch (kein Remote-Code). Vollständige Richtlinie: <https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
