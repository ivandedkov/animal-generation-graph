export type AnimalGender = "male" | "female";

export type Animal = {
  id: string;
  name: string;
  gender: AnimalGender;
  fatherId: string | null;
  motherId: string | null;
  birthDate: string;
};

type AnimalSnapshotV1 = {
  version: 1;
  animals: Animal[];
};

const STORAGE_KEY = "animal-generation-canvas";
const CURRENT_SNAPSHOT_VERSION = 1;

const initialAnimals: Animal[] = [
  {
    id: "animal-1",
    name: "Арчи",
    gender: "male",
    fatherId: null,
    motherId: null,
    birthDate: "2020-04-03"
  },
  {
    id: "animal-2",
    name: "Белла",
    gender: "female",
    fatherId: null,
    motherId: null,
    birthDate: "2020-05-14"
  },
  {
    id: "animal-3",
    name: "Каштан",
    gender: "male",
    fatherId: "animal-1",
    motherId: "animal-2",
    birthDate: "2022-03-09"
  },
  {
    id: "animal-4",
    name: "Луна",
    gender: "female",
    fatherId: "animal-1",
    motherId: "animal-2",
    birthDate: "2022-03-09"
  },
  {
    id: "animal-5",
    name: "Ириска",
    gender: "female",
    fatherId: "animal-3",
    motherId: "animal-4",
    birthDate: "2024-02-18"
  }
];

export function createAnimalId() {
  return `animal-${crypto.randomUUID()}`;
}

export function createAnimalSnapshot(animals: Animal[]): AnimalSnapshotV1 {
  return {
    version: CURRENT_SNAPSHOT_VERSION,
    animals: animals.map((animal) => ({ ...animal }))
  };
}

export function parseAnimalSnapshot(raw: unknown): Animal[] {
  const source = extractSnapshotPayload(raw);
  const normalizedAnimals = normalizeAnimals(source);
  return normalizedAnimals.length > 0 ? normalizedAnimals : initialAnimals.map((animal) => ({ ...animal }));
}

export function loadAnimalsFromStorage(storage: Storage = window.localStorage): Animal[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return initialAnimals.map((animal) => ({ ...animal }));
  }

  try {
    return parseAnimalSnapshot(JSON.parse(raw));
  } catch {
    return initialAnimals.map((animal) => ({ ...animal }));
  }
}

export function saveAnimalsToStorage(animals: Animal[], storage: Storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(createAnimalSnapshot(animals)));
}

function extractSnapshotPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    return [];
  }

  if (raw.version === CURRENT_SNAPSHOT_VERSION) {
    if (Array.isArray(raw.animals)) {
      return raw.animals;
    }
  }

  return [];
}

function normalizeAnimals(raw: unknown): Animal[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const animals: Animal[] = [];
  const seenIds = new Set<string>();

  raw.forEach((item) => {
    const animal = normalizeAnimal(item);
    if (!animal || seenIds.has(animal.id)) {
      return;
    }

    seenIds.add(animal.id);
    animals.push(animal);
  });

  if (animals.length === 0) {
    return [];
  }

  const byId = new Map(animals.map((animal) => [animal.id, animal]));
  return animals.map((animal) => ({
    ...animal,
    fatherId: resolveParentId(animal.fatherId, byId, "male"),
    motherId: resolveParentId(animal.motherId, byId, "female")
  }));
}

function normalizeAnimal(raw: unknown): Animal | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = normalizeRequiredString(raw.id);
  const name = normalizeRequiredString(raw.name);
  const birthDate = normalizeRequiredString(raw.birthDate);
  const gender = normalizeGender(raw.gender);

  if (!id || !name || !birthDate || !gender) {
    return null;
  }

  return {
    id,
    name,
    gender,
    fatherId: normalizeOptionalString(raw.fatherId),
    motherId: normalizeOptionalString(raw.motherId),
    birthDate
  };
}

function resolveParentId(parentId: string | null, byId: Map<string, Animal>, expectedGender: AnimalGender) {
  if (!parentId) {
    return null;
  }

  const parent = byId.get(parentId);
  if (!parent || parent.gender !== expectedGender) {
    return null;
  }

  return parentId;
}

function normalizeGender(value: unknown): AnimalGender | null {
  return value === "male" || value === "female" ? value : null;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
