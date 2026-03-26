import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Animal, AnimalGender, AnimalVaccination } from "./animal-data";
import { Messages, localeOptions, useI18n } from "./i18n";
import { calculateNextVaccinationDate, getVaccinationDefinitions, vaccinationCatalog } from "./vaccination-catalog";

type AnimalDraft = {
  name: string;
  gender: AnimalGender;
  fatherId: string;
  motherId: string;
  birthDate: string;
  isBreedingApproved: boolean;
};

type AnimalProfilePageProps = {
  animals: Animal[];
  setAnimals: Dispatch<SetStateAction<Animal[]>>;
  animalsLoaded: boolean;
};

type ProfileTab = "general" | "kidding" | "vaccines";

type CloseRelationType =
  | "direct_parent_child"
  | "direct_grandparent"
  | "direct_ancestor"
  | "full_siblings"
  | "half_siblings"
  | "aunt_uncle"
  | "first_cousins";

type RelationRiskLevel = "high" | "medium";
type VaccinationStatus = "missing" | "current" | "due_soon" | "overdue";

const MAX_NAME_LENGTH = 20;
const NAME_COLLATOR = new Intl.Collator(["ru", "en"], { sensitivity: "base", numeric: true });

function createDraft(animal: Animal): AnimalDraft {
  return {
    name: animal.name,
    gender: animal.gender,
    fatherId: animal.fatherId ?? "",
    motherId: animal.motherId ?? "",
    birthDate: animal.birthDate,
    isBreedingApproved: animal.isBreedingApproved
  };
}

function createVaccinationDraft(animal: Animal) {
  return Object.fromEntries(animal.vaccinations.map((record) => [record.vaccineId, record.lastDate]));
}

function getParentIds(animal: Animal | undefined) {
  if (!animal) {
    return [];
  }

  return [animal.fatherId, animal.motherId].filter((parentId): parentId is string => Boolean(parentId));
}

function collectDescendantIds(animals: Animal[], rootAnimalId: string) {
  const childrenByParentId = new Map<string, string[]>();

  animals.forEach((animal) => {
    [animal.fatherId, animal.motherId]
      .filter((parentId): parentId is string => Boolean(parentId))
      .forEach((parentId) => {
        const children = childrenByParentId.get(parentId) ?? [];
        children.push(animal.id);
        childrenByParentId.set(parentId, children);
      });
  });

  const seen = new Set<string>([rootAnimalId]);
  const descendants = new Set<string>();
  const stack = [rootAnimalId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }

    (childrenByParentId.get(currentId) ?? []).forEach((childId) => {
      if (seen.has(childId)) {
        return;
      }

      seen.add(childId);
      descendants.add(childId);
      stack.push(childId);
    });
  }

  return descendants;
}

