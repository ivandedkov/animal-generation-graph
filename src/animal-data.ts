export type AnimalGender = "male" | "female";

export type Animal = {
  id: string;
  name: string;
  gender: AnimalGender;
  fatherId: string | null;
  motherId: string | null;
  birthDate: string;
  isBreedingApproved: boolean;
};

type AnimalSnapshot = {
  version: 2;
  animals: Animal[];
};

const STORAGE_KEY = "animal-generation-canvas";
const CURRENT_SNAPSHOT_VERSION = 2;

export function createAnimalId() {
  return `animal-${crypto.randomUUID()}`;
}

export function createAnimalSnapshot(animals: Animal[]): AnimalSnapshot {
  return {
    version: CURRENT_SNAPSHOT_VERSION,
    animals: animals.map((animal) => ({ ...animal }))
  };
}

export function parseAnimalSnapshot(raw: unknown): Animal[] {
  const source = extractSnapshotPayload(raw);
  return normalizeAnimals(source);
}

export async function fetchAnimals(storage: Storage = window.localStorage): Promise<Animal[]> {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return parseAnimalSnapshot(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveAnimals(animals: Animal[], storage: Storage = window.localStorage): Promise<void> {
  storage.setItem(STORAGE_KEY, JSON.stringify(createAnimalSnapshot(animals)));
}

function extractSnapshotPayload(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return [];
  }

  if (raw.version === CURRENT_SNAPSHOT_VERSION && Array.isArray(raw.animals)) {
    return raw.animals;
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
  const isBreedingApproved = normalizeBoolean(raw.isBreedingApproved);

  if (!id || !name || !birthDate || !gender || isBreedingApproved === null) {
    return null;
  }

  return {
    id,
    name,
    gender,
    fatherId: normalizeOptionalString(raw.fatherId),
    motherId: normalizeOptionalString(raw.motherId),
    birthDate,
    isBreedingApproved
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

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
