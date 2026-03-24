import { Dispatch, FormEvent, PointerEvent, SetStateAction, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Animal, AnimalGender, createAnimalId } from "./animal-data";
import editPencilUrl from "./assets/icons/edit-pencil.svg";
import { localeOptions, useI18n } from "./i18n";

type AnimalDraft = {
  id?: string;
  name: string;
  gender: AnimalGender;
  fatherId: string;
  motherId: string;
  birthDate: string;
};

type NodeLayout = {
  animal: Animal;
  generation: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ModalState =
  | { mode: "create"; draft: AnimalDraft }
  | { mode: "edit"; animalId: string; draft: AnimalDraft };

type SelectedParents = {
  fatherId: string | null;
  motherId: string | null;
};

type HoveredTarget = {
  animalId: string | null;
  area: "node" | "gear" | null;
};

type CloseRelationType =
  | "direct_parent_child"
  | "direct_grandparent"
  | "direct_ancestor"
  | "full_siblings"
  | "half_siblings"
  | "aunt_uncle"
  | "first_cousins";

type RelationRiskLevel = "high" | "medium";

const NODE_WIDTH = 172;
const NODE_HEIGHT = 90;
const GENERATION_GAP = 260;
const SIBLING_GAP = 120;
const COMPONENT_GAP = 180;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.1;
const CANVAS_CENTER_X_RATIO = 0.25;
const ZOOM_SENSITIVITY = 0.01;
const MAX_NAME_LENGTH = 20;
const PAN_START_THRESHOLD = 4;
const GEAR_BUTTON_RADIUS = 12;
const DEFAULT_PAN = { x: 180, y: 0 };
const DEFAULT_ZOOM = 1;
const EMPTY_PARENT_SELECTION: SelectedParents = { fatherId: null, motherId: null };
const EMPTY_HOVERED_TARGET: HoveredTarget = { animalId: null, area: null };
const ANIMAL_NAME_COLLATOR = new Intl.Collator(["ru", "en"], { sensitivity: "base", numeric: true });
const CYRILLIC_INITIAL_RE = /^\p{Script=Cyrillic}/u;
const LATIN_INITIAL_RE = /^\p{Script=Latin}/u;

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const emptyDraft = (): AnimalDraft => ({
  name: "",
  gender: "female",
  fatherId: "",
  motherId: "",
  birthDate: todayValue()
});

function getAnimalAlphabetBucket(name: string) {
  const normalizedName = name.trim();
  if (CYRILLIC_INITIAL_RE.test(normalizedName)) {
    return 0;
  }

  if (LATIN_INITIAL_RE.test(normalizedName)) {
    return 1;
  }

  return 2;
}

function compareAnimalsAlphabetically(left: Animal, right: Animal) {
  const leftBucket = getAnimalAlphabetBucket(left.name);
  const rightBucket = getAnimalAlphabetBucket(right.name);
  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket;
  }

  const byName = ANIMAL_NAME_COLLATOR.compare(left.name, right.name);
  if (byName !== 0) {
    return byName;
  }

  if (left.birthDate !== right.birthDate) {
    return left.birthDate.localeCompare(right.birthDate);
  }

  return left.id.localeCompare(right.id);
}

function normalizeSearchValue(value: string, locale: string) {
  return value.trim().toLocaleLowerCase(locale);
}

function computeGenerations(animals: Animal[]) {
  const byId = new Map(animals.map((animal) => [animal.id, animal]));
  const memo = new Map<string, number>();

  const visit = (animalId: string): number => {
    const cached = memo.get(animalId);
    if (cached !== undefined) {
      return cached;
    }

    const animal = byId.get(animalId);
    if (!animal) {
      return 0;
    }

    const parentGenerations = [animal.fatherId, animal.motherId]
      .filter((parentId): parentId is string => Boolean(parentId))
      .map((parentId) => visit(parentId));

    const generation = parentGenerations.length === 0 ? 0 : Math.max(...parentGenerations) + 1;
    memo.set(animalId, generation);
    return generation;
  };

  return new Map(animals.map((animal) => [animal.id, visit(animal.id)]));
}

