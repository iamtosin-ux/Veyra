import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createProject, listProjects } from "@/server/projects";
import { handle } from "@/server/http";

export const GET = handle(async () => Response.json({ projects: listProjects(await requireUser()) }));

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2000).default(""), caseIds: z.array(z.string()).max(50).default([]), visibility: z.enum(["private", "public"]).default("public") }).parse(await req.json());
  return Response.json({ project: createProject(user, b.name, b.description, b.caseIds, b.visibility) }, { status: 201 });
});
