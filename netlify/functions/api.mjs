// API сайта «Рассылка Damillion»: вход, очередь, статусы, дожим, присутствие, отчёт, импорт/экспорт.
import { getStore } from "@netlify/blobs";
import { createHash, createHmac, createDecipheriv, timingSafeEqual } from "node:crypto";
import seed from "../lib/seed-data.mjs";

export const STATUSES = ["new", "sent", "followup", "noreply", "interested", "refused", "skip"];
const LABEL = { new: "Новый", sent: "Написал", followup: "Напомнил", noreply: "Не ответил", interested: "Интерес", refused: "Отказал", skip: "Нет WhatsApp" };
const SESSION_DAYS = 30;
const EVENTS_CAP = 4000;

export const DEFAULT_SETTINGS = {
  dailyPlan: 60,
  devs: [],
  autoSent: true,
  followupHours: 48,
  templates: {
      "furniture": "Здравствуйте! Я {manager}, веб-студия Damillion, Алматы.\n\n{hook}\n\nМы делаем сайты для мебельных компаний: одна страница, где ваши работы с фото, цены и кнопка «Написать в WhatsApp». Ссылку ставите в Instagram и 2ГИС, и клиент сразу видит, что вы делаете и сколько это стоит, и пишет вам.\n\nСтоимость от {from}, готово за несколько дней.\n\nПоказать пример, как это выглядит?",
      "massage": "Здравствуйте! Я {manager}, веб-студия Damillion, Алматы.\n\n{hook}\n\nМы делаем сайты для массажных салонов: одна страница, где ваши услуги с ценами, фото, отзывы и кнопка «Записаться в WhatsApp». Ссылку ставите в Instagram и 2ГИС, и человек выбирает массаж и сразу записывается.\n\nСтоимость от {from}, готово за несколько дней.\n\nПоказать пример, как это выглядит?",
      "default": "Здравствуйте! Я {manager}, веб-студия Damillion, Алматы.\n\n{hook}\n\nМы делаем сайты для местного бизнеса: одна страница, где ваши услуги, цены, фото и кнопка «Написать в WhatsApp». Ссылку ставите в Instagram и 2ГИС, и клиент сразу понимает, что вы предлагаете, и пишет вам.\n\nСтоимость от {from}, готово за несколько дней.\n\nПоказать пример, как это выглядит?",
      "followup": "Здравствуйте! Это снова {manager} из Damillion. Писал вам про сайт для «{name}».\n\nКоротко: страница в интернете, где ваши услуги, цены и кнопка WhatsApp, от {from}. Показать пример?\n\nЕсли не актуально, напишите «нет», больше не побеспокою."
  },
  hooks: {
      "withReviews": "Нашёл «{name}» в 2ГИС: рейтинг {rating} и {reviews}, это сильно. Но своего сайта у вас нет.",
      "withoutReviews": "Нашёл «{name}» в 2ГИС и увидел, что своего сайта у вас нет."
  },
  templatesKz: {
      "furniture": "Сәлеметсіз бе! Мен {manager}, Алматыдағы Damillion веб-студиясынанмын.\n\n{hook}\n\nЖиһаз компанияларына сайт жасаймыз: бір бетте жұмыстарыңыздың фотолары, бағалар және «WhatsApp-қа жазу» батырмасы. Сілтемені Instagram мен 2ГИС-ке қоясыз, клиент не жасайтыныңызды, бағасын бірден көріп, сізге жазады.\n\nБағасы {from}-ден бастап, бірнеше күнде дайын.\n\nҮлгісін көрсетейін бе?",
      "massage": "Сәлеметсіз бе! Мен {manager}, Алматыдағы Damillion веб-студиясынанмын.\n\n{hook}\n\nМассаж салондарына сайт жасаймыз: бір бетте қызметтер мен бағалар, фото, пікірлер және «WhatsApp арқылы жазылу» батырмасы. Сілтемені Instagram мен 2ГИС-ке қоясыз, адам массажды таңдап, бірден жазылады.\n\nБағасы {from}-ден бастап, бірнеше күнде дайын.\n\nҮлгісін көрсетейін бе?",
      "default": "Сәлеметсіз бе! Мен {manager}, Алматыдағы Damillion веб-студиясынанмын.\n\n{hook}\n\nЖергілікті бизнеске сайт жасаймыз: бір бетте қызметтеріңіз, бағалар, фото және «WhatsApp-қа жазу» батырмасы. Сілтемені Instagram мен 2ГИС-ке қоясыз, клиент не ұсынатыныңызды бірден түсініп, сізге жазады.\n\nБағасы {from}-ден бастап, бірнеше күнде дайын.\n\nҮлгісін көрсетейін бе?",
      "followup": "Қайта сәлеметсіз бе! Бұл Damillion-нан {manager}. «{name}» үшін сайт туралы жазған едім.\n\nҚысқаша: қызметтеріңіз, бағалар және WhatsApp батырмасы бар бет, {from}-ден бастап. Үлгісін көрсетейін бе?\n\nҚажет болмаса, «жоқ» деп жазыңыз, енді мазаламаймын."
  },
  hooksKz: {
      "withReviews": "«{name}» компаниясын 2ГИС-тен таптым: рейтингіңіз {rating}, {reviews}, бұл жақсы нәтиже. Бірақ өз сайтыңыз жоқ.",
      "withoutReviews": "«{name}» компаниясын 2ГИС-тен таптым, өз сайтыңыз жоқ екен."
  },
  examples: {
      "furniture": "https://ricca.design",
      "massage": "https://golden-scone-7ab7a0.netlify.app",
      "default": "https://golden-scone-7ab7a0.netlify.app"
  },
  templatesDev: {
    furniture: "Здравствуйте! Это {manager}, разработчик Damillion. Наш менеджер {worker} передал мне ваш запрос: вам интересен сайт для «{name}». Посмотрел вашу карточку в 2ГИС. {devhook} Предлагаю так: за сутки соберу черновую версию сайта с вашими фото и каталогом, бесплатно. Посмотрите вживую и решите, нужно ли. Подскажите одно: что важнее показать клиенту — готовые работы или каталог с ценами?",
    massage: "Здравствуйте! Это {manager}, разработчик Damillion. Наш менеджер {worker} передал мне ваш запрос: вам интересен сайт для «{name}». Посмотрел вашу карточку в 2ГИС. {devhook} Предлагаю так: за сутки соберу черновую версию сайта с вашими услугами, ценами и кнопкой записи, бесплатно. Посмотрите вживую и решите. Подскажите одно: к вам чаще записываются по телефону или в WhatsApp?",
    default: "Здравствуйте! Это {manager}, разработчик Damillion. Наш менеджер {worker} передал мне ваш запрос: вам интересен сайт для «{name}». Посмотрел вашу карточку в 2ГИС. {devhook} Предлагаю так: за сутки соберу черновую версию сайта, бесплатно. Посмотрите вживую и решите. Подскажите одно: сайт в первую очередь должен приводить заявки или показывать ваши работы?",
  },
  templatesDevKz: {
    furniture: "Сәлеметсіз бе! Бұл {manager}, Damillion әзірлеушісі. Біздің менеджер {worker} сізбен сөйлескен, сізге «{name}» үшін сайт қызық екен. 2ГИС-тегі карточкаңызды қарадым. {devhook} Ұсынысым: бір тәулікте сіздің фотоларыңыз бен каталогыңызбен сайттың алғашқы нұсқасын тегін жасап беремін. Көріп, содан кейін шешесіз. Бір сұрақ: клиентке не маңыздырақ — дайын жұмыстар ма, әлде бағасы бар каталог па?",
    massage: "Сәлеметсіз бе! Бұл {manager}, Damillion әзірлеушісі. Біздің менеджер {worker} сізбен сөйлескен, сізге «{name}» үшін сайт қызық екен. 2ГИС-тегі карточкаңызды қарадым. {devhook} Ұсынысым: бір тәулікте қызметтеріңіз, бағаларыңыз және жазылу батырмасы бар сайттың алғашқы нұсқасын тегін жасап беремін. Көріп, содан кейін шешесіз. Бір сұрақ: сізге көбіне телефон арқылы жазыла ма, әлде WhatsApp арқылы ма?",
    default: "Сәлеметсіз бе! Бұл {manager}, Damillion әзірлеушісі. Біздің менеджер {worker} сізбен сөйлескен, сізге «{name}» үшін сайт қызық екен. 2ГИС-тегі карточкаңызды қарадым. {devhook} Ұсынысым: бір тәулікте сайттың алғашқы нұсқасын тегін жасап беремін. Көріп, содан кейін шешесіз. Бір сұрақ: сайт ең алдымен өтінім әкелуі керек пе, әлде жұмыстарыңызды көрсетуі керек пе?",
  },
  packages: [
    { name: "Базовый", price: 45000, act: 60000 },
    { name: "Для бизнеса", price: 100000, act: 125000 },
    { name: "Премиум", price: 225000, act: 250000 },
    { name: "Ультра", price: 450000, act: 450000 },
  ],
  templatesDeal: {
    brief: "Отлично, начинаю. Чтобы черновик был про вас, а не шаблон, пришлите сюда:\n— 5–10 фото (работы, интерьер, команда)\n— услуги или товары с ценами\n— логотип, если есть\nМожно прямо с телефона. Тексты и дизайн беру на себя.",
    draft: "Готово, вот черновик сайта для «{name}»: {link}\nОткройте с телефона, так его увидят ваши клиенты. Что поменять, пишите сюда, поправлю.",
    nudge: "Здравствуйте! Успели посмотреть черновик? {link}\nЕсли что-то не нравится, скажите, переделаю.",
    offer: "По цене: «{pkg}», {price} ₸. На каждый сайт даём гарантию. Как будете готовы, скину реквизиты, и доводим сайт до запуска.",
    done: "Сайт «{name}» запущен: {link}\nСсылку можно поставить в Instagram, 2ГИС и WhatsApp. Если что-то перестанет работать, пишите сюда, гарантия на нас. И будем благодарны за пару слов отзыва, это нам очень поможет.",
  },
  templatesDealKz: {
    brief: "Керемет, бастаймын. Алғашқы нұсқа шаблон емес, сіз туралы болуы үшін осында жіберіңізші:\n— 5–10 фото (жұмыстар, интерьер, команда)\n— қызметтер немесе тауарлар, бағасымен\n— логотип, болса\nТелефоннан түсірілген фото да болады. Мәтін мен дизайнды өзім жасаймын.",
    draft: "Дайын, «{name}» сайтының алғашқы нұсқасы: {link}\nТелефоннан ашып көріңіз, клиенттеріңіз дәл солай көреді. Не өзгерту керек болса, осында жазыңыз, түзетемін.",
    nudge: "Сәлеметсіз бе! Алғашқы нұсқаны көріп үлгердіңіз бе? {link}\nБірдеңе ұнамаса, айтыңыз, өзгертемін.",
    offer: "Бағасы: «{pkg}», {price} ₸. Әр сайтқа кепілдік береміз. Дайын болғанда реквизиттерді жіберемін, сайтты іске қосуға дейін жеткіземіз.",
    done: "«{name}» сайты іске қосылды: {link}\nСілтемені Instagram, 2ГИС және WhatsApp-қа қоюға болады. Бірдеңе істемей қалса, осында жазыңыз, кепілдік бізде. Қысқа пікір қалдырсаңыз, бізге көп көмектеседі.",
  },
  scripts: [
      {
          "niche": "",
          "title": "Кто вы?",
          "ru": "Я {manager}, веб-студия Damillion из Алматы. Делаем сайты для местного бизнеса. Ваш номер взял из 2ГИС: увидел, что у «{name}» нет своего сайта, поэтому и написал. Наши работы: {example}",
          "kz": "Мен {manager}, Алматыдағы Damillion веб-студиясынанмын. Жергілікті бизнеске сайт жасаймыз. Нөміріңізді 2ГИС-тен алдым: «{name}» өз сайты жоқ екенін көрдім, сондықтан жаздым. Біздің жұмыстар: {example}"
      },
      {
          "niche": "furniture",
          "title": "Не понял, что за сайт",
          "ru": "Сайт — это ваша страница в интернете, как витрина магазина. На ней ваши работы с фото, цены, адрес и кнопка «Написать в WhatsApp». Ссылку ставите в Instagram и 2ГИС или отправляете клиентам. Человек открывает, видит, что вы делаете, и сразу пишет вам. Вот как это выглядит: {example}",
          "kz": "Сайт — интернеттегі сіздің бетіңіз, дүкен витринасы сияқты. Онда жұмыстарыңыздың фотолары, бағалар, мекенжай және «WhatsApp-қа жазу» батырмасы бар. Сілтемені Instagram мен 2ГИС-ке қоясыз немесе клиенттерге жібересіз. Адам ашып, не жасайтыныңызды көреді де, бірден жазады. Үлгісі: {example}"
      },
      {
          "niche": "massage",
          "title": "Не понял, что за сайт",
          "ru": "Сайт — это ваша страница в интернете. На ней услуги и цены, фото кабинета, отзывы и кнопка «Записаться в WhatsApp». Ссылку ставите в Instagram и 2ГИС, человек открывает, выбирает массаж и сразу записывается. Вот как это выглядит: {example}",
          "kz": "Сайт — интернеттегі сіздің бетіңіз. Онда қызметтер мен бағалар, кабинет фотолары, пікірлер және «WhatsApp арқылы жазылу» батырмасы бар. Сілтемені Instagram мен 2ГИС-ке қоясыз, адам ашып, массажды таңдап, бірден жазылады. Үлгісі: {example}"
      },
      {
          "niche": "",
          "title": "Не понял, что за сайт",
          "ru": "Сайт — это ваша страница в интернете. На ней ваши услуги, цены, фото и кнопка «Написать в WhatsApp». Ссылку ставите в Instagram и 2ГИС, человек открывает и сразу пишет вам. Вот как это выглядит: {example}",
          "kz": "Сайт — интернеттегі сіздің бетіңіз. Онда қызметтеріңіз, бағалар, фото және «WhatsApp-қа жазу» батырмасы бар. Сілтемені Instagram мен 2ГИС-ке қоясыз, адам ашып, бірден жазады. Үлгісі: {example}"
      },
      {
          "niche": "furniture",
          "title": "Зачем нам сайт?",
          "ru": "Мебель на заказ выбирают долго: человек хочет посмотреть работы, понять цены, сравнить. Если всё это на одной странице, он пишет вам, а не уходит к тем, у кого сайт есть. И сайт находят в Google по запросу «мебель на заказ Алматы», а Instagram там не ищут.",
          "kz": "Жиһазды ұзақ таңдайды: адам жұмыстарды көргісі, бағасын білгісі, салыстырғысы келеді. Бәрі бір бетте болса, ол сайты барларға емес, сізге жазады. Оған қоса сайтты Google-ден «Алматы жиһаз на заказ» деп іздеп табады, ал Instagram-ды онда іздемейді."
      },
      {
          "niche": "massage",
          "title": "Зачем нам сайт?",
          "ru": "На массаж записываются быстро: человек смотрит цены, отзывы и сразу хочет записаться. Если всё на одной странице с кнопкой записи, он пишет вам, а не ищет дальше. И сайт находят в Google по запросу «массаж Алматы», а Instagram там не ищут.",
          "kz": "Массажға тез жазылады: адам бағасы мен пікірлерді көріп, бірден жазылғысы келеді. Бәрі жазылу батырмасы бар бір бетте болса, ол әрі қарай іздемей, сізге жазады. Оған қоса сайтты Google-ден «массаж Алматы» деп іздеп табады, ал Instagram-ды онда іздемейді."
      },
      {
          "niche": "",
          "title": "Зачем нам сайт?",
          "ru": "Клиенты сейчас сначала ищут в интернете: смотрят работы, цены, отзывы. Если всё это на одной странице с кнопкой WhatsApp, человек пишет вам, а не уходит к тем, у кого сайт есть. И сайт находят в Google, а Instagram там не ищут.",
          "kz": "Клиенттер қазір алдымен интернеттен іздейді: жұмыстарды, бағаларды, пікірлерді қарайды. Бәрі WhatsApp батырмасы бар бір бетте болса, адам сайты барларға емес, сізге жазады. Оған қоса сайтты Google-ден табады, ал Instagram-ды онда іздемейді."
      },
      {
          "niche": "",
          "title": "Покажите пример",
          "ru": "Вот пример: {example}\nДля «{name}» сделаем так же, только с вашими фото, ценами и вашим номером WhatsApp. Откройте с телефона, так его увидят ваши клиенты.",
          "kz": "Міне үлгісі: {example}\n«{name}» үшін дәл осылай жасаймыз, тек сіздің фотоларыңызбен, бағаларыңызбен және WhatsApp нөміріңізбен. Телефоннан ашып көріңіз, клиенттеріңіз солай көреді."
      },
      {
          "niche": "",
          "title": "Сколько стоит?",
          "ru": "Цены такие:\n{prices}\nДля начала обычно хватает «Базового». Точную цену скажу, когда пойму, сколько у вас работ и услуг. На каждый сайт даём гарантию.",
          "kz": "Бағалар:\n{prices}\nБастау үшін әдетте «Базовый» жеткілікті. Нақты бағасын жұмыстарыңыз бен қызметтеріңіздің көлемін білгенде айтамын. Әр сайтқа кепілдік береміз."
      },
      {
          "niche": "furniture",
          "title": "Дорого",
          "ru": "Понимаю. Смотрите: один заказ кухни или шкафа у вас стоит в разы больше, чем сайт. Если сайт приведёт хотя бы одного клиента, он уже окупился. Можно начать с «Базового» за {from}, потом расширить.",
          "kz": "Түсінемін. Қараңыз: бір ас үй немесе шкаф тапсырысы сайттан бірнеше есе қымбат. Сайт бір ғана клиент әкелсе, ол өзін ақтайды. «Базовый» тарифінен бастауға болады, бағасы {from}, кейін кеңейтесіз."
      },
      {
          "niche": "massage",
          "title": "Дорого",
          "ru": "Понимаю. Это как несколько сеансов массажа. Если сайт приведёт хотя бы пару постоянных клиентов, он окупится за месяц. Можно начать с «Базового» за {from}, потом расширить.",
          "kz": "Түсінемін. Бұл бірнеше массаж сеансының бағасындай. Сайт бір-екі тұрақты клиент әкелсе, бір айда өзін ақтайды. «Базовый» тарифінен бастауға болады, бағасы {from}, кейін кеңейтесіз."
      },
      {
          "niche": "",
          "title": "Дорого",
          "ru": "Понимаю. Если сайт приведёт хотя бы одного-двух клиентов, он уже окупился. Можно начать с «Базового» за {from}, потом расширить.",
          "kz": "Түсінемін. Сайт бір-екі клиент әкелсе, өзін ақтайды. «Базовый» тарифінен бастауға болады, бағасы {from}, кейін кеңейтесіз."
      },
      {
          "niche": "furniture",
          "title": "Есть Instagram",
          "ru": "Instagram — это хорошо, сайт его не заменяет, а дополняет. В Instagram работы теряются в ленте, а на сайте всё по полочкам: каталог, цены, кнопка WhatsApp. Ссылку ставите в шапку профиля, и вам меньше пишут «сколько стоит», а пишут уже готовые клиенты. И сайт находят в Google, Instagram — нет.",
          "kz": "Instagram — жақсы, сайт оны алмастырмайды, толықтырады. Instagram-да жұмыстар лентада жоғалып кетеді, ал сайтта бәрі ретімен: каталог, бағалар, WhatsApp батырмасы. Сілтемені профиль шапкасына қоясыз, «бағасы қанша» деп аз жазады, дайын клиенттер жазады. Оған қоса сайтты Google табады, Instagram-ды таппайды."
      },
      {
          "niche": "massage",
          "title": "Есть Instagram",
          "ru": "Instagram — это хорошо, сайт его не заменяет, а дополняет. В Instagram прайс и отзывы теряются в ленте, а на сайте всё на одной странице: услуги, цены, отзывы и кнопка записи. Ссылку ставите в шапку профиля, и к вам записываются без лишних вопросов. И сайт находят в Google, Instagram — нет.",
          "kz": "Instagram — жақсы, сайт оны алмастырмайды, толықтырады. Instagram-да прайс пен пікірлер лентада жоғалады, ал сайтта бәрі бір бетте: қызметтер, бағалар, пікірлер және жазылу батырмасы. Сілтемені профиль шапкасына қоясыз, артық сұрақсыз жазылады. Оған қоса сайтты Google табады, Instagram-ды таппайды."
      },
      {
          "niche": "",
          "title": "Есть Instagram",
          "ru": "Instagram — это хорошо, сайт его не заменяет, а дополняет. На сайте всё на одной странице: услуги, цены и кнопка WhatsApp. Ссылку ставите в шапку профиля, и вам пишут уже готовые клиенты. И сайт находят в Google, Instagram — нет.",
          "kz": "Instagram — жақсы, сайт оны алмастырмайды, толықтырады. Сайтта бәрі бір бетте: қызметтер, бағалар және WhatsApp батырмасы. Сілтемені профиль шапкасына қоясыз, дайын клиенттер жазады. Оған қоса сайтты Google табады, Instagram-ды таппайды."
      },
      {
          "niche": "",
          "title": "Есть 2ГИС, хватает",
          "ru": "2ГИС — это хорошо, вас там уже находят. Но там вы рядом с конкурентами, и человек листает дальше. Сайт — ваша отдельная страница, где только вы: работы, цены, отзывы. Ссылку на сайт можно добавить прямо в карточку 2ГИС.",
          "kz": "2ГИС — жақсы, сізді онда табады. Бірақ онда сіз бәсекелестермен қатар тұрасыз, адам әрі қарай парақтайды. Сайт — тек сізге арналған бет: жұмыстар, бағалар, пікірлер. Сайт сілтемесін 2ГИС карточкасына да қосуға болады."
      },
      {
          "niche": "",
          "title": "Клиентов и так хватает",
          "ru": "Отлично, значит дело идёт. Тогда сайт нужен, чтобы выглядеть солиднее и брать заказы дороже: клиент заранее видит ваши работы и цены и приходит уже готовым.",
          "kz": "Керемет, демек ісіңіз жүріп жатыр. Онда сайт салмақтырақ көріну және қымбатырақ тапсырыс алу үшін керек: клиент жұмыстарыңыз бен бағаларды алдын ала көріп, дайын болып келеді."
      },
      {
          "niche": "",
          "title": "Подумаю",
          "ru": "Конечно. Вот пример, чтобы было на что посмотреть: {example}\nЕсли появятся вопросы, пишите сюда, отвечу.",
          "kz": "Әрине. Қарап шығуға үлгісі: {example}\nСұрақ болса, осында жазыңыз, жауап беремін."
      },
      {
          "niche": "",
          "title": "Нет времени",
          "ru": "От вас нужно минут 15: прислать фото и цены, можно прямо с телефона. Тексты, дизайн и запуск делаем мы. Готово за несколько дней.",
          "kz": "Сізден 15 минут керек: фото мен бағаларды жіберу, телефоннан да болады. Мәтін, дизайн және іске қосуды біз жасаймыз. Бірнеше күнде дайын."
      },
      {
          "niche": "furniture",
          "title": "Что от нас нужно?",
          "ru": "Совсем немного: 10–20 фото ваших работ (можно с телефона), примерные цены или «от …» на основные изделия, адрес и логотип, если есть. Остальное делаем мы.",
          "kz": "Аз ғана: жұмыстарыңыздың 10–20 фотосы (телефоннан да болады), негізгі бұйымдардың шамамен бағасы, мекенжай және логотип, болса. Қалғанын біз жасаймыз."
      },
      {
          "niche": "massage",
          "title": "Что от нас нужно?",
          "ru": "Совсем немного: список услуг с ценами, 5–10 фото кабинета или мастеров, адрес, часы работы и логотип, если есть. Остальное делаем мы.",
          "kz": "Аз ғана: қызметтер тізімі бағасымен, кабинет немесе мамандардың 5–10 фотосы, мекенжай, жұмыс уақыты және логотип, болса. Қалғанын біз жасаймыз."
      },
      {
          "niche": "",
          "title": "Что от нас нужно?",
          "ru": "Совсем немного: фото ваших работ или помещения, список услуг с ценами, адрес и логотип, если есть. Остальное делаем мы.",
          "kz": "Аз ғана: жұмыстарыңыздың немесе орныңыздың фотолары, қызметтер тізімі бағасымен, мекенжай және логотип, болса. Қалғанын біз жасаймыз."
      },
      {
          "niche": "",
          "title": "Сколько по времени?",
          "ru": "Простой сайт делаем за несколько дней после того, как получим от вас фото и цены. Сайт побольше занимает дольше, сроки скажу заранее.",
          "kz": "Қарапайым сайтты фото мен бағаларды алғаннан кейін бірнеше күнде жасаймыз. Үлкенірек сайт ұзағырақ, мерзімін алдын ала айтамын."
      },
      {
          "niche": "",
          "title": "А гарантия?",
          "ru": "Да, на каждый сайт даём гарантию: если что-то перестанет работать, исправим бесплатно.",
          "kz": "Иә, әр сайтқа кепілдік береміз: бірдеңе істемей қалса, тегін түзетеміз."
      },
      {
          "niche": "",
          "title": "Напишите позже",
          "ru": "Хорошо, без проблем. Когда вам удобно? Напишу в это время.",
          "kz": "Жақсы, мәселе жоқ. Сізге қашан ыңғайлы? Сол уақытта жазамын."
      },
      {
          "niche": "",
          "title": "Уже есть сайт",
          "ru": "Понял, спасибо! Если захотите обновить сайт или сделать новый, пишите сюда.",
          "kz": "Түсіндім, рахмет! Сайтты жаңартқыңыз немесе жаңасын жасағыңыз келсе, осында жазыңыз."
      },
      {
          "niche": "",
          "title": "Не интересно",
          "ru": "Понял, спасибо за ответ. Если позже понадобится сайт, пишите, контакт останется.",
          "kz": "Түсіндім, жауабыңызға рахмет. Кейін сайт керек болса, жазыңыз, байланыс сақталады."
      }
  ],
};
const LANGS = ["ru", "kz"];
export const DEAL_STAGES = ["talk", "brief", "draft", "paid", "done", "lost"];
const DEAL_LABEL = { talk: "На связи", brief: "Материалы получены", draft: "Черновик отправлен", paid: "Оплата получена", done: "Сайт сдан", lost: "Не купил" };
const money = (v) => Math.max(0, Math.min(1e9, Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0)));
function cleanPackages(arr) {
  return (Array.isArray(arr) ? arr : []).filter((x) => x && String(x.name || "").trim()).slice(0, 12)
    .map((x) => { const price = money(x.price); return { name: String(x.name).trim().slice(0, 40), price, act: money(x.act) || price }; });
}