function sortAnimalsForLayout(animals: Animal[], generationById: Map<string, number>, sourceOrder: Map<string, number>) {
  return animals.slice().sort((left, right) => {
    const leftGeneration = generationById.get(left.id) ?? 0;
    const rightGeneration = generationById.get(right.id) ?? 0;
    if (leftGeneration !== rightGeneration) {
      return leftGeneration - rightGeneration;
    }

    if (left.birthDate !== right.birthDate) {
      return left.birthDate.localeCompare(right.birthDate);
    }

    return (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0);
  });
}

function computeComponents(animals: Animal[]) {
  const byId = new Map(animals.map((animal) => [animal.id, animal]));
  const adjacency = new Map<string, Set<string>>();

  animals.forEach((animal) => {
    const links = adjacency.get(animal.id) ?? new Set<string>();
    adjacency.set(animal.id, links);

    [animal.fatherId, animal.motherId]
      .filter((parentId): parentId is string => Boolean(parentId))
      .forEach((parentId) => {
        links.add(parentId);
        const parentLinks = adjacency.get(parentId) ?? new Set<string>();
        parentLinks.add(animal.id);
        adjacency.set(parentId, parentLinks);
      });
  });

  const visited = new Set<string>();
  const components: Animal[][] = [];

  animals.forEach((animal) => {
    if (visited.has(animal.id)) {
      return;
    }

    const stack = [animal.id];
    const component: Animal[] = [];
    visited.add(animal.id);

    while (stack.length > 0) {
      const animalId = stack.pop();
      if (!animalId) {
        continue;
      }

      const currentAnimal = byId.get(animalId);
      if (currentAnimal) {
        component.push(currentAnimal);
      }

      (adjacency.get(animalId) ?? new Set<string>()).forEach((linkedId) => {
        if (visited.has(linkedId)) {
          return;
        }

        visited.add(linkedId);
        stack.push(linkedId);
      });
    }

    components.push(component);
  });

  return components;
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

function getParentIds(animal: Animal | undefined) {
  if (!animal) {
    return [];
  }

  return [animal.fatherId, animal.motherId].filter((parentId): parentId is string => Boolean(parentId));
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

function buildLayout(animals: Animal[]) {
  const generationById = computeGenerations(animals);
  const sourceOrder = new Map(animals.map((animal, index) => [animal.id, index]));
  const sortedAnimals = sortAnimalsForLayout(animals, generationById, sourceOrder);
  const animalOrder = new Map(sortedAnimals.map((animal, index) => [animal.id, index]));
  const components = computeComponents(animals).sort((left, right) => {
    const leftOrder = Math.min(...left.map((animal) => animalOrder.get(animal.id) ?? Number.MAX_SAFE_INTEGER));
    const rightOrder = Math.min(...right.map((animal) => animalOrder.get(animal.id) ?? Number.MAX_SAFE_INTEGER));
    return leftOrder - rightOrder;
  });

  const componentLayouts = components.map((component) => {
    const columns = new Map<number, Animal[]>();

    sortAnimalsForLayout(component, generationById, sourceOrder).forEach((animal) => {
      const generation = generationById.get(animal.id) ?? 0;
      const group = columns.get(generation) ?? [];
      group.push(animal);
      columns.set(generation, group);
    });

    const localNodes: NodeLayout[] = [];
    const generations = [...columns.keys()].sort((left, right) => left - right);

    generations.forEach((generation) => {
      const animalsInGeneration = columns.get(generation) ?? [];
      const totalHeight =
        animalsInGeneration.length * NODE_HEIGHT + Math.max(animalsInGeneration.length - 1, 0) * SIBLING_GAP;
      const offsetY = -totalHeight / 2 + NODE_HEIGHT / 2;

      animalsInGeneration.forEach((animal, index) => {
        localNodes.push({
          animal,
          generation,
          x: generation * GENERATION_GAP,
          y: offsetY + index * (NODE_HEIGHT + SIBLING_GAP),
          width: NODE_WIDTH,
          height: NODE_HEIGHT
        });
      });
    });

    const minY = Math.min(...localNodes.map((node) => node.y - node.height / 2));
    const maxY = Math.max(...localNodes.map((node) => node.y + node.height / 2));

    return {
      nodes: localNodes,
      minY,
      height: maxY - minY
    };
  });

  const layouts = new Map<string, NodeLayout>();
  const totalHeight =
    componentLayouts.reduce((sum, component) => sum + component.height, 0) +
    Math.max(componentLayouts.length - 1, 0) * COMPONENT_GAP;
  let currentTop = -totalHeight / 2;

  componentLayouts.forEach((component) => {
    const yOffset = currentTop - component.minY;

    component.nodes.forEach((node) => {
      layouts.set(node.animal.id, {
        ...node,
        y: node.y + yOffset
      });
    });

    currentTop += component.height + COMPONENT_GAP;
  });

  return layouts;
}

type AnimalBoardPageProps = {
  animals: Animal[];
  setAnimals: Dispatch<SetStateAction<Animal[]>>;
};

export function AnimalBoardPage({ animals, setAnimals }: AnimalBoardPageProps) {
  const { locale, setLocale, messages, formatDate } = useI18n();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const panRef = useRef({
    active: false,
    pointerId: -1,
    originX: 0,
    originY: 0,
    startX: 0,
    startY: 0,
    moved: false
  });
  const [modal, setModal] = useState<ModalState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedParents, setSelectedParents] = useState<SelectedParents>(EMPTY_PARENT_SELECTION);
  const [hoveredTarget, setHoveredTarget] = useState<HoveredTarget>(EMPTY_HOVERED_TARGET);
  const [isPanning, setIsPanning] = useState(false);
  const [isAnimalListOpen, setIsAnimalListOpen] = useState(false);
  const [animalSearch, setAnimalSearch] = useState("");
  const [pendingFocusAnimalId, setPendingFocusAnimalId] = useState<string | null>(null);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const [editButtonIcon, setEditButtonIcon] = useState<HTMLImageElement | null>(null);
  const modalOpenKey = modal ? `${modal.mode}:${modal.mode === "edit" ? modal.animalId : "new"}` : null;
  const editAnimalId = modal?.mode === "edit" ? modal.animalId : null;
  const selectedAnimalIds = useMemo(
    () =>
      new Set(
        [selectedParents.fatherId, selectedParents.motherId].filter((id): id is string => Boolean(id))
      ),
    [selectedParents]
  );
  const descendantIds = useMemo(
    () => (editAnimalId ? collectDescendantIds(animals, editAnimalId) : new Set<string>()),
    [animals, editAnimalId]
  );
  const visibleAnimals = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(animalSearch, locale);

    return animals
      .slice()
      .sort(compareAnimalsAlphabetically)
      .filter((animal) => normalizeSearchValue(animal.name, locale).includes(normalizedQuery));
  }, [animalSearch, animals, locale]);
  const relatedParentsWarning = useMemo(() => {
    if (!modal) {
      return null;
    }

    const fatherId = modal.draft.fatherId || "";
    const motherId = modal.draft.motherId || "";
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
  }, [animals, messages, modal]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (!cancelled) {
        setEditButtonIcon(image);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setEditButtonIcon(null);
      }
    };
    image.src = editPencilUrl;

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setCanvasSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!modalOpenKey) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [modalOpenKey]);

  const layout = useMemo(() => buildLayout(animals), [animals]);

  useEffect(() => {
    const maleIds = new Set(animals.filter((animal) => animal.gender === "male").map((animal) => animal.id));
    const femaleIds = new Set(animals.filter((animal) => animal.gender === "female").map((animal) => animal.id));

    setSelectedParents((current) => {
      const fatherId = current.fatherId && maleIds.has(current.fatherId) ? current.fatherId : null;
      const motherId = current.motherId && femaleIds.has(current.motherId) ? current.motherId : null;

      if (fatherId === current.fatherId && motherId === current.motherId) {
        return current;
      }

      return { fatherId, motherId };
    });
  }, [animals]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasSize.width * ratio);
    canvas.height = Math.round(canvasSize.height * ratio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);

    drawBoard(context, canvasSize.width, canvasSize.height);
    drawGraph(
      context,
      layout,
      pan,
      zoom,
      canvasSize.width,
      canvasSize.height,
      formatDate,
      messages.generation,
      selectedAnimalIds,
      hoveredTarget,
      editButtonIcon
    );
  }, [canvasSize, editButtonIcon, formatDate, hoveredTarget, layout, messages, pan, selectedAnimalIds, zoom]);

  const maleOptions = animals.filter(
    (animal) => animal.gender === "male" && animal.id !== editAnimalId && !descendantIds.has(animal.id)
  );
  const femaleOptions = animals.filter(
    (animal) => animal.gender === "female" && animal.id !== editAnimalId && !descendantIds.has(animal.id)
  );
  const editAnimalHasChildren =
    modal?.mode === "edit" &&
    animals.some((animal) => animal.fatherId === modal.animalId || animal.motherId === modal.animalId);

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    const anchor = getCanvasAnchor(canvasSize.width, canvasSize.height);

    return {
      x: (clientX - rect.left - anchor.x - pan.x) / zoom,
      y: (clientY - rect.top - anchor.y - pan.y) / zoom
    };
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const anchor = getCanvasAnchor(canvasSize.width, canvasSize.height);
    const stageX = pointerX - anchor.x - pan.x;
    const stageY = pointerY - anchor.y - pan.y;
    const zoomFactor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);

    setZoom((currentZoom) => {
      const nextZoom = clamp(currentZoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === currentZoom) {
        return currentZoom;
      }

      const worldX = stageX / currentZoom;
      const worldY = stageY / currentZoom;

      setPan({
        x: pointerX - anchor.x - worldX * nextZoom,
        y: pointerY - anchor.y - worldY * nextZoom
      });

      return nextZoom;
    });
  };

  const closeModal = () => {
    setModal(null);
    setDeleteConfirmOpen(false);
    setFormError("");
  };

  const resetView = () => {
    setPan(DEFAULT_PAN);
    setZoom(DEFAULT_ZOOM);
    setHoveredTarget(EMPTY_HOVERED_TARGET);
    setIsPanning(false);
  };

  const openCreateModal = (parents: SelectedParents = EMPTY_PARENT_SELECTION) => {
    setDeleteConfirmOpen(false);
    setFormError("");
    setModal({
      mode: "create",
      draft: {
        ...emptyDraft(),
        fatherId: parents.fatherId ?? "",
        motherId: parents.motherId ?? ""
      }
    });
  };

  const openAnimalProfile = (animalId: string) => {
    navigate(`/animals/${animalId}`);
  };

  const focusAnimal = (animalId: string) => {
    const node = layout.get(animalId);
    if (!node) {
      return;
    }

    const anchor = getCanvasAnchor(canvasSize.width, canvasSize.height);
    setPan({
      x: canvasSize.width / 2 - anchor.x - node.x * zoom,
      y: canvasSize.height / 2 - anchor.y - node.y * zoom
    });
    setHoveredTarget({ animalId, area: "node" });
    setIsPanning(false);
  };

  useEffect(() => {
    if (!pendingFocusAnimalId) {
      return;
    }

    if (!layout.has(pendingFocusAnimalId)) {
      return;
    }

    focusAnimal(pendingFocusAnimalId);
    setPendingFocusAnimalId(null);
  }, [canvasSize.height, canvasSize.width, layout, pendingFocusAnimalId, zoom]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) {
      return;
    }

    const point = toCanvasPoint(event.clientX, event.clientY);
    const target = getAnimalAtPoint(layout, point.x, point.y);

    if (target) {
      if (isPointInGearButton(target, point.x, point.y)) {
        openAnimalProfile(target.animal.id);
        return;
      }

      setSelectedParents((current) =>
        target.animal.gender === "male"
          ? { ...current, fatherId: target.animal.id }
          : { ...current, motherId: target.animal.id }
      );
      return;
    }

    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      originX: pan.x,
      originY: pan.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    setHoveredTarget(EMPTY_HOVERED_TARGET);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!panRef.current.active || panRef.current.pointerId !== event.pointerId) {
      const point = toCanvasPoint(event.clientX, event.clientY);
      setHoveredTarget(resolveHoveredTarget(layout, point.x, point.y));
      return;
    }

    const deltaX = event.clientX - panRef.current.startX;
    const deltaY = event.clientY - panRef.current.startY;

    if (!panRef.current.moved && Math.hypot(deltaX, deltaY) < PAN_START_THRESHOLD) {
      return;
    }

    panRef.current.moved = true;
    setIsPanning(true);
    setHoveredTarget(EMPTY_HOVERED_TARGET);
    setPan({
      x: panRef.current.originX + deltaX,
      y: panRef.current.originY + deltaY
    });
  };

  const stopPan = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!panRef.current.active || panRef.current.pointerId !== event.pointerId) {
      return;
    }

    const shouldClearSelection = event.type === "pointerup" && !panRef.current.moved;
    panRef.current.active = false;
    panRef.current.pointerId = -1;
    panRef.current.moved = false;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (shouldClearSelection) {
      setSelectedParents(EMPTY_PARENT_SELECTION);
    }

    const point = toCanvasPoint(event.clientX, event.clientY);
    setHoveredTarget(resolveHoveredTarget(layout, point.x, point.y));
  };

  const updateDraft = <K extends keyof AnimalDraft>(key: K, value: AnimalDraft[K]) => {
    if (formError) {
      setFormError("");
    }

    setModal((current) => {
      if (!current) {
        return null;
      }

      return {
        ...current,
        draft: {
          ...current.draft,
          [key]: value
        }
      };
    });
  };

  const saveAnimal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modal) {
      return;
    }

    const draft = modal.draft;
    const normalizedFather = draft.fatherId || null;
    const normalizedMother = draft.motherId || null;

    if (normalizedFather && normalizedFather === modal.draft.id) {
      setFormError(messages.errorOwnFather);
      return;
    }

    if (normalizedMother && normalizedMother === modal.draft.id) {
      setFormError(messages.errorOwnMother);
      return;
    }

    if (normalizedFather && normalizedMother && normalizedFather === normalizedMother) {
      setFormError(messages.errorParentsMatch);
      return;
    }

    if (modal.mode === "edit" && normalizedFather && descendantIds.has(normalizedFather)) {
      setFormError(messages.errorFatherDescendant);
      return;
    }

    if (modal.mode === "edit" && normalizedMother && descendantIds.has(normalizedMother)) {
      setFormError(messages.errorMotherDescendant);
      return;
    }

    if (!draft.name.trim()) {
      setFormError(messages.errorNameRequired);
      return;
    }

    if (draft.name.trim().length > MAX_NAME_LENGTH) {
      setFormError(messages.errorNameTooLong);
      return;
    }

    if (
      modal.mode === "edit" &&
      animals.some((animal) => animal.fatherId === modal.animalId || animal.motherId === modal.animalId)
    ) {
      const originalAnimal = animals.find((animal) => animal.id === modal.animalId);
      if (originalAnimal && originalAnimal.gender !== draft.gender) {
        return;
      }
    }

    if (modal.mode === "create") {
      const animalId = createAnimalId();

      setAnimals((current) => [
        ...current,
        {
          id: animalId,
          name: draft.name.trim(),
          gender: draft.gender,
          fatherId: normalizedFather,
          motherId: normalizedMother,
          birthDate: draft.birthDate
        }
      ]);
      setPendingFocusAnimalId(animalId);
    } else {
      setAnimals((current) =>
        current.map((animal) =>
          animal.id === modal.animalId
            ? {
                ...animal,
                name: draft.name.trim(),
                gender: draft.gender,
                fatherId: normalizedFather,
                motherId: normalizedMother,
                birthDate: draft.birthDate
              }
            : animal
        )
      );
    }

    closeModal();
  };

  const deleteAnimal = () => {
    if (!modal || modal.mode !== "edit") {
      return;
    }

    setAnimals((current) =>
      current
        .filter((animal) => animal.id !== modal.animalId)
        .map((animal) => ({
          ...animal,
          fatherId: animal.fatherId === modal.animalId ? null : animal.fatherId,
          motherId: animal.motherId === modal.animalId ? null : animal.motherId
        }))
    );
    closeModal();
  };

  return (
    <div className="app-shell">
      <div className="board-frame" ref={hostRef}>
        <canvas
          ref={canvasRef}
          className="board-canvas"
          style={{ cursor: isPanning ? "grabbing" : hoveredTarget.area ? "pointer" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onPointerLeave={() => setHoveredTarget(EMPTY_HOVERED_TARGET)}
          onWheel={onWheel}
        />

        <div className="overlay-stack">
          <div className="overlay-panel">
            <div className="overlay-actions">
              <button className="icon-button" type="button" onClick={() => setHelpOpen(true)} aria-label={messages.help}>
                <span aria-hidden="true">?</span>
              </button>
              <button className="ghost-button" type="button" onClick={resetView}>
                {messages.recenter}
              </button>
              <button className="primary-button" type="button" onClick={() => openCreateModal(selectedParents)}>
                {messages.add}
              </button>
            </div>
          </div>

          <div className="animal-browser-panel">
            <button
              className="animal-browser-toggle"
              type="button"
              onClick={() => setIsAnimalListOpen((current) => !current)}
              aria-expanded={isAnimalListOpen}
            >
              <span>{messages.animalListTitle}</span>
              <span className="animal-browser-toggle-icon" aria-hidden="true">
                {isAnimalListOpen ? "−" : "+"}
              </span>
            </button>

            {isAnimalListOpen ? (
              <div className="animal-browser-body">
                <input
                  className="animal-search-input"
                  type="search"
                  value={animalSearch}
                  onChange={(event) => setAnimalSearch(event.target.value)}
                  placeholder={messages.animalSearchPlaceholder}
                  aria-label={messages.animalSearchLabel}
                />

                <ul className="animal-list">
                  {visibleAnimals.length > 0 ? (
                    visibleAnimals.map((animal) => {
                      const isSelected = selectedAnimalIds.has(animal.id);

                      return (
                        <li key={animal.id} className="animal-list-row">
                          <button
                            className={isSelected ? "animal-list-item animal-list-item-selected" : "animal-list-item"}
                            type="button"
                            onClick={() => focusAnimal(animal.id)}
                            aria-pressed={isSelected}
                          >
                            <i
                              className={
                                animal.gender === "male"
                                  ? "animal-list-dot animal-list-dot-male"
                                  : "animal-list-dot animal-list-dot-female"
                              }
                              aria-hidden="true"
                            />
                            <span>{animal.name}</span>
                          </button>
                          <button
                            className="animal-list-profile-button"
                            type="button"
                            onClick={() => openAnimalProfile(animal.id)}
                            aria-label={`${messages.openProfile}: ${animal.name}`}
                            title={messages.openProfile}
                          >
                            <img src={editPencilUrl} alt="" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })
                  ) : (
                    <li className="animal-list-empty">{messages.animalListEmpty}</li>
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="locale-panel">
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
        </div>

        <div className="legend-panel">
          <span className="legend-item">
            <i className="legend-dot legend-dot-male" />
            {messages.legendMale}
          </span>
          <span className="legend-item">
            <i className="legend-dot legend-dot-female" />
            {messages.legendFemale}
          </span>
        </div>
      </div>

      {modal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{modal.mode === "create" ? messages.createAnimalTitle : messages.editAnimalTitle}</h2>
                <p>{messages.modalDescription}</p>
              </div>
              <button className="icon-button" type="button" onClick={closeModal} aria-label={messages.close}>
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form className="animal-form" onSubmit={saveAnimal}>
              <label>
                {messages.name}
                <input
                  ref={nameInputRef}
                  type="text"
                  value={modal.draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  placeholder={messages.namePlaceholder}
                  maxLength={MAX_NAME_LENGTH}
                  required
                />
              </label>

              <label>
                {messages.gender}
                <select
                  value={modal.draft.gender}
                  onChange={(event) => updateDraft("gender", event.target.value as AnimalGender)}
                  disabled={Boolean(editAnimalHasChildren)}
                >
                  <option value="female">{messages.genderFemale}</option>
                  <option value="male">{messages.genderMale}</option>
                </select>
              </label>

              {editAnimalHasChildren ? <div className="field-hint">{messages.genderLockedHint}</div> : null}

              <label>
                {messages.father}
                <select
                  value={modal.draft.fatherId}
                  onChange={(event) => updateDraft("fatherId", event.target.value)}
                >
                  <option value="">{messages.fatherPlaceholder}</option>
                  {maleOptions.map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {messages.mother}
                <select
                  value={modal.draft.motherId}
                  onChange={(event) => updateDraft("motherId", event.target.value)}
                >
                  <option value="">{messages.motherPlaceholder}</option>
                  {femaleOptions.map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {messages.birthDate}
                <input
                  type="date"
                  value={modal.draft.birthDate}
                  onChange={(event) => updateDraft("birthDate", event.target.value)}
                  required
                />
              </label>

              {relatedParentsWarning ? (
                <div
                  className={relatedParentsWarning.level === "high" ? "form-warning form-warning-high" : "form-warning form-warning-medium"}
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

              <div className="modal-actions">
                {modal.mode === "edit" ? (
                  <button className="danger-button" type="button" onClick={() => setDeleteConfirmOpen(true)}>
                    {messages.delete}
                  </button>
                ) : (
                  <span />
                )}

                <div className="action-group">
                  <button className="ghost-button" type="button" onClick={closeModal}>
                    {messages.cancel}
                  </button>
                  <button className="primary-button" type="submit">
                    {messages.save}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="modal-card help-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{messages.helpTitle}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setHelpOpen(false)} aria-label={messages.close}>
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <ul className="help-list">
              {messages.helpItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen && modal?.mode === "edit" ? (
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

function drawBoard(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f9f4eb");
  gradient.addColorStop(1, "#f2f7ff");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(104, 119, 143, 0.1)";
  context.lineWidth = 1;

  for (let x = 0; x < width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = 0; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

function drawGraph(
  context: CanvasRenderingContext2D,
  layout: Map<string, NodeLayout>,
  pan: { x: number; y: number },
  zoom: number,
  width: number,
  height: number,
  formatDate: (value: string) => string,
  formatGeneration: (value: number) => string,
  selectedAnimalIds: Set<string>,
  hoveredTarget: HoveredTarget,
  editButtonIcon: CanvasImageSource | null
) {
  const anchor = getCanvasAnchor(width, height);

  context.save();
  context.translate(anchor.x + pan.x, anchor.y + pan.y);
  context.scale(zoom, zoom);

  context.strokeStyle = "rgba(103, 113, 141, 0.45)";
  context.lineWidth = 2;

  layout.forEach((node) => {
    [node.animal.fatherId, node.animal.motherId]
      .filter((parentId): parentId is string => Boolean(parentId))
      .forEach((parentId) => {
        const parentNode = layout.get(parentId);
        if (!parentNode) {
          return;
        }

        const startX = parentNode.x + parentNode.width / 2;
        const startY = parentNode.y;
        const endX = node.x - node.width / 2;
        const endY = node.y;
        const controlOffset = Math.max((endX - startX) * 0.4, 40);

        context.beginPath();
        context.moveTo(startX, startY);
        context.bezierCurveTo(startX + controlOffset, startY, endX - controlOffset, endY, endX, endY);
        context.stroke();
      });
  });

  layout.forEach((node) => {
    const isMale = node.animal.gender === "male";
    const isSelected = selectedAnimalIds.has(node.animal.id);
    const isHoveredNode = hoveredTarget.animalId === node.animal.id && hoveredTarget.area === "node";
    const isHoveredGear = hoveredTarget.animalId === node.animal.id && hoveredTarget.area === "gear";
    const fill = isMale ? "#9ac8ff" : "#ffc0d7";
    const accent = isMale ? "#3877d6" : "#d2578f";

    roundRectPath(context, node.x - node.width / 2, node.y - node.height / 2, node.width, node.height, 22);
    context.fillStyle = isSelected
      ? isHoveredNode
        ? "rgba(255, 234, 160, 0.98)"
        : "rgba(255, 242, 191, 0.96)"
      : isHoveredNode
        ? "rgba(245, 249, 255, 0.98)"
        : "rgba(255, 255, 255, 0.9)";
    context.shadowColor = isHoveredNode ? "rgba(47, 61, 89, 0.2)" : "rgba(47, 61, 89, 0.12)";
    context.shadowBlur = isHoveredNode ? 28 : 22;
    context.shadowOffsetY = isHoveredNode ? 14 : 10;
    context.fill();

    context.shadowColor = "transparent";
    context.lineWidth = 1.5;
    context.strokeStyle = isSelected
      ? "rgba(197, 161, 73, 0.5)"
      : isHoveredNode
        ? "rgba(79, 137, 223, 0.42)"
        : "rgba(107, 122, 149, 0.18)";
    context.stroke();

    context.beginPath();
    context.arc(node.x - node.width / 2 + 24, node.y - 2, 8, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();

    context.fillStyle = "#183153";
    context.font = "600 18px ui-sans-serif, system-ui, sans-serif";
    context.textBaseline = "middle";
    drawTextWithEllipsis(
      context,
      node.animal.name,
      node.x - node.width / 2 + 40,
      node.y - 16,
      node.width - 56
    );

    context.fillStyle = accent;
    context.font = "500 12px ui-sans-serif, system-ui, sans-serif";
    context.fillText(formatGeneration(node.generation + 1), node.x - node.width / 2 + 40, node.y + 8);

    context.fillStyle = "rgba(24, 49, 83, 0.6)";
    context.font = "500 11px ui-sans-serif, system-ui, sans-serif";
    context.fillText(formatDate(node.animal.birthDate), node.x - node.width / 2 + 40, node.y + 24);

    drawGearButton(context, node, isHoveredGear, editButtonIcon);
  });

  context.restore();
}

function drawGearButton(
  context: CanvasRenderingContext2D,
  node: NodeLayout,
  isHovered: boolean,
  editButtonIcon: CanvasImageSource | null
) {
  const { x, y } = getGearButtonCenter(node);

  context.save();
  context.beginPath();
  context.arc(x, y, GEAR_BUTTON_RADIUS, 0, Math.PI * 2);
  context.fillStyle = isHovered ? "rgba(228, 239, 255, 0.98)" : "rgba(255, 255, 255, 0.96)";
  context.strokeStyle = isHovered ? "rgba(79, 137, 223, 0.5)" : "rgba(107, 122, 149, 0.28)";
  context.lineWidth = 1.25;
  context.shadowColor = isHovered ? "rgba(79, 137, 223, 0.18)" : "transparent";
  context.shadowBlur = isHovered ? 16 : 0;
  context.fill();
  context.stroke();

  context.shadowColor = "transparent";

  if (editButtonIcon) {
    const iconSize = 12;
    context.drawImage(editButtonIcon, x - iconSize / 2, y - iconSize / 2, iconSize, iconSize);
  }

  context.restore();
}

function getCanvasAnchor(width: number, height: number) {
  return {
    x: width * CANVAS_CENTER_X_RATIO,
    y: height / 2
  };
}

function getGearButtonCenter(node: NodeLayout) {
  return {
    x: node.x + node.width / 2 - 18,
    y: node.y + node.height / 2 - 18
  };
}

function isPointInGearButton(node: NodeLayout, x: number, y: number) {
  const center = getGearButtonCenter(node);
  return Math.hypot(x - center.x, y - center.y) <= GEAR_BUTTON_RADIUS;
}

function resolveHoveredTarget(layout: Map<string, NodeLayout>, x: number, y: number): HoveredTarget {
  const target = getAnimalAtPoint(layout, x, y);
  if (!target) {
    return EMPTY_HOVERED_TARGET;
  }

  return isPointInGearButton(target, x, y)
    ? { animalId: target.animal.id, area: "gear" }
    : { animalId: target.animal.id, area: "node" };
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function getAnimalAtPoint(layout: Map<string, NodeLayout>, x: number, y: number) {
  const nodes = [...layout.values()].reverse();

  return nodes.find(
    (node) =>
      x >= node.x - node.width / 2 &&
      x <= node.x + node.width / 2 &&
      y >= node.y - node.height / 2 &&
      y <= node.y + node.height / 2
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawTextWithEllipsis(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y);
    return;
  }

  const ellipsis = "...";
  let truncated = text;

  while (truncated.length > 0 && context.measureText(`${truncated}${ellipsis}`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  context.fillText(`${truncated}${ellipsis}`, x, y);
}
