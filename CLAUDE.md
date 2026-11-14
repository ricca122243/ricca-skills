# Ricca Designs — правила для Claude

Сайт статический: `index.html`, `css/`, `js/`, `img/`, `fonts/`, `art/`. Сборка для хостинга — `tools/build-dist.sh`.

## Как выбирать скиллы

Скиллы лежат в `.claude/skills/` и разбиты ниже на 12 разделов по задачам.

1. Определи, к какому разделу относится запрос. Не жди, пока пользователь назовёт скилл.
2. Включи через инструмент Skill скиллы из колонки «Включать сразу» для подходящей строки. Делай это до первой правки.
3. Скиллы из колонки «Только если» включай только при названном там условии.
4. Не бери скиллы из других разделов. Один запрос — один раздел. Второй раздел подключай, только если задача явно составная, например «сделай секцию и проверь её SEO».
5. За один запрос включай не больше четырёх скиллов. Если подходит больше, бери первые в строке.
6. В ответе одной строкой назови, какие скиллы включил.
7. Если ни одна строка не подходит, работай без скиллов. `find-skills` включай, только когда пользователь сам просит найти скилл.

Проект — сайт дизайн-студии. По умолчанию запрос относится к разделу 1. Разделы 9–12 включай только по прямой просьбе.

## 1. Сайт: дизайн и вёрстка

| Запрос | Включать сразу | Только если |
|---|---|---|
| Украсить, сделать красивее, премиальнее, редизайн страницы или секции | `frontend-design`, `ui-ux-pro-max` | `ui-styling` — нужны готовые компоненты или тёмная тема |
| Новая секция, лендинг, прайс, карточки товаров | `frontend-design`, `ui-ux-pro-max` | `design` — нужны ещё логотип, иконки или баннер |
| Цвета, шрифты, отступы, CSS-переменные, единый стиль | `design-system` | `theme-factory` — просят готовую тему; `tailwind-design-system` — проект на Tailwind; `visual-style` — стиль снимают с чужого сайта или брендбука |
| Анимация на странице | `frontend-design` | `framer-motion` — проект на React; `lottie-bodymovin` — анимация из After Effects; `threejs-*` — просят 3D |
| Тексты кнопок, заголовков, форм, ошибок | `ux-copy` | `humanizer` — текст звучит как нейросеть |
| Схема проекта, как устроен код | `floorplan` | — |
| Сайт на React или Next.js | `vercel-react-best-practices` | `vercel-composition-patterns` — рефакторинг компонентов |

Скиллы `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-lighting`, `threejs-textures`, `threejs-loaders`, `threejs-animation`, `threejs-interaction`, `threejs-shaders`, `threejs-postprocessing` включай по одному, под конкретную 3D-задачу.

## 2. Сайт: проверка качества

| Запрос | Включать сразу | Только если |
|---|---|---|
| Оцени дизайн, что не так, разбор скриншота | `design-critique` | `web-design-guidelines` — разбирают код интерфейса, а не картинку |
| Контраст, читаемость, клавиатура, доступность | `accessibility-review` | — |
| Разнобой в стилях, захардкоженные значения | `design-system-audit` | — |
| Передать макет разработчику | `design-handoff` | — |
| Безопасность сайта или кода, уязвимости | `security-audit` | — |

## 3. Сайт: SEO

| Запрос | Включать сразу | Только если |
|---|---|---|
| SEO в целом, не ясно что именно | `seo` | — |
| Полный аудит сайта | `seo-audit` | — |
| Одна страница | `seo-page` | — |
| Скорость, индексация, robots, Core Web Vitals | `seo-technical` | `seo-google` — есть доступ к Search Console или PageSpeed API |
| Разметка schema.org | `seo-schema` | — |
| Карта сайта | `seo-sitemap` | — |
| Картинки: alt, вес, формат | `seo-images` | `seo-image-gen` — нужно создать OG-картинку |
| Качество текстов страницы | `seo-content` | `seo-content-brief` — нужно ТЗ на новый текст |
| Видимость в ChatGPT, Perplexity, AI Overviews | `seo-geo` | `seo-agentic` — спрашивают про llms.txt и ИИ-агентов |
| Локальный бизнес, карты, Google Business Profile | `seo-local` | `seo-maps` — нужен замер позиций по карте |
| Интернет-магазин, карточки товаров | `seo-ecommerce` | — |
| Стратегия, семантика, план контента | `seo-plan` | `seo-cluster` — кластеризация ключей; `seo-programmatic` — страницы по шаблону; `seo-competitor-pages` — страницы сравнения |
| Ссылки и доноры | `seo-backlinks` | — |
| Несколько языков | `seo-hreflang` | — |
| Что сломалось после выкладки | `seo-drift` | — |
| Страница не ранжируется, хотя оптимизирована | `seo-sxo` | — |

