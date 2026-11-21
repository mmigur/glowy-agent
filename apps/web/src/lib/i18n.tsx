import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { supabase } from "./supabase";

export type Locale = "en" | "ru";

type Localized<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly (infer U)[]
      ? readonly Localized<U>[]
      : T extends object
        ? { [K in keyof T]: Localized<T[K]> }
        : T;

const en = {
  lang: { label: "Language", en: "English", ru: "Russian" },
  nav: {
    today: "Today",
    calendar: "Calendar",
    analytics: "Analytics",
    settings: "Settings",
    signOut: "Sign out",
    home: "Home",
    main: "Main",
  },
  landing: {
    demo: "Demo",
    how: "How it works",
    limits: "Limits",
    pricing: "Pricing",
    signIn: "Sign in",
    getStarted: "Get started",
    eyebrow: "For founders on X and Threads",
    heroTitle: "Stay active online without living there.",
    heroBody:
      "Ten minutes of setup. Then an agent studies what works in your niche every day, drafts posts in your voice, and keeps your calendar full. You stay in control of what gets published.",
    trial: "{days} days free, then ${price}/month.",
    exampleLabel: "Example of an agent draft",
    draftMeta: "Draft · Threads",
    example: "Example",
    exampleText:
      "We spent six months building features nobody asked for. The fix took one afternoon: we called five users. Here is the three-question script we used.",
    pattern: "Pattern",
    patternValue: "Mistake, then lesson, then script",
    why: "Why this",
    whyValue: "Short first-person lessons with a concrete takeaway beat the niche median this week.",
    suggestedTime: "Suggested time",
    suggestedTimeValue: "Tue 09:30, your timezone",
    confidence: "Confidence",
    confidenceValue: "Medium · 14 posts",
    schedule: "Schedule",
    edit: "Edit",
    reject: "Reject",
    caption: "An illustration of the output format, not real data.",
    howTitle: "How it works",
    limitsTitle: "What it will not do",
    limitsIntro: "The platforms set the rules. We would rather tell you the limits up front.",
    pricingTitle: "Pricing",
    trialName: "Free trial",
    trialPriceNote: "for {days} days",
    trialBody: "Full access to everything in Pro. Cancel before the trial ends and you pay nothing.",
    pro: "Pro",
    afterTrial: "After trial",
    perMonth: "/ month",
    footerApi: "Works through the official X and Threads APIs.",
    steps: {
      connect: {
        title: "Connect",
        body: "Link your X and Threads accounts through the official authorization flow. Tokens stay on the server.",
      },
      setup: {
        title: "Set up in minutes",
        body: "Seven short questions: what you do, what you write about, your tone, your goals. Skip any of them.",
      },
      research: {
        title: "The agent researches",
        body: "Each day it studies which posts outperform in your niche, and why: hooks, structure, length, timing.",
      },
      publish: {
        title: "You review, it publishes",
        body: "Drafts arrive with a reason and a suggested time. Approve, edit or reject. Nothing goes out without your rules.",
      },
    },
    limitItems: [
      "No auto-replies, auto-likes or auto-follows. They break X's automation rules.",
      "No scraping. The agent works only through official APIs, so some numbers are simply not available.",
      "Metrics the platform does not provide are shown as unavailable, never estimated.",
      "No promise of follower growth. Each pattern shows how much data stands behind it.",
    ],
    proFeatures: [
      "Daily niche research on X and Threads",
      "Drafts in your voice, with the reasoning",
      "Scheduling and a publishing calendar",
      "Analytics for your own posts",
      "A strategy that adapts to your results",
    ],
  },
  settings: {
    title: "Settings",
    account: "Account",
    appearance: "Appearance",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    language: "Language",
    languageHint: "English or Russian across the whole app and the landing page.",
    strategy: "Content strategy",
    strategyHint: "Answers from the setup questions. The agent uses them to choose topics and tone.",
    loading: "Loading…",
    editAnswers: "Edit answers",
    answerQuestions: "Answer the questions",
    connections: "Connections",
    connectionsHint: "Accounts the agent publishes to. Connecting uses the official authorization flow.",
    subscription: "Subscription",
    billing: "Billing not connected",
    price: "${price}/month after a {days}-day free trial.",
  },
  calendar: {
    title: "Calendar",
    description: "Scheduled, published and draft posts in one place.",
    statuses: "Statuses",
    draft: "Draft",
    scheduled: "Scheduled",
    publishing: "Publishing",
    published: "Published",
    failed: "Failed",
    emptyTitle: "Nothing in this view",
    emptyFiltered: "No posts with the selected statuses. Turn a status back on to see them.",
    emptyAll: "Scheduled posts show up on their publishing day.",
    loading: "Loading…",
    loadError: "Could not load the calendar.",
    prev: "Previous month",
    next: "Next month",
    today: "Today",
    noText: "Post text is unavailable.",
    failedPrefix: "Failed",
  },
  thread: {
    ready: "Ready",
    scheduled: "Scheduled",
    published: "Published",
    sourceNotes: {
      public_search: "Based on top-ranked public posts in your topics compared with recent ones.",
      own_posts: "Public search is not available yet, so this uses your own posts.",
      none: "No research data yet: these drafts come from your setup answers only.",
    },
    timeNotes: {
      own_posts: "Time chosen from when your own best posts went out.",
      research: "Time chosen from when top posts in your topics were published.",
      default: "Not enough data yet, so this is a typical high-activity window.",
    },
    postText: "Post text",
    fillIn: "Fill in",
    viral: "Make it more viral with live content",
    publishAt: "Publish at",
    scheduling: "Scheduling…",
    schedule: "Schedule this post",
    goesOut: "Goes out {when} unless you change it in Calendar.",
    sourcesLabel: "Source posts",
    sourcesShow: "Based on {count}",
    sourcesEmpty: "Source posts were not saved for this run. New suggestions will list them.",
    openThreads: "Open in Threads",
    postOne: "post",
    postFew: "posts",
    postMany: "posts",
    anonymous: "Threads post",
    own: "Your post",
    public: "Public post",
  },
} as const;

