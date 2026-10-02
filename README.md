# Lampa Online — бесплатные легальные фильмы в Lampa

Плагин для [Lampa](https://github.com/yumata/lampa) (проверен на Lampa 3.3.4).
Добавляет кнопку **«Смотреть онлайн»** в карточку фильма и раздел **«Бесплатные фильмы»** в главное меню.
Источник по умолчанию — **Internet Archive**: только материалы с лицензией Public Domain / Creative Commons
и вручную проверенный каталог фильмов, перешедших в общественное достояние. Ключи API не нужны, backend не нужен.

## Установка

URL плагина:

```
https://kiborg611-byte.github.io/lampa-online/plugin.js
```

Lampa → **Настройки → Расширения → Добавить плагин** → вставить URL → перезапустить Lampa.

## Как пользоваться

* **Карточка фильма → «Смотреть»** → «Смотреть онлайн» → список найденных вариантов (название · год · качество · источник · язык) → OK → воспроизведение в Lampa Player.
* **Меню → «Бесплатные фильмы»** → выбрать фильм → воспроизведение начинается сразу.

Если файл не воспроизводится, плагин автоматически пробует следующий подходящий файл (h.264 MP4 → MPEG4 → 512kb MP4 → Ogg).
Ogg/WebM не предлагаются на Tizen/webOS/Apple, где они не поддерживаются.

Сообщения: «Фильм не найден в доступных источниках», «Источник временно недоступен».
Логи: `[LAMPA-ONLINE] search | movie found | stream found | play | error` (DevTools или Настройки → Консоль).

## Каталог «Бесплатные фильмы»

| Фильм | Год | Internet Archive ID |
|---|---|---|
| Его девушка Пятница / His Girl Friday | 1940 | `his_girl_friday` |
| Объезд / Detour | 1945 | `Detour` |
| Карнавал душ / Carnival of Souls | 1962 | `CarnivalofSouls` |
| Улица греха / Scarlet Street | 1945 | `ScarletStreet` |
| Чужестранец / The Stranger | 1946 | `TheStranger_0` |
| Знакомьтесь, Джон Доу / Meet John Doe | 1941 | `meet_john_doe` |
| Дом ночных призраков / House on Haunted Hill | 1959 | `house_on_haunted_hill_ipod` |
| Путешествия Гулливера / Gulliver's Travels | 1939 | `gullivers_travels1939` |
| Секретный агент / Secret Agent (Хичкок) | 1936 | `Hitchcock_Secret_Agent` |
| Одетая для убийства / Dressed to Kill | 1946 | `dressed_to_kill` |
| Сита поёт блюз / Sita Sings the Blues (CC) | 2008 | `Sita_Sings_the_Blues` |
| Кабинет доктора Калигари | 1920 | `DasKabinettdesDoktorCaligariTheCabinetofDrCaligari` |
| Носферату. Симфония ужаса | 1922 | `Nosferatu_most_complete_version_93_mins.` |
| Броненосец «Потёмкин» | 1925 | `BattleshipPotemkin` |
| Призрак оперы | 1925 | `ThePhantomoftheOpera` |

Список файлов каждого фильма загружается из `archive.org/metadata/<id>` в момент воспроизведения.

## Архитектура

```
plugin.js            ← собранный файл для Lampa (node build.js)
src/core.js          ← реестр providers, fallback, UI (Lampa.Component/Activity/Controller), Lampa.Player
src/polyfill.js      ← Promise для старых ТВ
providers/archive.js ← Internet Archive
providers/custom.js  ← свой JSON-каталог (Настройки → Смотреть онлайн → URL)
test/                ← unit + e2e (реальная Lampa 3.3.4 в Chromium)
```

Каждый provider реализует единый интерфейс:

```js
search(movie)              // movie = {title, original_title, year, tmdb_id, imdb_id, type: 'movie'|'tv'}
getMovie(item)
getSeasons(item)
getEpisodes(item, season)
getStreams(item)           // → [{source, title, quality, translation, url, type}]
catalog()                  // необязательно: элементы для раздела «Бесплатные фильмы»
```

Поиск идёт по цепочке: Provider 1 → (не найдено / ошибка / таймаут) → Provider 2 → … Падение одного provider не ломает плагин.

Новый provider — файл в `providers/`, добавить его в `build.js`, либо подключить отдельным скриптом:

```js
window.LampaOnlineProviders.push(function (ctx) {
    return { id: 'my', name: 'My source', types: ['movie'],
             search: function (movie) { return Promise.resolve([]) },
             getMovie: …, getSeasons: …, getEpisodes: …, getStreams: … }
})
```

### Свой каталог (custom provider)

Настройки → «Смотреть онлайн» → «Свой каталог (URL JSON)». Формат:

```json
{ "items": [ { "title": "Мой фильм", "original_title": "My Movie", "year": 2001, "tmdb_id": 123,
  "streams": [ { "url": "https://my-server/movie.mp4", "quality": "1080p", "translation": "Original" } ] } ] }
```

Сервер должен отдавать JSON с заголовком `Access-Control-Allow-Origin: *`.

## Тесты

```
node test/unit.js
node test/e2e.js <папка со сборкой lampa> plugin.js   # нужен playwright
```

e2e проверяет: загрузку через список плагинов Lampa, отсутствие двойной инициализации, кнопку в карточке,
«Смотреть» → поиск → выбор пультом → `Lampa.Player` реально воспроизводит видео, «не найдено», каталог,
навигацию пультом, автоматический переход на следующий файл при ошибке, debug-логи.

Сайты без открытого разрешённого API (Rezka, Seasonvar, LostFilm, Kinoubava, Baskino, Kinovibe) не используются.