`seo-flow` и `seo-dataforseo` включай, только когда пользователь называет FLOW или DataForSEO.

## 4. Сайт: хостинг, домен, сервисы

| Запрос | Включать сразу | Только если |
|---|---|---|
| Бесплатный хостинг или сервис | `free-for-dev` | — |
| Бесплатный домен | `free-domain` | — |
| Мониторинг, сайт упал, статус-страница | `upptime` | `uptime-kuma` — у пользователя есть свой сервер |
| Разместить сайт на своём сервере | `coolify` | — |
| Замена платной подписки своим софтом | `awesome-selfhosted` | — |
| Нужен API или источник данных | `public-apis` | — |

## 5. Графика и бренд

| Запрос | Включать сразу | Только если |
|---|---|---|
| Баннер, обложка, картинка для соцсетей или рекламы | `banner-design` | `canvas-design` — нужен постер или печатный макет |
| Логотип, айдентика, фирменный стиль, тон бренда | `brand`, `design` | `brand-guidelines` — оформляют в стиле Anthropic |
| Иллюстрация кодом | `paint` | `algorithmic-art` — генеративное искусство |
| Генерация картинок моделью FLUX | `flux-best-practices` | `bfl-api` — пишут код вызова API |
| Диаграмма, график | `beautiful-mermaid` | `d3-viz` — нужна интерактивная визуализация |
| GIF для Slack | `slack-gif-creator` | — |

## 6. Презентации и документы

| Запрос | Включать сразу | Только если |
|---|---|---|
| Презентация без названного формата | `slides` | `frontend-slides` — просят HTML с анимацией; `slideshow` — показ в HyperFrames |
| Файл PowerPoint | `pptx` | — |
| Документ, отчёт, предложение | `docs` | `doc-coauthoring` — пишут вместе по шагам |
| Файл Word, Excel, PDF | `docx`, `xlsx` или `pdf` по формату | `pdf-reading`, `file-reading` — файл нужно только прочитать |
| Google Docs, Sheets, Slides | `google-workspace` | — |
| Внутренняя рассылка, статус-отчёт | `internal-comms` | — |
| Проверить договор или оферту | `fabric-check-agreement` | — |
| Писать в стиле пользователя | `setup-writing-style` | — |

## 7. Видео

| Запрос | Включать сразу | Только если |
|---|---|---|
| Смонтировать отснятое: нарезка, цвет, субтитры | `video-use` | `video-edit`, `ffmpeg` — простая обрезка, сжатие или конвертация |
| Смонтировать рилс из отснятого | `reels-editor` | — |
| Сгенерировать короткий ролик с озвучкой | `reelsmith` | `ai-video-gen` — нужны ИИ-клипы от конкретного провайдера |
| Разобрать чужой ролик, как он снят | `rea-video` | `video-understand` — нужна только расшифровка и кадры |
| Повторить чужой ролик | `reverse-any-video` | `style-sampling` — новый ролик в готовом стиле |
| Ролик кодом в HyperFrames | `hyperframes` | `hyperframes-cli` — команды; `hyperframes-registry` — готовые блоки; `media-use` — музыка и медиа; `figma` — дизайн из Figma; `remotion-to-hyperframes` — перенос из Remotion |
| Ролик кодом в Remotion | `remotion-best-practices` | остальные `remotion-*` — он сам направит на нужный |
| Новое видео, движок не выбран | `video-making` | — |
| Скачать видео по ссылке | `video-download` | — |
| Запись экрана или демо сайта | `playwright-recording` | — |
| Обучающее видео в стиле 3Blue1Brown | `manim-composer` | `manimce-best-practices` или `manimgl-best-practices` — по версии Manim |
| Аватар, говорящая голова | `avatar-video` | `create-video` — ролик по одному промпту; `faceswap`, `video-translate` — по названию задачи |

