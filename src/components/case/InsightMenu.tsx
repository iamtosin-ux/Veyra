"use client";

import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "../Icon";
import { Menu, type MenuItem } from "../Menu";
import { cx } from "../ui";

type Action = "accept" | "reject" | "reset" | "archive" | "unarchive";

/**
 * Quick actions on one insight. Insights are never deleted: one that is wrong is
 * rejected, and one no longer wanted is archived, which keeps it and its history.
 */
export function InsightMenu({
  id,
  status,
  archived,
  onOpen,
  onChanged,
  className,
}: {
  id: string;
  status: string;
  archived?: boolean;
  onOpen?: () => void;
  onChanged: () => void;
  className?: string;
}) {
  const act = async (action: Action) => {
    try {
      await api(`/api/findings/${id}/review`, { method: "POST", json: { action } });
      if (action === "archive") toast("Insight archived", { action: { label: "Undo", onClick: () => void act("unarchive") } });
      else if (action === "unarchive") toast("Insight restored");
      else if (action === "reject") toast("Insight rejected");
      else if (action === "accept") toast("Insight accepted");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the insight", { tone: "danger" });
    }
  };

  const items: MenuItem[] = archived
    ? [...(onOpen ? [{ label: "Open", icon: "findings" as const, onSelect: onOpen }, { kind: "separator" as const }] : []), { label: "Restore", icon: "refresh", onSelect: () => void act("unarchive") }]
    : [
        ...(onOpen ? [{ label: "Open", icon: "findings" as const, onSelect: onOpen }, { kind: "separator" as const }] : []),
        { kind: "header", label: "Mark as" },
        { label: "Accepted", checked: status === "accepted", onSelect: () => void act(status === "accepted" ? "reset" : "accept") },
        { label: "Rejected", checked: status === "rejected", onSelect: () => void act(status === "rejected" ? "reset" : "reject") },
        { label: "Unreviewed", checked: status === "unreviewed", disabled: status === "unreviewed", onSelect: () => void act("reset") },
        { kind: "separator" },
        { label: "Archive", icon: "archive", onSelect: () => void act("archive") },
      ];

  return (
    <Menu
      align="right"
      width={200}
      items={items}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label="Insight actions"
          aria-expanded={open}
          className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink", open && "bg-hover text-ink", className)}
        >
          <Icon name="moreH" size={15} />
        </button>
      )}
    />
  );
}
