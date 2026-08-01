# Pinboard Bookmark Enhanced

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md) | **Polski** | [Русский](README.ru.md)

Rozszerzenie Chrome dla [Pinboard](https://pinboard.in): tagi i streszczenia od AI, wbudowany czytnik z tłumaczeniem i zakreśleniami oraz 13 motywów dla samej strony.

> **Uwaga:** Wymaga konta Pinboard.in — [Pinboard](https://pinboard.in) to niezależna, **płatna** usługa zakładek. To rozszerzenie jest klientem innej firmy, który łączy się z Twoim istniejącym kontem Pinboard za pomocą Twojego własnego tokena API Pinboard. Nie jest powiązane z Pinboard, sponsorowane ani autoryzowane przez Pinboard. Aby korzystać z tego rozszerzenia, musisz już mieć (lub założyć) płatne konto Pinboard.in.

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## Funkcje

### Zapisywanie
- **Jedno kliknięcie i wszystko wypełnione** — tytuł, opis i zaznaczony tekst trafiają na miejsce, a z adresu URL znikają parametry śledzące
- **Zapis skrótem klawiszowym** — bez otwierania okienka; można też zapisać naraz wszystkie otwarte karty
- **Działa offline** — zapisy trafiają do lokalnej kolejki i są ponawiane po odzyskaniu połączenia

![Zapis jednym kliknięciem, tagi i streszczenie od AI](docs/cws-assets/originals/screenshot-1-save.png)

### Tagi
- **Tagi i streszczenie od AI** — AI czyta treść artykułu bez reklam, menu i pasków bocznych; własny klucz API, 14 dostawców lub dowolny endpoint zgodny z OpenAI
- **Autouzupełnianie** — z twoich tagów, podpowiedzi Pinboarda i gotowych zestawów na jedno kliknięcie
- **Porządki w tagach** — znajdź duplikaty i rzadko używane tagi, po czym scal je partiami

### Czytanie
- **Każda strona staje się czytelna** — widok Markdown ze spisem treści, wyszukiwaniem i podglądem przypisów
- **Zakreślenia w pięciu kolorach, z notatkami** — zakreślenia i notatki przetrwają ponowne renderowanie, tłumaczenie, a nawet zmiany na stronie
- **Przetłumacz stronę albo zadaj jej pytanie** — tłumaczenie całości z widokiem dwujęzycznym; odpowiedzi cytują źródło i prowadzą prosto do niego
- **Sprawdzaj i powtarzaj słownictwo podczas czytania** — słownik pokazuje najpierw znaczenie pasujące do bieżącego zdania, a zapisane słówka możesz wyszukiwać, sortować, grupować, eksportować oraz wysyłać do Anki i Eudic. Opcjonalne pakiety słowników offline obejmują oba kierunki: chińsko-angielski i angielsko-chiński.
- **Wyślij albo pobierz** — do [Obsidiana](https://obsidian.md), GitHub Gist lub dowolnego webhooka; albo jako `.md`, `.html`, `.epub` na czytnik e-booków

![Czytelny widok z tłumaczeniem dwujęzycznym i zakreśleniami](docs/cws-assets/originals/screenshot-2-reader.png)

![Zadaj stronie pytanie — odpowiedzi cytują źródło](docs/cws-assets/originals/screenshot-3-ask.png)

### Personalizacja
- **13 motywów dla pinboard.in** (Dracula · Nord · Catppuccin · Solarized · …) plus własny CSS
- **Automatyczna archiwizacja w [Wayback Machine](https://web.archive.org)** — opcjonalnie przy każdym zapisie; strony pozostają dostępne, nawet gdy oryginalny link przestanie działać
- **Kopie zapasowe i synchronizacja** — ustawienia synchronizuje Chrome Sync, słówka trafiają na twój własny Google Drive, a do ręcznej kopii JSON możesz dołączyć zakreślenia, notatki, słówka i twoje klucze API. Każda z tych funkcji jest opcjonalna; szczegóły znajdziesz w sekcji Prywatność poniżej.
- **9 języków** · konfigurowalne skróty · pamięć lokalna w pierwszej kolejności · zero śledzenia

![13 motywów dla pinboard.in](docs/cws-assets/originals/screenshot-4-themes.png)

## Instalacja

**[→ Zainstaluj z Chrome Web Store](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)** — zalecane

Lub załaduj rozpakowane z ZIP-a release:
1. Pobierz najnowszy [ZIP z release](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
2. Rozpakuj
3. `chrome://extensions/` → włącz **Tryb dewelopera** → **Załaduj rozpakowane** → wybierz rozpakowany folder

Katalog źródłowy ma osobny, stały identyfikator deweloperski, dlatego podczas testów może działać obok wersji z Chrome Web Store. ZIP z release używa identyfikatora Chrome Web Store i nie może działać jednocześnie z wersją sklepową w tym samym profilu Chrome. Chrome Sync może synchronizować ustawienia po włączeniu ich synchronizacji na każdym urządzeniu. Przed zastąpieniem starszego release wczytanego ręcznie wyeksportuj jego ustawienia, a po wczytaniu nowego release zaimportuj kopię zapasową.

Po instalacji: kliknij ikonę paska narzędzi → wklej swój [token API Pinboard](https://pinboard.in/settings/password) → zapisz

## Prywatność

Bez śledzenia, bez analityki, bez telemetrii. W przypadku nowych użytkowników ustawienia i dane uwierzytelniające pozostają domyślnie na tym urządzeniu. Synchronizację zwykłych ustawień włącza się osobno na każdym urządzeniu. Synchronizacja danych uwierzytelniających jest jednym wyborem dla całego konta Chrome, ale uczestniczą w niej tylko urządzenia z włączoną synchronizacją ustawień; pozostałe nadal używają lokalnych danych uwierzytelniających. Dla nowych użytkowników jest domyślnie wyłączona. Jeśli podczas aktualizacji w Chrome Sync są już niepuste dane uwierzytelniające, pozostaje włączona, aby uniknąć utraty danych. Po włączeniu klucze API, tokeny, hasła i dane uwierzytelniające eksportu są udostępniane przez Chrome Sync; są jedynie zaciemnione, a nie zaszyfrowane. Zapisane zakładki, zawartość stron i kolejka offline nigdy nie trafiają do Chrome Sync. Zapytania AI są wysyłane **tylko** przez funkcje, które włączysz lub wywołasz — Tagi AI/Streszczenie AI, pytania o stronę, tłumaczenie, wyjaśnienie zaznaczenia lub opcjonalne podsumowanie kluczowych punktów — i trafiają bezpośrednio do skonfigurowanego dostawcy. Podczas instalacji przyznawany jest tylko dostęp do Pinboard; AI, Jina, witryny wybrane do przetwarzania wsadowego oraz opcjonalne miejsca docelowe eksportu i archiwizacji proszą tylko o uprawnienie do konkretnej witryny podczas wykonywania odpowiedniej operacji. Niestandardowe punkty końcowe sieci muszą używać HTTPS; HTTP jest dozwolone tylko dla `localhost`, `127.0.0.1` i `[::1]`. Strony rozszerzenia egzekwują restrykcyjną politykę Content-Security-Policy (bez zdalnego kodu). Pełna polityka: <https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## Licencja

MIT — patrz [LICENSE](LICENSE).