function collectAncestorDepths(byId: Map<string, Animal>, animalId: string) {
  const depths = new Map<string, number>();
  const stack = getParentIds(byId.get(animalId)).map((parentId) => ({ id: parentId, depth: 1 }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const knownDepth = depths.get(current.id);
    if (knownDepth !== undefined && knownDepth <= current.depth) {
      continue;
    }

    depths.set(current.id, current.depth);
    getParentIds(byId.get(current.id)).forEach((parentId) => {
      stack.push({ id: parentId, depth: current.depth + 1 });
    });
  }

  return depths;
}

function getSiblingRelation(byId: Map<string, Animal>, leftId: string, rightId: string) {
  if (leftId === rightId) {
    return null;
  }

  const left = byId.get(leftId);
  const right = byId.get(rightId);
  if (!left || !right) {
    return null;
  }

  const sameFather = Boolean(left.fatherId && left.fatherId === right.fatherId);
  const sameMother = Boolean(left.motherId && left.motherId === right.motherId);

  if (sameFather && sameMother) {
    return "full_siblings" as const;
  }

  if (sameFather || sameMother) {
    return "half_siblings" as const;
  }

  return null;
}

function resolveCloseRelation(animals: Animal[], leftId: string, rightId: string): CloseRelationType | null {
  if (!leftId || !rightId || leftId === rightId) {
    return null;
  }

  const byId = new Map(animals.map((animal) => [animal.id, animal]));
  const leftAncestors = collectAncestorDepths(byId, leftId);
  const rightAncestors = collectAncestorDepths(byId, rightId);

  const leftToRightDepth = leftAncestors.get(rightId);
  if (leftToRightDepth === 1) {
    return "direct_parent_child";
  }
  if (leftToRightDepth === 2) {
    return "direct_grandparent";
  }
  if (leftToRightDepth !== undefined) {
    return "direct_ancestor";
  }

  const rightToLeftDepth = rightAncestors.get(leftId);
  if (rightToLeftDepth === 1) {
    return "direct_parent_child";
  }
  if (rightToLeftDepth === 2) {
    return "direct_grandparent";
  }
  if (rightToLeftDepth !== undefined) {
    return "direct_ancestor";
  }

  const siblingRelation = getSiblingRelation(byId, leftId, rightId);
  if (siblingRelation) {
    return siblingRelation;
  }

  const leftParents = getParentIds(byId.get(leftId));
  const rightParents = getParentIds(byId.get(rightId));

  const isAuntUncle =
    leftParents.some((parentId) => Boolean(getSiblingRelation(byId, parentId, rightId))) ||
    rightParents.some((parentId) => Boolean(getSiblingRelation(byId, leftId, parentId)));
  if (isAuntUncle) {
    return "aunt_uncle";
  }

  const isFirstCousins = leftParents.some((leftParentId) =>
    rightParents.some((rightParentId) => Boolean(getSiblingRelation(byId, leftParentId, rightParentId)))
  );
  if (isFirstCousins) {
    return "first_cousins";
  }

  return null;
}

function sortAnimals(animals: Animal[]) {
  return animals.slice().sort((left, right) => {
    const byName = NAME_COLLATOR.compare(left.name, right.name);
    if (byName !== 0) {
      return byName;
    }

    if (left.birthDate !== right.birthDate) {
      return left.birthDate.localeCompare(right.birthDate);
    }

    return left.id.localeCompare(right.id);
  });
}

function buildParentOptions(
  animals: Animal[],
  gender: AnimalGender,
  animalId: string,
  descendantIds: Set<string>,
  selectedId: string
) {
  return sortAnimals(
    animals.filter(
      (entry) =>
        entry.gender === gender &&
        entry.id !== animalId &&
        !descendantIds.has(entry.id) &&
        (entry.isBreedingApproved || entry.id === selectedId)
    )
  );
}

function buildVaccinationRecords(draft: Record<string, string>): AnimalVaccination[] {
  return vaccinationCatalog.flatMap((definition) => {
    const lastDate = draft[definition.id]?.trim();
    return lastDate ? [{ vaccineId: definition.id, lastDate }] : [];
  });
}

function daysBetween(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromDate = Date.UTC(fromYear, (fromMonth || 1) - 1, fromDay || 1);
  const toDate = Date.UTC(toYear, (toMonth || 1) - 1, toDay || 1);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.round((toDate - fromDate) / millisecondsPerDay);
}

function getVaccinationStatus(lastDate: string, nextDate: string, today: string): VaccinationStatus {
  if (!lastDate || !nextDate) {
    return "missing";
  }

  if (nextDate < today) {
    return "overdue";
  }

  if (daysBetween(today, nextDate) <= 30) {
    return "due_soon";
  }

  return "current";
}

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelationWarning(animals: Animal[], fatherId: string, motherId: string, messages: Messages) {
  if (!fatherId || !motherId || fatherId === motherId) {
    return null;
  }

  const relation = resolveCloseRelation(animals, fatherId, motherId);
  if (!relation) {
    return null;
  }

  switch (relation) {
    case "direct_parent_child":
      return {
        level: "high" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationDirectParentChild)
      };
    case "direct_grandparent":
      return {
        level: "high" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationDirectGrandparent)
      };
    case "direct_ancestor":
      return {
        level: "high" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationDirectAncestor)
      };
    case "full_siblings":
      return {
        level: "high" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationFullSiblings)
      };
    case "half_siblings":
      return {
        level: "high" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationHalfSiblings)
      };
    case "aunt_uncle":
      return {
        level: "medium" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationAuntUncle)
      };
    case "first_cousins":
      return {
        level: "medium" as RelationRiskLevel,
        text: messages.relatedParentsRiskDescription(messages.relationFirstCousins)
      };
    default:
      return null;
  }
}

