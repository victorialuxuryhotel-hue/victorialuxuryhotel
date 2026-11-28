"use client";

import { useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils/cn";
import { RoomQuickActions } from "./room-actions";

/**
 * A room on the board (design R105). Tapping the room opens its actions (cleaning, out of order); `footer` holds
 * the one quick action shown on the tile itself (Mark clean, Back in use), outside the tap area.
 */
export function RoomTile({
  children,
  className,
  footer,
  room,
  stateLabel,
}: {
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
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
      <div className={cn(className, open && open !== "sheet" && "ring-2 ring-navy-600/30")}>
        <button
          ref={tile}
          type="button"
          onClick={toggle}
          aria-expanded={open !== null}
          aria-haspopup="dialog"
          className="-m-1 flex min-w-0 flex-col gap-1.5 rounded-md p-1 text-left hover:bg-ivory-50"
        >
          {children}
        </button>
        {footer}
      </div>
      {open === "left" || open === "right" ? (
        <div className={cn("absolute top-full z-20 mt-1 w-60 rounded-xl border border-hairline bg-white p-3 shadow-[0_12px_32px_rgba(11,31,92,.18)]", open === "left" ? "left-0" : "right-0")}>
          <p className="mb-2 text-xs font-semibold text-[#5b6372]">Room {room.number}</p>
          {actions}
        </div>
      ) : null}
      <BottomSheet open={open === "sheet"} onClose={close} title={`Room ${room.number} · ${room.category}`} subtitle={stateLabel} trigger={tile}>
        {actions}
      </BottomSheet>
    </div>
  );
}
