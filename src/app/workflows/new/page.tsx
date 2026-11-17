"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApi } from "@/lib/client";
import { TEMPLATES } from "@/lib/workflowTemplates";
import { WorkflowBuilder, type WorkflowDraft } from "@/components/WorkflowBuilder";

export default function NewWorkflowPage() {
  return (
    <Suspense>
      <NewWorkflow />
    </Suspense>
  );
}

// Blank, from a template (?template=key), or a copy of an existing workflow (?from=id).
function NewWorkflow() {
  const params = useSearchParams();
  const from = params.get("from");
  const template = TEMPLATES.find((t) => t.key === params.get("template"));
  const list = useApi<{ workflows: WorkflowDraft[] }>(from ? "/api/workflows" : null);
  if (from && !list.data) return null;
  const source = from ? list.data?.workflows.find((w) => w.id === from) : undefined;
  const initial: WorkflowDraft = source
    ? { name: `${source.name} (copy)`, description: source.description, steps: source.steps, instructions: source.instructions }
    : template
      ? { name: template.name, description: template.description, steps: template.steps, instructions: template.instructions }
      : { name: "", description: "", steps: [], instructions: "" };
  return <WorkflowBuilder key={from ?? template?.key ?? "blank"} initial={initial} />;
}
