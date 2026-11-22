"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PageHeader, Select } from "@cartforge/ui";
import { PageEditor } from "@/components/online-store/page-editor";
import { PAGE_TEMPLATES } from "@/components/online-store/page-templates";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";

export default function NewPagePage() {
  return (
    <Suspense>
      <NewPage />
    </Suspense>
  );
}

function NewPage() {
  useBreadcrumbTitle("Add page");
  const sp = useSearchParams();
  const [key, setKey] = useState(sp.get("template") ?? "blank");
  const t = PAGE_TEMPLATES.find((x) => x.key === key) ?? PAGE_TEMPLATES[0]!;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add page"
        secondaryActions={
          <Select
            aria-label="Start from"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-56"
          >
            {PAGE_TEMPLATES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.key === "blank" ? "Blank page" : `Template: ${x.title}`}
              </option>
            ))}
          </Select>
        }
      />
      <PageEditor key={key} page={null} initial={{ title: t.title, body: t.body }} />
    </div>
  );
}