Скиллы `remotion`, `remotion-captions`, `remotion-create`, `remotion-docs`, `remotion-interactivity`, `remotion-license`, `remotion-maps`, `remotion-markup`, `remotion-multimedia`, `remotion-render`, `remotion-saas`, `remotion-studio`, `remotion-upgrade` включай только внутри проекта на Remotion.
Скиллы `video_toolkit`, `heygen`, `ltx2` включай, только когда пользователь называет этот инструмент.

## 8. Звук

| Запрос | Включать сразу | Только если |
|---|---|---|
| Озвучка текста | `elevenlabs` | `text-to-speech` — через HeyGen; `azure-text-to-speech` — через Azure |
| Расшифровка речи | `speech-to-text` | `azure-speech-to-text` — через Azure |
| Музыка | `music` | `acestep` — локальная генерация ACE-Step |
| Звуковые эффекты | `sound-effects` | — |
| Нет ключа ElevenLabs | `setup-api-key` | — |

`agents` включай, только когда строят голосового агента ElevenLabs.

## 9. Соцсети

Включай только по прямой просьбе про Instagram или YouTube.

| Запрос | Включать сразу | Только если |
|---|---|---|
| Сценарий рилса | `ig-reel` | `ig-viral` — сначала ищут, что залетает в нише |
| Карусель | `ig-carousel` | — |
| Сторис | `ig-story` | — |
| Подпись и хэштеги | `ig-caption` | `ig-human` — убрать следы нейросети |
| Контент-план Instagram | `ig-plan` | `ig-repurpose` — есть длинное видео или текст на нарезку |
| Профиль и аналитика Instagram | `ig-profile` или `ig-audit` | — |
| Комментарии и директ | `ig-reply`, `ig-comment` или `ig-dm` по задаче | — |
| Сценарий YouTube | `yt-script` | `yt-viral` — сначала ищут, что работает |
| Название и обложка | `yt-package` | — |
| Описание, теги, главы | `yt-seo` | `yt-chapters` — нужны таймкоды |
| Шортсы из длинного видео | `yt-shorts` | `yt-edit` — нужен лист монтажа |
| План и аналитика канала | `yt-plan` или `yt-audit` | `yt-retention` — есть график удержания |
| Комментарии YouTube | `yt-comment` | — |

## 10. Исследования и тексты

| Запрос | Включать сразу | Только если |
|---|---|---|
| Исследование рынка, конкурентов, референсов | `deep-research` | `agent-reach` — нужны соцсети, YouTube или китайские платформы |
| Интервью, опросы | `user-research` | — |
| Выводы из отзывов и интервью | `research-synthesis` | — |
| Выжимка идей из текста или расшифровки | `fabric-extract-wisdom` | — |
| Разбор дня, недели, года; паттерн Fabric по имени | `fabric` | — |
| Убрать «нейросетевой» тон | `humanizer` | — |
| Объясни, научи | `learn` | `ai-agents-for-beginners`, `llm-course`, `llms-from-scratch`, `build-your-own-x` — тема совпадает с курсом |
| Финансовый расчёт | `financial-calculator` | — |

## 11. Инструменты Claude

Включай только по прямой просьбе.

| Запрос | Включать сразу |
|---|---|
| Создать или улучшить скилл | `skill-creator` |
| Найти скилл под задачу | `find-skills` |
| Подключить Claude к сервису | `awesome-mcp-servers` |
| Написать свой MCP-сервер | `mcp-builder` |
| Правила для Cursor | `awesome-cursorrules` |
| Сложный артефакт на React | `web-artifacts-builder` |
| Посмотреть артефакт глазами пользователя | `artifact-emulator` |
| Факты о продуктах Anthropic | `product-self-knowledge` |
| Перенести память из другого ИИ | `import-memory` |
| Утренний брифинг | `morning` |
| Работа в браузере или на компьютере пользователя | `built-in-browser`, `chrome-browser` или `computer-use` — по тому, какие инструменты доступны |

## 12. Бытовые задачи

К сайту не относятся. Включай только по прямой просьбе и только при доступе к браузеру или телефону пользователя:
`call-to-book`, `cancel-unsubscribe`, `return-refund`, `prescription-refill`, `grocery-shopping`, `meal-delivery`, `hire-help`, `event-planning`, `file-form`, `file-expenses`, `benepass-reimbursement`.

## Работа над сайтом

- Перед правкой вёрстки прочитай текущие `index.html` и нужные файлы в `css/`, сохраняй существующий стиль и шрифты.
- Каждое визуальное изменение проверяй на мобильной ширине и на десктопе.
- После изменений покажи результат: скриншот или описание того, что изменилось.
