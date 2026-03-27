import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const supportedLocales = ["ru", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export type Messages = {
  documentTitle: string;
  add: string;
  recenter: string;
  backToBoard: string;
  animalListTitle: string;
  animalSearchLabel: string;
  animalSearchPlaceholder: string;
  animalListEmpty: string;
  help: string;
  helpTitle: string;
  helpItems: string[];
  localeLabel: string;
  legendMale: string;
  legendFemale: string;
  createAnimalTitle: string;
  editAnimalTitle: string;
  modalDescription: string;
  close: string;
  name: string;
  namePlaceholder: string;
  gender: string;
  genderMale: string;
  genderFemale: string;
  genderLockedHint: string;
  father: string;
  fatherPlaceholder: string;
  mother: string;
  motherPlaceholder: string;
  birthDate: string;
  breedingStatus: string;
  breedingApproved: string;
  breedingRestricted: string;
  breedingStatusHint: string;
  breedingSelectableHint: string;
  delete: string;
  confirmDeleteTitle: string;
  confirmDeleteDescription: string;
  confirmDeleteAction: string;
  cancel: string;
  save: string;
  profileAutosaveError: string;
  openProfile: string;
  noDate: string;
  profileGeneralTab: string;
  profileKiddingTab: string;
  profileVaccinesTab: string;
  profileGeneralDescription: string;
  profileKiddingDescription: string;
  profileKiddingStatusLabel: string;
  profileKiddingStatusOpen: string;
  profileKiddingStatusExposed: string;
  profileKiddingStatusConfirmed: string;
  profileKiddingDateLabel: string;
  profileKiddingDateRequired: string;
  profileKiddingFutureDateError: string;
  profileKiddingExpectedDateTitle: string;
  profileKiddingCountdownTitle: string;
  profileKiddingCurrentDayTitle: string;
  profileKiddingNoActiveTitle: string;
  profileKiddingNoActiveDescription: string;
  profileKiddingCountdownRemaining: (value: number) => string;
  profileKiddingCountdownToday: string;
  profileKiddingCountdownOverdue: (value: number) => string;
  profileKiddingPregnancyDay: (value: number) => string;
  profileKiddingMarkCompleted: string;
  profileVaccinesDescription: string;
  profileVaccinesLastDate: string;
  profileVaccinesChooseDate: string;
  profileVaccinesNextDate: string;
  profileVaccinesInterval: string;
  profileVaccinesTiming: string;
  profileVaccinesCoreBadge: string;
  profileVaccinesRiskBadge: string;
  profileVaccinesStatusMissing: string;
  profileVaccinesStatusCurrent: string;
  profileVaccinesStatusDueSoon: string;
  profileVaccinesStatusOverdue: string;
  profileNotFoundTitle: string;
  profileNotFoundDescription: string;
  generation: (value: number) => string;
  relatedParentsHighRiskTitle: string;
  relatedParentsMediumRiskTitle: string;
  relatedParentsRiskDescription: (value: string) => string;
  relationDirectParentChild: string;
  relationDirectGrandparent: string;
  relationDirectAncestor: string;
  relationFullSiblings: string;
  relationHalfSiblings: string;
  relationAuntUncle: string;
  relationFirstCousins: string;
  errorOwnFather: string;
  errorOwnMother: string;
  errorParentsMatch: string;
  errorFatherDescendant: string;
  errorMotherDescendant: string;
  errorNameRequired: string;
  errorNameTooLong: string;
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  messages: Messages;
  formatDate: (value: string) => string;
};

const STORAGE_KEY = "animal-generation-locale";

const localeMeta: Record<Locale, { tag: string; buttonLabel: string; icon: string }> = {
  ru: {
    tag: "ru-RU",
    buttonLabel: "Russian",
    icon: "🇷🇺"
  },
  en: {
    tag: "en-US",
    buttonLabel: "English",
    icon: "🇺🇸"
  }
};

export const localeOptions = supportedLocales.map((locale) => ({
  value: locale,
  label: localeMeta[locale].buttonLabel,
  icon: localeMeta[locale].icon
}));

const messagesByLocale: Record<Locale, Messages> = {
  ru: {
    documentTitle: "Animal Generations",
    add: "Добавить",
    recenter: "Вернуться в центр",
    backToBoard: "Назад к схеме",
    animalListTitle: "Животные",
    animalSearchLabel: "Поиск животных",
    animalSearchPlaceholder: "Найти по имени",
    animalListEmpty: "Ничего не найдено",
    help: "Подсказки",
    helpTitle: "Как пользоваться полем",
    helpItems: [
      "Левый клик по животному с допуском к разведению выбирает родителя по полу.",
      "Кнопка с карандашом в правом нижнем углу ячейки открывает профиль животного.",
      "Клик по пустому месту сбрасывает текущий выбор родителей.",
      "Пустое место можно перетаскивать, чтобы двигать поле.",
      "Колесо мыши меняет масштаб."
    ],
    localeLabel: "Язык",
    legendMale: "Мальчик",
    legendFemale: "Девочка",
    createAnimalTitle: "Новое животное",
    editAnimalTitle: "Редактирование животного",
    modalDescription: "Заполните базовые данные и родительские связи.",
    close: "Закрыть",
    name: "Имя",
    namePlaceholder: "Например, Луна",
    gender: "Пол",
    genderMale: "Мальчик",
    genderFemale: "Девочка",
    genderLockedHint: "Пол нельзя изменить, пока это животное связано с потомками. Сначала отвяжите его от потомков.",
    father: "Отец",
    fatherPlaceholder: "Не выбран",
    mother: "Мать",
    motherPlaceholder: "Не выбрана",
    birthDate: "Дата рождения",
    breedingStatus: "Племенной статус",
    breedingApproved: "Допущено к разведению",
    breedingRestricted: "Вне разведения",
    breedingStatusHint: "Животные вне разведения на канвасе приглушены и не выбираются кликом в качестве родителя.",
    breedingSelectableHint: "В списках родителей доступны только животные с допуском к разведению.",
    delete: "Удалить",
    confirmDeleteTitle: "Удалить животное?",
    confirmDeleteDescription: "Узел будет удален, а у потомков очистятся связи с этим родителем.",
    confirmDeleteAction: "Да, удалить",
    cancel: "Отмена",
    save: "Сохранить",
    profileAutosaveError: "Не удалось сохранить изменения",
    openProfile: "Профиль",
    noDate: "Без даты",
    profileGeneralTab: "Общее",
    profileKiddingTab: "Окоты",
    profileVaccinesTab: "Прививки",
    profileGeneralDescription: "Базовые данные животного.",
    profileKiddingDescription: "Отмечайте покрытие и смотрите, когда ориентировочно ждать окот.",
    profileKiddingStatusLabel: "Репродуктивный статус",
    profileKiddingStatusOpen: "Не покрыта",
    profileKiddingStatusExposed: "После случки",
    profileKiddingStatusConfirmed: "Беременность подтверждена",
    profileKiddingDateLabel: "Дата случки / осеменения",
    profileKiddingDateRequired: "Укажите дату случки или осеменения.",
    profileKiddingFutureDateError: "Дата случки не может быть позже сегодняшнего дня.",
    profileKiddingExpectedDateTitle: "Ориентировочный окот",
    profileKiddingCountdownTitle: "До окота",
    profileKiddingCurrentDayTitle: "Текущий день",
    profileKiddingNoActiveTitle: "Активной беременности нет",
    profileKiddingNoActiveDescription: "Когда самка будет покрыта, достаточно выбрать статус и указать дату. Дальше срок посчитается сам.",
    profileKiddingCountdownRemaining: (value) => `Осталось ${value} дн.`,
    profileKiddingCountdownToday: "Ожидается сегодня",
    profileKiddingCountdownOverdue: (value) => `Срок прошёл ${value} дн. назад`,
    profileKiddingPregnancyDay: (value) => `${value}-й день`,
    profileKiddingMarkCompleted: "Отметить окот",
    profileVaccinesDescription: "Базовый календарь прививок для овец и коз с автоматическим расчётом следующей даты.",
    profileVaccinesLastDate: "Последняя прививка",
    profileVaccinesChooseDate: "Выбирите дату",
    profileVaccinesNextDate: "Следующая дата",
    profileVaccinesInterval: "Интервал",
    profileVaccinesTiming: "Когда обычно делают",
    profileVaccinesCoreBadge: "Базовая",
    profileVaccinesRiskBadge: "По показаниям",
    profileVaccinesStatusMissing: "Нет даты",
    profileVaccinesStatusCurrent: "В графике",
    profileVaccinesStatusDueSoon: "Скоро",
    profileVaccinesStatusOverdue: "Просрочена",
    profileNotFoundTitle: "Животное не найдено",
    profileNotFoundDescription: "Похоже, карточка была удалена или ссылка устарела.",
    generation: (value) => `Поколение ${value}`,
    relatedParentsHighRiskTitle: "Высокий риск",
    relatedParentsMediumRiskTitle: "Средний риск",
    relatedParentsRiskDescription: (value) => `${value}.`,
    relationDirectParentChild: "родитель и потомок",
    relationDirectGrandparent: "дед/бабка и внук/внучка",
    relationDirectAncestor: "прямые предки одной линии",
    relationFullSiblings: "полные брат и сестра",
    relationHalfSiblings: "неполнородные брат и сестра",
    relationAuntUncle: "дядя/тётя и племянник/племянница",
    relationFirstCousins: "двоюродные родственники",
    errorOwnFather: "Животное не может быть своим собственным отцом.",
    errorOwnMother: "Животное не может быть своей собственной матерью.",
    errorParentsMatch: "Отец и мать должны быть разными животными.",
    errorFatherDescendant: "Нельзя выбрать в отцы собственного потомка.",
    errorMotherDescendant: "Нельзя выбрать в матери собственного потомка.",
    errorNameRequired: "Укажите имя животного.",
    errorNameTooLong: "Имя не должно быть длиннее 20 символов."
  },
  en: {
    documentTitle: "Animal Generations",
    add: "Add",
    recenter: "Back to center",
    backToBoard: "Back to board",
    animalListTitle: "Animals",
    animalSearchLabel: "Search animals",
    animalSearchPlaceholder: "Find by name",
    animalListEmpty: "No matches found",
    help: "Help",
    helpTitle: "How to use the board",
    helpItems: [
      "Left-click an animal approved for breeding to choose a parent based on its gender.",
      "Use the pencil button in the card's bottom-right corner to open the animal profile.",
      "Click empty space to clear the current parent selection.",
      "Drag empty space to move around the board.",
      "Use the mouse wheel to zoom."
    ],
    localeLabel: "Language",
    legendMale: "Boy",
    legendFemale: "Girl",
    createAnimalTitle: "New animal",
    editAnimalTitle: "Edit animal",
    modalDescription: "Fill in the core data and parent relationships.",
    close: "Close",
    name: "Name",
    namePlaceholder: "For example, Luna",
    gender: "Gender",
    genderMale: "Boy",
    genderFemale: "Girl",
    genderLockedHint: "Gender cannot be changed while this animal is linked to descendants. Detach it from its descendants first.",
    father: "Father",
    fatherPlaceholder: "Not selected",
    mother: "Mother",
    motherPlaceholder: "Not selected",
    birthDate: "Birth date",
    breedingStatus: "Breeding status",
    breedingApproved: "Approved for breeding",
    breedingRestricted: "Out of breeding",
    breedingStatusHint: "Animals that are out of breeding appear muted on the board and cannot be picked as parents by click.",
    breedingSelectableHint: "Only animals approved for breeding are available in the parent lists.",
    delete: "Delete",
    confirmDeleteTitle: "Delete animal?",
    confirmDeleteDescription: "The node will be removed and descendants will lose the link to this parent.",
    confirmDeleteAction: "Yes, delete",
    cancel: "Cancel",
    save: "Save",
    profileAutosaveError: "Failed to save changes",
    openProfile: "Profile",
    noDate: "No date",
    profileGeneralTab: "General",
    profileKiddingTab: "Kidding",
    profileVaccinesTab: "Vaccines",
    profileGeneralDescription: "Core animal data.",
    profileKiddingDescription: "Track breeding status and see when kidding is roughly due.",
    profileKiddingStatusLabel: "Breeding status",
    profileKiddingStatusOpen: "Open",
    profileKiddingStatusExposed: "Bred",
    profileKiddingStatusConfirmed: "Pregnancy confirmed",
    profileKiddingDateLabel: "Breeding / insemination date",
    profileKiddingDateRequired: "Enter the breeding or insemination date.",
    profileKiddingFutureDateError: "Breeding date cannot be later than today.",
    profileKiddingExpectedDateTitle: "Expected kidding",
    profileKiddingCountdownTitle: "Time remaining",
    profileKiddingCurrentDayTitle: "Current day",
    profileKiddingNoActiveTitle: "No active pregnancy",
    profileKiddingNoActiveDescription: "Once the doe is bred, set the status and breeding date. The expected kidding date will be calculated automatically.",
    profileKiddingCountdownRemaining: (value) => `${value} days left`,
    profileKiddingCountdownToday: "Expected today",
    profileKiddingCountdownOverdue: (value) => `${value} days overdue`,
    profileKiddingPregnancyDay: (value) => `Day ${value}`,
    profileKiddingMarkCompleted: "Mark kidding",
    profileVaccinesDescription: "Baseline sheep and goat vaccine planner with automatic next-date calculation.",
    profileVaccinesLastDate: "Last vaccination",
    profileVaccinesChooseDate: "Pick a date",
    profileVaccinesNextDate: "Next date",
    profileVaccinesInterval: "Interval",
    profileVaccinesTiming: "Typical timing",
    profileVaccinesCoreBadge: "Core",
    profileVaccinesRiskBadge: "Risk-based",
    profileVaccinesStatusMissing: "No date",
    profileVaccinesStatusCurrent: "On track",
    profileVaccinesStatusDueSoon: "Soon",
    profileVaccinesStatusOverdue: "Overdue",
    profileNotFoundTitle: "Animal not found",
    profileNotFoundDescription: "This card may have been deleted or the link is outdated.",
    generation: (value) => `Generation ${value}`,
    relatedParentsHighRiskTitle: "High risk",
    relatedParentsMediumRiskTitle: "Medium risk",
    relatedParentsRiskDescription: (value) => `${value}.`,
    relationDirectParentChild: "parent and offspring",
    relationDirectGrandparent: "grandparent and grandchild",
    relationDirectAncestor: "direct ancestors from the same line",
    relationFullSiblings: "full siblings",
    relationHalfSiblings: "half-siblings",
    relationAuntUncle: "aunt or uncle with niece or nephew",
    relationFirstCousins: "first cousins",
    errorOwnFather: "An animal cannot be its own father.",
    errorOwnMother: "An animal cannot be its own mother.",
    errorParentsMatch: "Father and mother must be different animals.",
    errorFatherDescendant: "A descendant cannot be selected as the father.",
    errorMotherDescendant: "A descendant cannot be selected as the mother.",
    errorNameRequired: "Please enter an animal name.",
    errorNameTooLong: "Name must be 20 characters or fewer."
  }
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isSupportedLocale(value: string | null | undefined): value is Locale {
  return Boolean(value) && supportedLocales.includes(value as Locale);
}

function resolveInitialLocale(): Locale {
  const storedLocale = window.localStorage.getItem(STORAGE_KEY);
  if (isSupportedLocale(storedLocale)) {
    return storedLocale;
  }

  const browserLocales = window.navigator.languages.length > 0 ? window.navigator.languages : [window.navigator.language];
  const match = browserLocales
    .map((locale) => locale.toLowerCase().split("-")[0])
    .find((locale): locale is Locale => isSupportedLocale(locale));

  return match ?? "ru";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());

  const setLocale = useCallback((value: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    setLocaleState(value);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messagesByLocale[locale].documentTitle;
  }, [locale, setLocale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = messagesByLocale[locale];

    return {
      locale,
      setLocale,
      messages,
      formatDate: (value: string) => {
        if (!value) {
          return messages.noDate;
        }

        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(year, (month || 1) - 1, day || 1);

        return new Intl.DateTimeFormat(localeMeta[locale].tag, {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }).format(date);
      }
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