const env = (k) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "").trim();
const OWNER_NAME = "Азамат";
// Владелец мог заходить как «Aza», «aza», «Владелец»: это всё один человек.
const OWNER_ALIAS = /^(aza|азамат|владелец)$/i;
const ownerName = (n) => (!n || OWNER_ALIAS.test(String(n).trim()) ? OWNER_NAME : String(n).trim());
const isDevName = (s, n) => (s.settings.devs || []).some((d) => d.toLowerCase() === String(n || "").toLowerCase());
// Уровень клиента: крупный / средний / малый (та же формула в public/index.html).
const GENERIC_NAME = /^(массажный кабинет|массаж|massage)$|^мебель( на заказ| и двери)?(\s|\(|$)/i;
const BIG_HINT = /(трц|тц |бц |шоу-?рум|showroom|фабрик|factory|производ|premium|премиум|luxury|lux|vip)/i;
export function tierScore(c) {
  const r = +c.reviews || 0, x = parseFloat(c.rating) || 0;
  let s = r >= 100 ? 40 : r >= 40 ? 28 : r >= 15 ? 16 : r >= 5 ? 8 : 0;
  if (r >= 5) s += x >= 4.7 ? 12 : x >= 4.3 ? 6 : x < 3.5 ? -12 : 0;
  if (c.instagram) s += 12;
  if ((+c.branches || 1) >= 2) s += 15;
  if (BIG_HINT.test(`${c.name} ${c.category || ""} ${c.address || ""}`)) s += 10;
  if (GENERIC_NAME.test(c.name || "")) s -= 15;
  return s;
}
// Внутри каждой ниши: верхние 25% «Крупный», следующие 40% «Средний», остальные «Малый» (и есть нижние пороги очков).
export function rankTiers(list) {
  const by = {}, out = new Map();
  for (const c of list) (by[c.niche || ""] ||= []).push([c, tierScore(c)]);
  for (const a of Object.values(by)) {
    a.sort((x, y) => y[1] - x[1] || (+y[0].reviews || 0) - (+x[0].reviews || 0));
    a.forEach(([c, sc], i) => { const q = i / a.length; out.set(c.phone, q < 0.25 && sc >= 40 ? "big" : q < 0.65 && sc >= 15 ? "mid" : "small"); });
  }
  return out;
}
export const tierOf = (c, map) => (["big", "mid", "small"].includes(c.tier) ? c.tier : (map && map.get(c.phone)) || "small");
const TIER_LABEL = { big: "Крупный", mid: "Средний", small: "Малый" };
const str = (v, n) => String(v ?? "").trim().slice(0, n);
function cleanRow(r) {
  if (!r || typeof r !== "object") return null;
  const phone = normPhone(r.phone), name = str(r.name, 120);
  if (!phone || !name) return null;
  return { name, phone, niche: str(r.niche, 40), address: str(r.address, 200), instagram: str(r.instagram, 80), rating: str(r.rating, 5), reviews: Math.max(0, parseInt(r.reviews) || 0), hours: str(r.hours, 80), category: str(r.category, 80), firmId: str(r.firmId, 30).replace(/\D/g, ""), branches: Math.max(1, parseInt(r.branches) || 1), wa: r.wa ? 1 : 0 };
}
function addRows(s, rows) {
  let ord = Math.max(0, ...Object.values(s.contacts).map((c) => c.ord || 0)), added = 0;
  const ids = new Set(Object.values(s.contacts).map((c) => c.firmId).filter(Boolean));
  for (const r of rows) {
    if (!r || s.contacts[r.phone] || (r.firmId && ids.has(r.firmId))) continue;
    s.contacts[r.phone] = fresh(r, ++ord); added++;
    if (r.firmId) ids.add(r.firmId);
  }
  return added;
}
const store = () => globalThis.__rassylkaStore || getStore({ name: "rassylka", consistency: "strong" });
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- сессии ---------- */
function secret() {
  return createHash("sha256").update(["OWNER_LOGIN", "OWNER_PASS", "WORKER_LOGIN", "WORKER_PASS"].map(env).join("|") + "|rassylka").digest();
}
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");
function makeCookie(session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `rs=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
function readSession(req) {
  const m = /(?:^|;\s*)rs=([^;]+)/.exec(req.headers.get("cookie") || "");
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload)), given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return s && s.role && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
function same(given, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(given || "")), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- стартовый список (зашифрован, ключ SEED_KEY на Netlify) ---------- */
export function decryptSeed() {
  const key = env("SEED_KEY");
  if (!key || !seed?.ct) return { rows: [], error: key ? null : "no_key" };
  try {
    const d = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(seed.iv, "base64"));
    d.setAuthTag(Buffer.from(seed.tag, "base64"));
    const text = Buffer.concat([d.update(Buffer.from(seed.ct, "base64")), d.final()]).toString("utf8");
    return { rows: JSON.parse(text), error: null, version: seed.version || 1 };
  } catch (e) {
    console.error("seed decrypt failed", e.message);
    return { rows: [], error: "bad_key" };
  }
}
function fresh(r, ord) {
  return { name: r.name, phone: r.phone, niche: r.niche || "", address: r.address || "", rating: r.rating || "", reviews: r.reviews || 0, instagram: r.instagram || "", hours: r.hours || "", category: r.category || "", firmId: r.firmId || "", branches: r.branches || 1, wa: r.wa ? 1 : 0, status: "new", ord, by: null, at: null, sentBy: null, sentAt: null, followAt: null, note: "", lang: /[әғқңөұүһі]/i.test(r.name || "") ? "kz" : "ru" };
}
// Добавляет новых клиентов из стартового списка и дополняет карточки (рейтинг, Instagram...), статусы не трогает.
function applySeed(s) {
  const { rows, error, version } = decryptSeed();
  s.seedError = error;
  if (error || !rows.length || s.seedVersion === version) return false;
  let ord = Math.max(0, ...Object.values(s.contacts).map((c) => c.ord || 0));
  for (const r of rows) {
    const phone = normPhone(r.phone);
    if (!phone) continue;
    const c = s.contacts[phone];
    if (!c) s.contacts[phone] = fresh({ ...r, phone }, ++ord);
    else for (const k of ["rating", "reviews", "instagram", "hours", "category", "firmId", "address", "niche"]) if (r[k] && !c[k]) c[k] = r[k];
  }
  s.seedVersion = version;
  return true;
}

/* ---------- хранилище ---------- */
function migrate(data) {
  let changed = false;
  if ((data.mig || 0) < 2) {
    // Ноябрь 2026: новые понятные тексты и ответы по нишам заменяют старые.
    const d = DEFAULT_SETTINGS, st = data.settings;
    st.templates = { ...d.templates }; st.hooks = { ...d.hooks }; st.templatesKz = { ...d.templatesKz }; st.hooksKz = { ...d.hooksKz };
    st.examples = { ...d.examples }; st.scripts = d.scripts.map((x) => ({ ...x }));
    changed = true;
  }
  if ((data.mig || 0) >= 1) { if (changed) data.mig = 2; return changed; }
  const fix = (v) => (v && OWNER_ALIAS.test(String(v).trim()) ? OWNER_NAME : v);
  for (const c of Object.values(data.contacts)) { for (const k of ["sentBy", "by", "devBy", "claimedBy"]) if (c[k]) c[k] = fix(c[k]); if (c.deal && c.deal.by) c.deal.by = fix(c.deal.by); }
  for (const e of data.events) e.who = fix(e.who);
  data.mig = 2;
  return true;
}
function normalize(data) {
  data.contacts ||= {};
  data.events ||= [];
  const d = DEFAULT_SETTINGS, st = data.settings || {};
  data.settings = { ...d, ...st, templates: { ...d.templates, ...(st.templates || {}) }, hooks: { ...d.hooks, ...(st.hooks || {}) }, templatesKz: { ...d.templatesKz, ...(st.templatesKz || {}) }, hooksKz: { ...d.hooksKz, ...(st.hooksKz || {}) }, templatesDev: { ...d.templatesDev, ...(st.templatesDev || {}) }, templatesDevKz: { ...d.templatesDevKz, ...(st.templatesDevKz || {}) }, templatesDeal: { ...d.templatesDeal, ...(st.templatesDeal || {}) }, templatesDealKz: { ...d.templatesDealKz, ...(st.templatesDealKz || {}) }, packages: Array.isArray(st.packages) && st.packages.length ? st.packages : d.packages, examples: { ...d.examples, ...(st.examples || {}) }, scripts: Array.isArray(st.scripts) && st.scripts.length ? st.scripts : d.scripts };
  return data;
}
async function readState() {
  const r = await store().getWithMetadata("state", { type: "json" });
  if (!r || !r.data) {
    const data = normalize({ contacts: {}, events: [] });
    applySeed(data); migrate(data);
    const res = await store().setJSON("state", data, { onlyIfNew: true });
    if (res && res.modified === false) return readState();
    return { data, etag: (res && res.etag) || null };
  }
  const data = normalize(r.data);
  let etag = r.etag || null;
  const seeded = applySeed(data), migrated = migrate(data);
  if (seeded || migrated) {
    const res = await store().setJSON("state", data, etag ? { onlyIfMatch: etag } : {});
    if (res && res.modified === false) return readState();
    etag = (res && res.etag) || etag;
  }
  return { data, etag };
}
// Одна запись за раз: читаем, меняем, пишем только если никто не успел раньше; иначе повторяем.
async function mutate(fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await readState();
    const next = fn(data);
    if (next === false) return data;
    if (next.events.length > EVENTS_CAP) next.events = next.events.slice(-EVENTS_CAP);
    const res = await store().setJSON("state", next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return next;
    await sleep(60 + Math.random() * 200);
  }
  throw new Error("busy");
}
async function readPresence() {
  const out = {};
  const { blobs } = await store().list({ prefix: "p/" });
  await Promise.all((blobs || []).map(async (b) => {
    const name = b.key.slice(2);
    if (name !== OWNER_NAME && OWNER_ALIAS.test(name)) { try { await store().delete(b.key); } catch {} return; }
    const v = await store().get(b.key, { type: "json" }); if (v) out[name] = v;
  }));
  return out;
}

/* ---------- утилиты ---------- */
export function normPhone(s) {
  let d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return /^7\d{10}$/.test(d) ? d : null;
}
function parseCsv(text) {
  const rows = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let p = line.split(/[;\t]/);
    if (p.length < 2) p = line.split(",");
    p = p.map((x) => x.trim().replace(/^"|"$/g, ""));
    if (/^\uFEFF?(название|name|компания)$/i.test(p[0])) continue;
    const phone = normPhone(p[1]);
    if (!phone || !p[0]) continue;
    rows.push({ name: p[0], phone, niche: p[2] || "", address: p[3] || "", instagram: p[4] || "" });
  }
  return rows;
}
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const sorted = (state) => Object.values(state.contacts).sort((a, b) => (a.ord || 0) - (b.ord || 0));
const fmtAlmaty = (t) => (t ? new Date(t + 5 * 3600000).toISOString().replace("T", " ").slice(0, 16) : "");

/* ---------- обработчик ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method;

  if (["OWNER_LOGIN", "OWNER_PASS", "WORKER_LOGIN", "WORKER_PASS"].some((k) => !env(k))) {
    return json({ error: "no_passwords", message: "На Netlify не заданы OWNER_LOGIN, OWNER_PASS, WORKER_LOGIN, WORKER_PASS (Site configuration → Environment variables). Задай их и сделай Deploy заново." }, 503);
  }

  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/health" && method === "GET") {
    try {
      const { data } = await readState();
      return json({ ok: true, seed: data.seedError || "ok", seedVersion: data.seedVersion || 0, contacts: Object.keys(data.contacts).length });
    } catch (e) {
      return json({ ok: false, message: e.message }, 500);
    }
  }

  if (path === "/login" && method === "POST") {
    const login = String(body.login || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 40);
    let role = null;
    if (same(login, env("OWNER_LOGIN").toLowerCase()) && same(body.pass, env("OWNER_PASS"))) role = "owner";
    else if (same(login, env("WORKER_LOGIN").toLowerCase()) && same(body.pass, env("WORKER_PASS"))) role = "worker";
    if (!role) return json({ error: "pass", message: "Неверный логин или пароль" }, 401);
    if (role === "worker" && !name) return json({ error: "name", message: "Введи своё имя" }, 400);
    const session = { role, name: role === "owner" ? ownerName(name) : name, exp: Date.now() + SESSION_DAYS * 86400000 };
    return json({ ok: true, me: { role, name: session.name } }, 200, { "set-cookie": makeCookie(session) });
  }
  // Приём новых клиентов со страницы 2ГИС (сборщик в браузере владельца). Доступ по ключу на час.
  if (path === "/import-rows") {
    const cors = { "access-control-allow-origin": "https://2gis.kz", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" };
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const [p, sig] = String(body.token || "").split(".");
    let ok = false;
    try { const good = Buffer.from(sign(p || "")), given = Buffer.from(sig || ""); ok = !!p && good.length === given.length && timingSafeEqual(good, given); const t = ok && JSON.parse(Buffer.from(p, "base64url").toString("utf8")); ok = ok && t.k === "imp" && t.exp > Date.now(); } catch { ok = false; }
    if (!ok) return json({ error: "token" }, 401, cors);
    const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 3000) : []).map(cleanRow).filter(Boolean);
    let added = 0;
    await mutate((s) => { added = addRows(s, rows); return added ? s : false; });
    return json({ ok: true, parsed: rows.length, added }, 200, cors);
  }
  if (path === "/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": "rs=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });

  const me = readSession(req);
  if (!me) return json({ error: "auth" }, 401);
  const isOwner = me.role === "owner", who = isOwner ? ownerName(me.name) : me.name;

  try {
    if (path === "/me" && method === "GET") { const { data } = await readState(); return json({ me: { role: me.role, name: who, dev: !isOwner && isDevName(data, who) } }); }

    if (path === "/state" && method === "GET") {
      let [{ data }, presence] = await Promise.all([readState(), readPresence()]);
      // Напомнили, а ответа нет полтора срока дожима: закрываем как «Не ответил», чтобы не висело.
      const limit = Date.now() - (data.settings.followupHours || 48) * 3600000 * 1.5;
      if (Object.values(data.contacts).some((c) => c.status === "followup" && (c.followAt || c.at || 0) < limit)) {
        data = await mutate((s) => {
          let changed = false;
          for (const c of Object.values(s.contacts)) {
            if (c.status === "followup" && (c.followAt || c.at || 0) < limit) { c.status = "noreply"; c.by = "авто"; c.at = Date.now(); s.events.push({ t: c.at, who: "авто", phone: c.phone, status: "noreply" }); changed = true; }
          }
          return changed ? s : false;
        });
      }
      const isDev = !isOwner && isDevName(data, who);
      const list = isOwner ? sorted(data) : sorted(data).map((c) => (c.deal && !(isDev && (!c.devBy || c.devBy === who)) ? { ...c, deal: { stage: c.deal.stage } } : c));
      return json({ me: { role: me.role, name: who, dev: isDev }, contacts: list, settings: data.settings, presence, events: isOwner ? data.events : [], seedError: isOwner ? data.seedError || null : null, now: Date.now() });
    }

    if (path === "/heartbeat" && method === "POST") {
      await store().setJSON("p/" + who, { t: Date.now(), role: me.role, visible: body.visible !== false });
      return json({ ok: true });
    }

    if (path === "/claim" && method === "POST") {
      const phone = normPhone(body.phone);
      await mutate((s) => { const c = s.contacts[phone]; if (!c) return false; c.claimedBy = who; c.claimedAt = Date.now(); return s; });
      return json({ ok: true });
    }

    if (path === "/status" && method === "POST") {
      const phone = normPhone(body.phone);
      const status = STATUSES.includes(body.status) ? body.status : null;
      if (!phone || !status) return json({ error: "bad" }, 400);
      const state = await mutate((s) => {
        const c = s.contacts[phone];
        if (!c) return false;
        const now = Date.now();
        c.status = status; c.by = who; c.at = now; c.claimedBy = null; c.claimedAt = null;
        if (status === "new") { c.sentBy = null; c.sentAt = null; c.followAt = null; }
        else if (!c.sentBy) { c.sentBy = who; c.sentAt = now; }
        if (status === "followup") c.followAt = now;
        s.events.push({ t: now, who, phone, status });
        return s;
      });
      return json({ ok: true, contact: state.contacts[phone] });
    }

    if (path === "/note" && method === "POST") {
      const phone = normPhone(body.phone);
      await mutate((s) => { const c = s.contacts[phone]; if (!c) return false; c.note = String(body.note || "").slice(0, 300); return s; });
      return json({ ok: true });
    }

    if (path === "/lang" && method === "POST") {
      const phone = normPhone(body.phone), lang = LANGS.includes(body.lang) ? body.lang : "ru";
      await mutate((s) => { const c = s.contacts[phone]; if (!c) return false; c.lang = lang; return s; });
      return json({ ok: true });
    }

    if (path === "/dev" && method === "POST") {
      const phone = normPhone(body.phone);
      if (!phone) return json({ error: "phone" }, 400);
      let err = null;
      const state = await mutate((s) => {
        const c = s.contacts[phone];
        if (!c) return false;
        if (!isOwner && !isDevName(s, who)) { err = [403, "Это может только разработчик"]; return false; }
        if (!isOwner && c.devBy && c.devBy !== who) { err = [409, `Этого клиента уже ведёт ${c.devBy}`]; return false; }
        c.devAt = Date.now(); c.devBy = who;
        if (!c.deal) c.deal = { stage: "talk", at: { talk: c.devAt }, pkg: "", act: false, price: 0, paid: 0, link: "" };
        s.events.push({ t: c.devAt, who, phone, status: "dev" });
        return s;
      });
      if (err) return json({ error: "forbidden", message: err[1] }, err[0]);
      if (!state.contacts[phone]) return json({ error: "not found" }, 404);
      return json({ ok: true, contact: state.contacts[phone] });
    }

    if (path === "/deal" && method === "POST") {
      const phone = normPhone(body.phone);
      if (!phone) return json({ error: "phone" }, 400);
      if (body.stage !== undefined && !DEAL_STAGES.includes(body.stage)) return json({ error: "stage" }, 400);
      let err = null;
      const state = await mutate((s) => {
        const c = s.contacts[phone];
        if (!c) return false;
        if (!isOwner && !isDevName(s, who)) { err = [403, "Это может только разработчик"]; return false; }
        if (!isOwner && c.devBy && c.devBy !== who) { err = [409, `Этого клиента уже ведёт ${c.devBy}`]; return false; }
        if (!c.devBy) c.devBy = who;
        const now = Date.now();
        const d = (c.deal ||= { stage: "talk", at: { talk: c.devAt || now }, pkg: "", act: false, price: 0, paid: 0, link: "" });
        d.at ||= {};
        if (body.stage !== undefined && body.stage !== d.stage) {
          if (d.stage !== "lost") d.prev = d.stage;
          d.stage = body.stage; d.at[body.stage] = now;
          s.events.push({ t: now, who, phone, status: "deal_" + body.stage });
        }
        if (body.pkg !== undefined) d.pkg = String(body.pkg || "").slice(0, 40);
        if (body.act !== undefined) d.act = !!body.act;
        if (body.price !== undefined) d.price = money(body.price);
        if (body.paid !== undefined) d.paid = money(body.paid);
        if (body.link !== undefined) { const l = String(body.link || "").trim().slice(0, 300); d.link = !l || /^https?:\/\//i.test(l) ? l : "https://" + l; }
        d.by = who; d.upd = now;
        return s;
      });
      if (err) return json({ error: "forbidden", message: err[1] }, err[0]);
      if (!state.contacts[phone]) return json({ error: "not found" }, 404);
      return json({ ok: true, contact: state.contacts[phone] });
    }

    if (!isOwner) return json({ error: "forbidden" }, 403);

    if (path === "/import" && method === "POST") {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 3000).map(cleanRow).filter(Boolean) : parseCsv(body.csv);
      let added = 0;
      await mutate((s) => { added = addRows(s, rows); return added ? s : false; });
      return json({ ok: true, parsed: rows.length, added });
    }

    if (path === "/import-token" && method === "GET") {
      const p = Buffer.from(JSON.stringify({ k: "imp", exp: Date.now() + 3600000 })).toString("base64url");
      return json({ token: p + "." + sign(p) });
    }

    if (path === "/tier" && method === "POST") {
      const phone = normPhone(body.phone), tier = ["big", "mid", "small"].includes(body.tier) ? body.tier : "";
      const state = await mutate((s) => { const c = s.contacts[phone]; if (!c) return false; c.tier = tier; return s; });
      return json({ ok: true, contact: state.contacts[phone] || null });
    }

    if (path === "/remove" && method === "POST") {
      const phone = normPhone(body.phone);
      await mutate((s) => { if (!s.contacts[phone]) return false; delete s.contacts[phone]; return s; });
      return json({ ok: true });
    }

    if (path === "/settings" && method === "POST") {
      await mutate((s) => {
        const t = body.templates || {}, h = body.hooks || {}, cur = s.settings;
        const pick = (v, old) => (String(v || "").trim() || old).slice(0, 1500);
        s.settings = {
          dailyPlan: Math.max(1, parseInt(body.dailyPlan) || cur.dailyPlan),
          devs: Array.isArray(body.devs) ? [...new Set(body.devs.map((x) => str(x, 40)).filter(Boolean))].slice(0, 30) : cur.devs || [],
          autoSent: body.autoSent === undefined ? cur.autoSent : !!body.autoSent,
          followupHours: Math.max(1, parseInt(body.followupHours) || cur.followupHours),
          templates: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templates).map((k) => [k, pick(t[k], cur.templates[k])])),
          hooks: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.hooks).map((k) => [k, pick(h[k], cur.hooks[k])])),
          templatesKz: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templatesKz).map((k) => [k, pick((body.templatesKz || {})[k], cur.templatesKz[k])])),
          hooksKz: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.hooksKz).map((k) => [k, pick((body.hooksKz || {})[k], cur.hooksKz[k])])),
          templatesDev: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templatesDev).map((k) => [k, pick((body.templatesDev || {})[k], cur.templatesDev[k])])),
          templatesDevKz: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templatesDevKz).map((k) => [k, pick((body.templatesDevKz || {})[k], cur.templatesDevKz[k])])),
          templatesDeal: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templatesDeal).map((k) => [k, pick((body.templatesDeal || {})[k], cur.templatesDeal[k])])),
          templatesDealKz: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templatesDealKz).map((k) => [k, pick((body.templatesDealKz || {})[k], cur.templatesDealKz[k])])),
          packages: Array.isArray(body.packages) && cleanPackages(body.packages).length ? cleanPackages(body.packages) : cur.packages,
          examples: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.examples).map((k) => [k, body.examples && body.examples[k] !== undefined ? str(body.examples[k], 300) : (cur.examples || {})[k] || ""])),
          scripts: Array.isArray(body.scripts) ? body.scripts.filter((x) => x && x.title).slice(0, 60).map((x) => ({ niche: ["furniture", "massage"].includes(x.niche) ? x.niche : "", title: String(x.title).slice(0, 60), ru: String(x.ru || "").slice(0, 1500), kz: String(x.kz || "").slice(0, 1500) })) : cur.scripts,
        };
        return s;
      });
      return json({ ok: true });
    }

    if (path === "/export" && method === "GET") {
      const { data } = await readState();
      const lines = ["Название;Телефон;Ниша;Адрес;Язык;Рейтинг;Отзывы;Instagram;Часы;Статус;Кто отметил;Когда (Алматы);Кто написал первым;Когда написал;Напомнил;Разработчик написал;Этап разработки;Пакет;Цена;Оплачено;Осталось;Ссылка на сайт;Уровень;Филиалов;Ведёт разработчик;Заметка"];
      const tiers = rankTiers(Object.values(data.contacts));
      for (const c of sorted(data)) {
        lines.push([c.name, "+" + c.phone, c.niche, c.address, c.lang === "kz" ? "KZ" : "RU", c.rating, c.reviews || "", c.instagram, c.hours, LABEL[c.status || "new"], c.by || "", c.status !== "new" ? fmtAlmaty(c.at) : "", c.sentBy || "", fmtAlmaty(c.sentAt), fmtAlmaty(c.followAt), c.devAt ? fmtAlmaty(c.devAt) + " (" + (c.devBy || "") + ")" : "", c.deal ? DEAL_LABEL[c.deal.stage] || "" : "", c.deal?.pkg ? c.deal.pkg + (c.deal.act ? " + активация" : "") : "", c.deal?.price || "", c.deal?.paid || "", c.deal && c.deal.stage !== "lost" && c.deal.price ? Math.max(0, c.deal.price - (c.deal.paid || 0)) : "", c.deal?.link || "", TIER_LABEL[tierOf(c, tiers)], c.branches || "", c.devBy || "", c.note || ""].map(csvCell).join(";"));
      }
      return new Response("﻿" + lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="rassylka-damillion.csv"', "cache-control": "no-store" } });
    }

    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "server", message: e.message === "busy" ? "Занято, нажми ещё раз" : "Ошибка сервера" }, 500);
  }
};

export const config = { path: "/api/*" };