function validateDraft(
  draft: AnimalDraft,
  animal: Animal,
  descendantIds: Set<string>,
  messages: Messages
) {
  const normalizedFather = draft.fatherId || null;
  const normalizedMother = draft.motherId || null;

  if (normalizedFather && normalizedFather === animal.id) {
    return messages.errorOwnFather;
  }

  if (normalizedMother && normalizedMother === animal.id) {
    return messages.errorOwnMother;
  }

  if (normalizedFather && normalizedMother && normalizedFather === normalizedMother) {
    return messages.errorParentsMatch;
  }

  if (normalizedFather && descendantIds.has(normalizedFather)) {
    return messages.errorFatherDescendant;
  }

  if (normalizedMother && descendantIds.has(normalizedMother)) {
    return messages.errorMotherDescendant;
  }

  if (!draft.name.trim()) {
    return messages.errorNameRequired;
  }

  if (draft.name.trim().length > MAX_NAME_LENGTH) {
    return messages.errorNameTooLong;
  }

  return "";
}

function GenderBadge({ gender, messages }: { gender: AnimalGender; messages: Messages }) {
  return (
    <span className={gender === "male" ? "profile-badge profile-badge-male" : "profile-badge profile-badge-female"}>
      {gender === "male" ? messages.genderMale : messages.genderFemale}
    </span>
  );
}

function BreedingStatusBadge({
  isBreedingApproved,
  messages
}: {
  isBreedingApproved: boolean;
  messages: Messages;
}) {
  return (
    <span
      className={
        isBreedingApproved
          ? "profile-badge profile-badge-breeding-approved"
          : "profile-badge profile-badge-breeding-restricted"
      }
    >
      {isBreedingApproved ? messages.breedingApproved : messages.breedingRestricted}
    </span>
  );
}

