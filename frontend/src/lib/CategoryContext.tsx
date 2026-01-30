import React, { createContext, useContext, useEffect, useState } from "react";

type CategoryContextType = {
  openIds: number[];
  isOpen: (id: number) => boolean;
  toggle: (id: number) => void;
  setOpenIds: (ids: number[]) => void;
};

const KEY = "openCategories";
const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export const CategoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openSet, setOpenSet] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return new Set<number>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<number>();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(openSet)));
    } catch {}
  }, [openSet]);

  const isOpen = (id: number) => openSet.has(id);
  const toggle = (id: number) =>
    setOpenSet((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setOpenIds = (ids: number[]) => setOpenSet(new Set(ids));

  return (
    <CategoryContext.Provider value={{ openIds: Array.from(openSet), isOpen, toggle, setOpenIds }}>
      {children}
    </CategoryContext.Provider>
  );
};

export const useCategories = () => {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error("useCategories must be used within CategoryProvider");
  return ctx;
};
