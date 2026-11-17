"use client";

import { useParams } from "next/navigation";
import { useApi } from "@/lib/client";
import { WorkflowBuilder, type WorkflowDraft } from "@/components/WorkflowBuilder";

export default function WorkflowPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const list = useApi<{ workflows: WorkflowDraft[] }>("/api/workflows");
  const w = list.data?.workflows.find((x) => x.id === workflowId);
  if (!list.data) return null;
  if (!w) return <p className="p-8 text-[14px] text-muted">This workflow could not be found.</p>;
  return <WorkflowBuilder key={w.id} initial={w} />;
}
