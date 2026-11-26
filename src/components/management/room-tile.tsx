"use client";

import { createContext, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils/cn";
import { RoomQuickActions } from "./room-actions";

type Selection = { selected: string | null; select: (id: string | null) => void; bar: HTMLElement | null };

const SelectionContext = createContext<Selection>({ selected: null, select: () => {}, bar: null });

/** One room is selected at a time; on wider screens its actions appear in a bar above the board. */
export function RoomSelection({ children }: { children: React.ReactNode }) {
  const [selected, select] = useState<string | null>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  return (
    <SelectionContext value={{ selected, select, bar }}>
      <div ref={setBar} className="sticky top-16 z-20 mb-5 empty:hidden lg:top-3" />
      {children}
    </SelectionContext>
  );
}

export function RoomTile({
  children,
  className,
  room,
  stateLabel,
}: {
  children: React.ReactNode;
  className?: string;
  room: { id: string; number: string; category: string; readiness: string; maintenance: boolean; note?: string };
  stateLabel: string;
}) {
  const { selected, select, bar } = useContext(SelectionContext);
  const [sheet, setSheet] = useState(false);
  const tile = useRef<HTMLButtonElement>(null);
  const open = selected === room.id;
  const close = () => select(null);

  function toggle() {
    if (open) return close();
    setSheet(window.matchMedia("(max-width: 767px)").matches);
    select(room.id);
  }

  const actions = <RoomQuickActions roomId={room.id} number={room.number} readiness={room.readiness} maintenance={room.maintenance} note={room.note} large={sheet} inline={!sheet} />;

  return (
    <div className="relative h-full">
      <button
        ref={tile}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(className, open && "border-navy-400 ring-3 ring-navy-600/15")}
      >
        {children}
      </button>
      {open && !sheet && bar
        ? createPortal(
            <div role="group" aria-label={`Room ${room.number} actions`} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-card border border-navy-200 bg-white px-4 py-3 shadow-card">
              <div className="flex-[1_1_12rem]">
                <p className="text-[15px] font-semibold text-ink-900">Room {room.number} · {room.category}</p>
                <p className="text-[13px] text-ink-500">{stateLabel}</p>
              </div>
              {actions}
              <button type="button" onClick={close} className="h-9 rounded-md px-3 text-[13px] text-ink-500 hover:bg-ivory-100">Close</button>
            </div>,
            bar,
          )
        : null}
      <BottomSheet open={open && sheet} onClose={close} title={`Room ${room.number} · ${room.category}`} subtitle={stateLabel} trigger={tile}>
        {actions}
      </BottomSheet>
    </div>
  );
}
