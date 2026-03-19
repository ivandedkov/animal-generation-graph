import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

export const supportedLocales = ["ru", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

type Messages = {
  documentTitle: string;
  add: string;
  recenter: string;
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
  delete: string;
  confirmDeleteTitle: string;
  confirmDeleteDescription: string;
  confirmDeleteAction: string;
  cancel: string;
  save: string;
  noDate: string;
  generation: (value: number) => string;
  errorOwnFather: string;
  errorOwnMother: string;
  errorParentsMatch: string;
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
    help: "Подсказки",
    helpTitle: "Как пользоваться полем",
    helpItems: [
      "Левый клик по животному выбирает родителя по полу.",
      "Шестеренка в правом нижнем углу ячейки открывает редактирование.",
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
    delete: "Удалить",
    confirmDeleteTitle: "Удалить животное?",
    confirmDeleteDescription: "Узел будет удален, а у потомков очистятся связи с этим родителем.",
    confirmDeleteAction: "Да, удалить",
    cancel: "Отмена",
    save: "Сохранить",
    noDate: "Без даты",
    generation: (value) => `Поколение ${value}`,
    errorOwnFather: "Животное не может быть своим собственным отцом.",
    errorOwnMother: "Животное не может быть своей собственной матерью.",
    errorParentsMatch: "Отец и мать должны быть разными животными.",
    errorNameRequired: "Укажите имя животного.",
    errorNameTooLong: "Имя не должно быть длиннее 20 символов."
  },
  en: {
    documentTitle: "Animal Generations",
    add: "Add",
    recenter: "Back to center",
    help: "Help",
    helpTitle: "How to use the board",
    helpItems: [
      "Left-click an animal to choose a parent based on its gender.",
      "Use the gear button in the card's bottom-right corner to open editing.",
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
    delete: "Delete",
    confirmDeleteTitle: "Delete animal?",
    confirmDeleteDescription: "The node will be removed and descendants will lose the link to this parent.",
    confirmDeleteAction: "Yes, delete",
    cancel: "Cancel",
    save: "Save",
    noDate: "No date",
    generation: (value) => `Generation ${value}`,
    errorOwnFather: "An animal cannot be its own father.",
    errorOwnMother: "An animal cannot be its own mother.",
    errorParentsMatch: "Father and mother must be different animals.",
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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.title = messagesByLocale[locale].documentTitle;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = messagesByLocale[locale];

    return {
      locale,
      setLocale: setLocaleState,
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
