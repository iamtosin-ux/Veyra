"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime, useApi } from "@/lib/client";
import { AppShell, Crumb } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { CreateProjectModal } from "@/components/CreateProjectModal";

interface Project {
  id: string;
  name: string;
  description: string;
  updated_at: string;
  cases: number;
  evidence: number;
}

/** Projects group related cases, e.g. every case for one property or one employee. */
export default function ProjectsPage() {
  const projects = useApi<{ projects: Project[] }>("/api/projects");
  const [creating, setCreating] = useState(false);

  const list = projects.data?.projects ?? [];

  return (
    <AppShell
      breadcrumb={<Crumb current>Projects</Crumb>}
      actions={
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={13} /> New project
        </Button>
      }
    >
      <div className="scroll-panel h-full bg-panel">
        <div className="mx-auto max-w-[960px] px-8 pb-16 pt-10">
          <h1 className="text-[26px] font-medium ">Projects</h1>

          {creating && <CreateProjectModal onClose={() => setCreating(false)} />}

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {list.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex min-h-[140px] flex-col rounded-2xl border border-line p-4 hover:bg-subtle">
                <Icon name="projects" size={20} className="text-muted" />
                <p className="mt-auto truncate pt-4 text-[14px] font-medium">{p.name}</p>
                {p.description && <p className="line-clamp-1 text-[12px] text-muted">{p.description}</p>}
                <p className="mt-1.5 text-[11px] text-faint">
                  {p.cases} case{p.cases === 1 ? "" : "s"} · {p.evidence} evidence · {formatDateTime(p.updated_at)}
                </p>
              </Link>
            ))}
            {projects.data && list.length === 0 && (
              <div className="col-span-full rounded-2xl bg-[#f7f7f6] px-6 py-12 text-center">
                <p className="text-[14px] font-medium">No projects yet</p>
                <Button className="mt-3" onClick={() => setCreating(true)}>Create a project</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
