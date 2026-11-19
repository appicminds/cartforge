"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface Ctx {
  title: string | null;
  setTitle: (t: string | null) => void;
}

const BreadcrumbTitleContext = createContext<Ctx>({ title: null, setTitle: () => {} });

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <BreadcrumbTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </BreadcrumbTitleContext.Provider>
  );
}

/** Lets a detail page name the last breadcrumb (e.g. the product title). */
export function useBreadcrumbTitle(title: string | null | undefined) {
  const { setTitle } = useContext(BreadcrumbTitleContext);
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

export function useBreadcrumbTitleValue(): string | null {
  return useContext(BreadcrumbTitleContext).title;
}
