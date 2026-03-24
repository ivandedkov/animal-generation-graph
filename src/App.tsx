import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Animal, fetchAnimals, saveAnimals } from "./animal-data";
import { AnimalBoardPage } from "./AnimalBoardPage";
import { AnimalProfilePage } from "./AnimalProfilePage";

function App() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalsLoaded, setAnimalsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadAnimals = async () => {
      try {
        const nextAnimals = await fetchAnimals();
        if (!cancelled) {
          setAnimals(nextAnimals);
        }
      } finally {
        if (!cancelled) {
          setAnimalsLoaded(true);
        }
      }
    };

    void loadAnimals();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!animalsLoaded) {
      return;
    }

    void saveAnimals(animals);
  }, [animals, animalsLoaded]);

  return (
    <Routes>
      <Route path="/" element={<AnimalBoardPage animals={animals} setAnimals={setAnimals} />} />
      <Route
        path="/animals/:animalId"
        element={<AnimalProfilePage animals={animals} setAnimals={setAnimals} animalsLoaded={animalsLoaded} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
