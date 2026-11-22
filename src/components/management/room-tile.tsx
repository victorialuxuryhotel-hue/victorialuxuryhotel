"use client";

import { useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils/cn";
import { RoomQuickActions } from "./room-actions";

/**
 * A room tile that opens its quick actions: a bottom sheet with full-width
 * buttons on phones, a popover from md up (opening leftwards when the tile is
 * near the right edge, so it never runs off screen).
 */
export function RoomTile({
  children,
  className,
  room,
  stateLabel,
}: {
  children: React.ReactNode;
  className?: string;
  room: { id: string; number: string; category: string; readiness: string; maintenance: boolean };
  stateLabel: string;
}) {
  const [open, setOpen] = useState<null | "sheet" | "left" | "right">(null);
  const tile = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(null);

  function toggle() {
    if (open) return close();
    if (window.matchMedia("(max-width: 767px)").matches) return setOpen("sheet");
    const r = tile.current!.getBoundingClientRect();
    setOpen(r.left + 260 > window.innerWidth ? "right" : "left");
  }

  const actions = <RoomQuickActions roomId={room.id} readiness={room.readiness} maintenance={room.maintenance} large={open === "sheet"} />;

  return (
    <div className="relative h-full">
      <button
        ref={tile}
        type="button"
        onClick={toggle}
        aria-expanded={open !== null}
        aria-haspopup="dialog"
        className={cn(className, open && open !== "sheet" && "ring-2 ring-navy-600/30")}
      >
        {children}
      </button>
      {open === "left" || open === "right" ? (
        <div className={cn("absolute top-full z-20 mt-1 w-60 rounded-card border border-hairline bg-ivory-50 p-3 shadow-lg", open === "left" ? "left-0" : "right-0")}>
          <p className="mb-2 text-xs font-semibold text-ink-500">Room {room.number}</p>
          {actions}
        </div>
      ) : null}
      <BottomSheet open={open === "sheet"} onClose={close} title={`Room ${room.number} · ${room.category}`} subtitle={stateLabel} trigger={tile}>
        {actions}
      </BottomSheet>
    </div>
  );
}