export function AnimalProfilePage({ animals, setAnimals, animalsLoaded }: AnimalProfilePageProps) {
  const { animalId } = useParams();
  const navigate = useNavigate();
  const { locale, setLocale, messages, formatDate } = useI18n();
  const [activeTab, setActiveTab] = useState<ProfileTab>("general");
  const [draft, setDraft] = useState<AnimalDraft | null>(null);
  const [vaccinationDraft, setVaccinationDraft] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const animal = useMemo(() => animals.find((entry) => entry.id === animalId) ?? null, [animalId, animals]);

  useEffect(() => {
    if (animal) {
      setDraft(createDraft(animal));
      setVaccinationDraft(createVaccinationDraft(animal));
      setFormError("");
      setDeleteConfirmOpen(false);
    }
  }, [animal]);

  useEffect(() => {
    if (animal?.gender !== "female" && activeTab === "kidding") {
      setActiveTab("general");
    }
  }, [activeTab, animal]);

  const descendantIds = useMemo(
    () => (animal ? collectDescendantIds(animals, animal.id) : new Set<string>()),
    [animal, animals]
  );
  const maleOptions = useMemo(
    () => (animal ? buildParentOptions(animals, "male", animal.id, descendantIds, draft?.fatherId ?? "") : []),
    [animal, animals, descendantIds, draft?.fatherId]
  );
  const femaleOptions = useMemo(
    () => (animal ? buildParentOptions(animals, "female", animal.id, descendantIds, draft?.motherId ?? "") : []),
    [animal, animals, descendantIds, draft?.motherId]
  );
  const children = useMemo(
    () =>
      animal
        ? sortAnimals(animals.filter((entry) => entry.fatherId === animal.id || entry.motherId === animal.id))
        : [],
    [animal, animals]
  );
  const relatedParentsWarning = useMemo(
    () => (draft ? getRelationWarning(animals, draft.fatherId, draft.motherId, messages) : null),
    [animals, draft, messages]
  );
  const vaccinationDefinitions = useMemo(
    () => (animal ? getVaccinationDefinitions(locale, animal.gender) : []),
    [animal, locale]
  );
  const vaccinationCards = useMemo(() => {
    const today = todayValue();

    return vaccinationDefinitions.map((definition) => {
      const lastDate = vaccinationDraft[definition.id] ?? "";
      const nextDate = calculateNextVaccinationDate(lastDate, definition.intervalMonths);

      return {
        ...definition,
        lastDate,
        nextDate,
        status: getVaccinationStatus(lastDate, nextDate, today)
      };
    });
  }, [vaccinationDefinitions, vaccinationDraft]);
  const hasChildren = Boolean(animal && children.length > 0);

  if (!animalsLoaded) {
    return <div className="profile-shell" />;
  }

  if (!animal || !draft) {
    return (
      <div className="profile-shell">
        <div className="profile-page">
          <header className="profile-topbar">
            <Link to="/" className="ghost-button profile-back-link">
              {messages.backToBoard}
            </Link>
            <div className="locale-switch" aria-label={messages.localeLabel}>
              {localeOptions.map((option) => (
                <button
                  key={option.value}
                  className={option.value === locale ? "locale-button locale-button-active" : "locale-button"}
                  type="button"
                  onClick={() => setLocale(option.value)}
                  aria-label={option.label}
                  title={option.label}
                >
                  <span className="locale-flag" aria-hidden="true">
                    {option.icon}
                  </span>
                </button>
              ))}
            </div>
          </header>

          <section className="profile-empty-state">
            <h1>{messages.profileNotFoundTitle}</h1>
            <p>{messages.profileNotFoundDescription}</p>
          </section>
        </div>
      </div>
    );
  }

  const updateDraft = <K extends keyof AnimalDraft>(key: K, value: AnimalDraft[K]) => {
    setFormError("");
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateVaccinationDate = (vaccineId: string, value: string) => {
    setVaccinationDraft((current) => {
      const nextDraft = {
        ...current,
        [vaccineId]: value
      };

      setAnimals((currentAnimals) =>
        currentAnimals.map((entry) =>
          entry.id === animal.id
            ? {
                ...entry,
                vaccinations: buildVaccinationRecords(nextDraft)
              }
            : entry
        )
      );

      return nextDraft;
    });
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateDraft(draft, animal, descendantIds, messages);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setAnimals((current) =>
      current.map((entry) =>
        entry.id === animal.id
          ? {
              ...entry,
              name: draft.name.trim(),
              gender: draft.gender,
              fatherId: draft.fatherId || null,
              motherId: draft.motherId || null,
              birthDate: draft.birthDate,
              isBreedingApproved: draft.isBreedingApproved
            }
          : entry
      )
    );

    setFormError("");
    navigate("/", { replace: true });
  };

  const deleteAnimal = () => {
    setAnimals((current) =>
      current
        .filter((entry) => entry.id !== animal.id)
        .map((entry) => ({
          ...entry,
          fatherId: entry.fatherId === animal.id ? null : entry.fatherId,
          motherId: entry.motherId === animal.id ? null : entry.motherId
        }))
    );
    navigate("/", { replace: true });
  };

  const availableTabs: ProfileTab[] = animal.gender === "female" ? ["general", "kidding", "vaccines"] : ["general", "vaccines"];

  return (
    <div className="profile-shell">
      <div className="profile-page">
        <header className="profile-topbar">
          <Link to="/" className="ghost-button profile-back-link">
            {messages.backToBoard}
          </Link>

          <div className="locale-switch" aria-label={messages.localeLabel}>
            {localeOptions.map((option) => (
              <button
                key={option.value}
                className={option.value === locale ? "locale-button locale-button-active" : "locale-button"}
                type="button"
                onClick={() => setLocale(option.value)}
                aria-label={option.label}
                title={option.label}
              >
                <span className="locale-flag" aria-hidden="true">
                  {option.icon}
                </span>
              </button>
            ))}
          </div>
        </header>

        <section className="profile-hero">
          <div className="profile-hero-copy">
            <h1>{animal.name}</h1>
            <p>{messages.profileGeneralDescription}</p>
          </div>

          <div className="profile-hero-side">
            <div className="profile-hero-meta">
              <GenderBadge gender={animal.gender} messages={messages} />
              <BreedingStatusBadge isBreedingApproved={animal.isBreedingApproved} messages={messages} />
              <div className="profile-hero-date">
                <span>{messages.birthDate}</span>
                <strong>{formatDate(animal.birthDate)}</strong>
              </div>
            </div>
          </div>
        </section>

        <nav className="profile-tabs" aria-label="Profile tabs">
          {availableTabs.map((tab) => {
            const label =
              tab === "general"
                ? messages.profileGeneralTab
                : tab === "kidding"
                  ? messages.profileKiddingTab
                  : messages.profileVaccinesTab;

            return (
              <button
                key={tab}
                type="button"
                className={tab === activeTab ? "profile-tab profile-tab-active" : "profile-tab"}
                onClick={() => setActiveTab(tab)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {activeTab === "general" ? (
          <div className="profile-grid">
            <section className="profile-panel">
              <div className="profile-section-head">
                <h2>{messages.profileGeneralTab}</h2>
                <p>{messages.profileGeneralDescription}</p>
              </div>

              <form className="animal-form profile-form" onSubmit={saveProfile}>
                <label>
                  {messages.name}
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) => updateDraft("name", event.target.value)}
                    placeholder={messages.namePlaceholder}
                    maxLength={MAX_NAME_LENGTH}
                    required
                  />
                </label>

                <label>
                  {messages.gender}
                  <select
                    value={draft.gender}
                    onChange={(event) => updateDraft("gender", event.target.value as AnimalGender)}
                    disabled={hasChildren}
                  >
                    <option value="female">{messages.genderFemale}</option>
                    <option value="male">{messages.genderMale}</option>
                  </select>
                </label>

                {hasChildren ? <div className="field-hint">{messages.genderLockedHint}</div> : null}

                <label>
                  {messages.breedingStatus}
                  <select
                    value={draft.isBreedingApproved ? "approved" : "restricted"}
                    onChange={(event) => updateDraft("isBreedingApproved", event.target.value === "approved")}
                  >
                    <option value="approved">{messages.breedingApproved}</option>
                    <option value="restricted">{messages.breedingRestricted}</option>
                  </select>
                </label>

                <div className="field-hint">{messages.breedingStatusHint}</div>

                <label>
                  {messages.father}
                  <select value={draft.fatherId} onChange={(event) => updateDraft("fatherId", event.target.value)}>
                    <option value="">{messages.fatherPlaceholder}</option>
                    {maleOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.isBreedingApproved || entry.id !== draft.fatherId
                          ? entry.name
                          : `${entry.name} (${messages.breedingRestricted})`}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {messages.mother}
                  <select value={draft.motherId} onChange={(event) => updateDraft("motherId", event.target.value)}>
                    <option value="">{messages.motherPlaceholder}</option>
                    {femaleOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.isBreedingApproved || entry.id !== draft.motherId
                          ? entry.name
                          : `${entry.name} (${messages.breedingRestricted})`}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field-hint">{messages.breedingSelectableHint}</div>

                <label>
                  {messages.birthDate}
                  <input
                    type="date"
                    value={draft.birthDate}
                    onChange={(event) => updateDraft("birthDate", event.target.value)}
                    required
                  />
                </label>

                {relatedParentsWarning ? (
                  <div
                    className={
                      relatedParentsWarning.level === "high" ? "form-warning form-warning-high" : "form-warning form-warning-medium"
                    }
                  >
                    <strong>
                      {relatedParentsWarning.level === "high"
                        ? messages.relatedParentsHighRiskTitle
                        : messages.relatedParentsMediumRiskTitle}
                      :
                    </strong>{" "}
                    {relatedParentsWarning.text}
                  </div>
                ) : null}

                {formError ? <div className="form-error">{formError}</div> : null}

                <div className="profile-form-actions">
                  <button className="danger-button" type="button" onClick={() => setDeleteConfirmOpen(true)}>
                    {messages.delete}
                  </button>
                  <button className="primary-button" type="submit">
                    {messages.save}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {activeTab === "kidding" && animal.gender === "female" ? (
          <div className="profile-grid">
            <section className="profile-panel">
              <div className="profile-section-head">
                <h2>{messages.profileKiddingTab}</h2>
                <p>{messages.profileKiddingDescription}</p>
              </div>

              <div className="profile-placeholder-grid">
                <article className="profile-placeholder-card">
                  <span>{messages.profileKiddingTab}</span>
                  <strong>{messages.profileKiddingEmptyTitle}</strong>
                  <p>{messages.profileKiddingEmptyDescription}</p>
                </article>
                <article className="profile-placeholder-card">
                  <span>{messages.profileChildrenTitle}</span>
                  <strong>{children.length === 0 ? messages.profileNoChildren : `${children.length}`}</strong>
                  <p>{children.length === 0 ? messages.profileGeneralDescription : children.map((child) => child.name).join(", ")}</p>
                </article>
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "vaccines" ? (
          <div className="profile-grid">
            <section className="profile-panel">
              <div className="profile-section-head">
                <h2>{messages.profileVaccinesTab}</h2>
                <p>{messages.profileVaccinesDescription}</p>
              </div>

              <div className="profile-placeholder-grid">
                <article className="profile-placeholder-card">
                  <span>{messages.profileVaccinesTab}</span>
                  <strong>{messages.profileVaccinesIntroTitle}</strong>
                  <p>{messages.profileVaccinesIntroDescription}</p>
                </article>
                <article className="profile-placeholder-card">
                  <span>{messages.profileVaccinesLastDate}</span>
                  <strong>{messages.profileVaccinesNextDate}</strong>
                  <p>{messages.profileVaccinesAutoSaveHint}</p>
                </article>
              </div>

              <div className="profile-vaccines-grid">
                {vaccinationCards.map((vaccination) => (
                  <article key={vaccination.id} className="profile-vaccine-card">
                    <div className="profile-vaccine-head">
                      <div className="profile-vaccine-copy">
                        <div className="profile-vaccine-title-row">
                          <h3>{vaccination.title}</h3>
                          <span
                            className={
                              vaccination.status === "overdue"
                                ? "profile-vaccine-status profile-vaccine-status-overdue"
                                : vaccination.status === "due_soon"
                                  ? "profile-vaccine-status profile-vaccine-status-soon"
                                  : vaccination.status === "current"
                                    ? "profile-vaccine-status profile-vaccine-status-current"
                                    : "profile-vaccine-status profile-vaccine-status-missing"
                            }
                          >
                            {vaccination.status === "overdue"
                              ? messages.profileVaccinesStatusOverdue
                              : vaccination.status === "due_soon"
                                ? messages.profileVaccinesStatusDueSoon
                                : vaccination.status === "current"
                                  ? messages.profileVaccinesStatusCurrent
                                  : messages.profileVaccinesStatusMissing}
                          </span>
                        </div>
                        <p>{vaccination.description}</p>
                      </div>

                      <span
                        className={
                          vaccination.category === "core"
                            ? "profile-vaccine-kind profile-vaccine-kind-core"
                            : "profile-vaccine-kind profile-vaccine-kind-risk"
                        }
                      >
                        {vaccination.category === "core"
                          ? messages.profileVaccinesCoreBadge
                          : messages.profileVaccinesRiskBadge}
                      </span>
                    </div>

                    <div className="profile-vaccine-meta">
                      <article className="profile-stat-card">
                        <span>{messages.profileVaccinesInterval}</span>
                        <strong>{vaccination.intervalLabel}</strong>
                      </article>
                      <article className="profile-stat-card">
                        <span>{messages.profileVaccinesTiming}</span>
                        <strong>{vaccination.timingLabel}</strong>
                      </article>
                      <article className="profile-stat-card">
                        <span>{messages.profileVaccinesNextDate}</span>
                        <strong>{formatDate(vaccination.nextDate)}</strong>
                      </article>
                    </div>

                    <label className="profile-vaccine-input">
                      {messages.profileVaccinesLastDate}
                      <input
                        type="date"
                        value={vaccination.lastDate}
                        onChange={(event) => updateVaccinationDate(vaccination.id, event.target.value)}
                      />
                    </label>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {deleteConfirmOpen ? (
        <div className="confirm-backdrop" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-copy">
              <h3>{messages.confirmDeleteTitle}</h3>
              <p>{messages.confirmDeleteDescription}</p>
            </div>

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setDeleteConfirmOpen(false)}>
                {messages.cancel}
              </button>
              <button className="danger-button" type="button" onClick={deleteAnimal}>
                {messages.confirmDeleteAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