const ru: Localized<typeof en> = {
  lang: { label: "Язык", en: "English", ru: "Русский" },
  nav: {
    today: "Сегодня",
    calendar: "Календарь",
    analytics: "Аналитика",
    settings: "Настройки",
    signOut: "Выйти",
    home: "На главную",
    main: "Разделы",
  },
  landing: {
    demo: "Демо",
    how: "Как это работает",
    limits: "Ограничения",
    pricing: "Цена",
    signIn: "Войти",
    getStarted: "Начать",
    eyebrow: "Для основателей в X и Threads",
    heroTitle: "Будьте на виду, не живя в ленте.",
    heroBody:
      "Десять минут на настройку. Дальше агент каждый день разбирает, что работает в вашей нише, пишет черновики вашим голосом и держит календарь заполненным. Наружу уходит только то, что вы разрешили.",
    trial: "{days} дней бесплатно, затем ${price}/месяц.",
    exampleLabel: "Пример черновика агента",
    draftMeta: "Черновик · Threads",
    example: "Пример",
    exampleText:
      "Шесть месяцев мы делали функции, которые никто не просил. Исправление заняло один день: позвонили пяти пользователям. Вот скрипт из трёх вопросов.",
    pattern: "Приём",
    patternValue: "Ошибка, урок, затем скрипт",
    why: "Почему так",
    whyValue: "Короткие уроки от первого лица с конкретным выводом на этой неделе обгоняют медиану ниши.",
    suggestedTime: "Время",
    suggestedTimeValue: "Вт 09:30, ваш часовой пояс",
    confidence: "Уверенность",
    confidenceValue: "Средняя · 14 постов",
    schedule: "Запланировать",
    edit: "Править",
    reject: "Отклонить",
    caption: "Иллюстрация формата, не реальные данные.",
    howTitle: "Как это работает",
    limitsTitle: "Чего он не делает",
    limitsIntro: "Правила задают площадки. Лучше сказать об ограничениях сразу.",
    pricingTitle: "Цена",
    trialName: "Пробный период",
    trialPriceNote: "{days} дней",
    trialBody: "Полный доступ ко всему, что есть в Pro. Отмените до конца пробного периода — и ничего не спишется.",
    pro: "Pro",
    afterTrial: "После пробного",
    perMonth: "/ месяц",
    footerApi: "Работает через официальные API X и Threads.",
    steps: {
      connect: {
        title: "Подключите",
        body: "Привяжите X и Threads через официальную авторизацию. Токены остаются на сервере.",
      },
      setup: {
        title: "Настройка за минуты",
        body: "Семь коротких вопросов: чем вы занимаетесь, о чём пишете, тон и цели. Любой можно пропустить.",
      },
      research: {
        title: "Агент изучает нишу",
        body: "Каждый день смотрит, какие посты заходят и почему: заходы, структура, длина, время.",
      },
      publish: {
        title: "Вы смотрите, он публикует",
        body: "Черновики приходят с причиной и предложенным временем. Одобряйте, правьте или отклоняйте. Без ваших правил ничего не уходит.",
      },
    },
    limitItems: [
      "Нет автоответов, автолайков и автоподписок. Это нарушает правила автоматизации X.",
      "Нет скрейпинга. Агент работает только через официальные API, поэтому части цифр просто нет.",
      "Метрики, которые площадка не отдаёт, показываются как недоступные, а не как оценка.",
      "Нет обещания роста подписчиков. У каждого приёма видно, на каком объёме данных он держится.",
    ],
    proFeatures: [
      "Ежедневное исследование ниши в X и Threads",
      "Черновики вашим голосом и с объяснением",
      "Планирование и календарь публикаций",
      "Аналитика ваших постов",
      "Стратегия, которая подстраивается под результаты",
    ],
  },
  settings: {
    title: "Настройки",
    account: "Аккаунт",
    appearance: "Оформление",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    language: "Язык",
    languageHint: "Русский или английский на всём сайте и в приложении.",
    strategy: "Стратегия контента",
    strategyHint: "Ответы из настройки. Агент опирается на них, когда выбирает темы и тон.",
    loading: "Загрузка…",
    editAnswers: "Изменить ответы",
    answerQuestions: "Ответить на вопросы",
    connections: "Подключения",
    connectionsHint: "Аккаунты, куда агент публикует. Подключение идёт через официальную авторизацию.",
    subscription: "Подписка",
    billing: "Оплата не подключена",
    price: "${price}/месяц после {days} бесплатных дней.",
  },
  calendar: {
    title: "Календарь",
    description: "Запланированные, опубликованные и черновики в одном месте.",
    statuses: "Статусы",
    draft: "Черновик",
    scheduled: "Запланирован",
    publishing: "Публикуется",
    published: "Опубликован",
    failed: "Ошибка",
    emptyTitle: "В этом виде пусто",
    emptyFiltered: "Нет постов с выбранными статусами. Включите статус снова, чтобы увидеть их.",
    emptyAll: "Запланированные посты появляются в день публикации.",
    loading: "Загрузка…",
    loadError: "Не удалось загрузить календарь.",
    prev: "Предыдущий месяц",
    next: "Следующий месяц",
    today: "Сегодня",
    noText: "Текст поста недоступен.",
    failedPrefix: "Ошибка",
  },
  thread: {
    ready: "Готово",
    scheduled: "Запланирован",
    published: "Опубликован",
    sourceNotes: {
      public_search: "Опора на топовые публичные посты по вашим темам в сравнении с недавними.",
      own_posts: "Публичный поиск пока недоступен, поэтому используются ваши посты.",
      none: "Данных исследования ещё нет: черновики собраны только из ответов настройки.",
    },
    timeNotes: {
      own_posts: "Время выбрано по тому, когда выходили ваши лучшие посты.",
      research: "Время выбрано по тому, когда публиковались топовые посты по вашим темам.",
      default: "Данных пока мало, поэтому это обычное окно высокой активности.",
    },
    postText: "Текст поста",
    fillIn: "Заполните",
    viral: "Сделать вируснее за счёт живого контента",
    publishAt: "Опубликовать",
    scheduling: "Планируем…",
    schedule: "Запланировать этот пост",
    goesOut: "Выйдет {when}, если не изменить время в календаре.",
    sourcesLabel: "Исходные посты",
    sourcesShow: "На основе {count}",
    sourcesEmpty: "Для этого прогона исходные посты не сохранились. У новых вариантов список появится.",
    openThreads: "Открыть в Threads",
    postOne: "пост",
    postFew: "поста",
    postMany: "постов",
    anonymous: "Пост в Threads",
    own: "Ваш пост",
    public: "Публичный пост",
  },
};

export const messages: Record<Locale, Localized<typeof en>> = { en, ru };

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

const STORAGE_KEY = "locale";

function readStorage(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ru") return stored;
  } catch {
    // localStorage может быть недоступен
  }
  return null;
}

function initialLocale(): Locale {
  return readStorage() ?? (navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en");
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const touched = useRef(false);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // см. выше
    }
  }, [locale]);

  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true;
    void supabase
      .from("profiles")
      .select("locale")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || touched.current) return;
        const remote = data?.locale === "en" || data?.locale === "ru" ? data.locale : null;
        const stored = readStorage();
        if (stored) {
          if (remote !== stored) void supabase!.from("profiles").update({ locale: stored }).eq("id", userId);
          return;
        }
        if (remote) setLocaleState(remote);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const setLocale = useCallback(
    (next: Locale) => {
      touched.current = true;
      setLocaleState(next);
      if (userId && supabase) void supabase.from("profiles").update({ locale: next }).eq("id", userId);
    },
    [userId],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}

export function useI18n() {
  const api = useLocale();
  return { ...api, m: messages[api.locale] };
}
