import type { AnimalGender } from "./animal-data";
import type { Locale } from "./i18n";

export type VaccinationDefinition = {
  id: string;
  appliesTo: "all" | "female";
  category: "core" | "risk";
  intervalMonths: number;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  intervalLabel: Record<Locale, string>;
  timingLabel: Record<Locale, string>;
};

export const vaccinationCatalog: VaccinationDefinition[] = [
  {
    id: "cdt",
    appliesTo: "all",
    category: "core",
    intervalMonths: 12,
    title: {
      ru: "CDT: энтеротоксемия C/D и столбняк",
      en: "CDT: enterotoxemia C/D and tetanus"
    },
    description: {
      ru: "Базовая прививка для овец и коз против клостридиозов и столбняка.",
      en: "Core clostridial and tetanus protection for sheep and goats."
    },
    intervalLabel: {
      ru: "Ежегодно",
      en: "Usually yearly"
    },
    timingLabel: {
      ru: "Часто за 2–4 недели до окота у беременных самок",
      en: "Often 2–4 weeks before lambing/kidding in pregnant females"
    },
  },
  {
    id: "rabies",
    appliesTo: "all",
    category: "core",
    intervalMonths: 12,
    title: {
      ru: "Бешенство",
      en: "Rabies"
    },
    description: {
      ru: "Зоонозная вакцина, особенно актуальна в эндемичных регионах и для выставочных животных.",
      en: "Zoonotic vaccine, especially relevant in endemic regions and for show animals."
    },
    intervalLabel: {
      ru: "Ежегодно",
      en: "Usually yearly"
    },
    timingLabel: {
      ru: "По региональному риску и схеме ветеринара",
      en: "Based on regional risk and veterinarian guidance"
    },
  },
  {
    id: "vibriosis",
    appliesTo: "female",
    category: "risk",
    intervalMonths: 12,
    title: {
      ru: "Вибриоз (Campylobacter)",
      en: "Vibriosis (Campylobacter)"
    },
    description: {
      ru: "Антиабортная вакцина для маточного поголовья против Campylobacter jejuni и C. fetus.",
      en: "Anti-abortive vaccine for breeding females targeting Campylobacter jejuni and C. fetus."
    },
    intervalLabel: {
      ru: "Ежегодно",
      en: "Yearly"
    },
    timingLabel: {
      ru: "До случки; первичная схема обычно в 2 дозы с интервалом 2–4 недели",
      en: "Before breeding; primary series is commonly 2 doses given 2–4 weeks apart"
    },
  },
  {
    id: "chlamydia",
    appliesTo: "female",
    category: "risk",
    intervalMonths: 12,
    title: {
      ru: "Хламидиоз (ензоотический аборт)",
      en: "Chlamydiosis (enzootic abortion)"
    },
    description: {
      ru: "Антиабортная вакцина для маточного поголовья против Chlamydia psittaci.",
      en: "Anti-abortive vaccine for breeding females against Chlamydia psittaci."
    },
    intervalLabel: {
      ru: "Ежегодно",
      en: "Yearly"
    },
    timingLabel: {
      ru: "До случки; для новых самок часто делают 2 дозы за 60 и 30 дней до случки",
      en: "Before breeding; new females often receive 2 doses at 60 and 30 days before breeding"
    },
  },
  {
    id: "cl",
    appliesTo: "all",
    category: "risk",
    intervalMonths: 12,
    title: {
      ru: "CL: казеозный лимфаденит",
      en: "CL: caseous lymphadenitis"
    },
    description: {
      ru: "Прививка для хозяйств, где CL уже есть в стаде или риск считается значимым.",
      en: "Vaccine for farms where CL is already present or risk is considered meaningful."
    },
    intervalLabel: {
      ru: "Ежегодно",
      en: "Often yearly"
    },
    timingLabel: {
      ru: "Только по согласованной схеме с ветеринаром",
      en: "Only as part of a veterinarian-approved herd plan"
    },
  }
];

export function getVaccinationDefinitions(locale: Locale, gender: AnimalGender) {
  return vaccinationCatalog
    .filter((definition) => definition.appliesTo === "all" || definition.appliesTo === gender)
    .map((definition) => ({
      ...definition,
      title: definition.title[locale],
      description: definition.description[locale],
      intervalLabel: definition.intervalLabel[locale],
      timingLabel: definition.timingLabel[locale]
    }));
}

export function calculateNextVaccinationDate(lastDate: string, intervalMonths: number) {
  if (!lastDate) {
    return "";
  }

  const [year, month, day] = lastDate.split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }

  const nextDate = new Date(year, month - 1 + intervalMonths, 1);
  const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  nextDate.setDate(Math.min(day, lastDayOfMonth));

  const nextYear = nextDate.getFullYear();
  const nextMonth = `${nextDate.getMonth() + 1}`.padStart(2, "0");
  const nextDay = `${nextDate.getDate()}`.padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
