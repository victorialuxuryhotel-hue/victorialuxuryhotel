"use client";

import { useState } from "react";
import { Input } from "@/components/ui/form";

/** "Room number" in the Rooms header (design R105): jumps to that room on the board and outlines it. */
export function RoomFinder() {
  const [missing, setMissing] = useState<string | null>(null);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const n = String(new FormData(e.currentTarget).get("room") ?? "").trim();
        if (!n) return;
        if (document.getElementById(`room-${n}`)) {
          setMissing(null);
          window.location.hash = `room-${n}`;
        } else {
          setMissing(n);
        }
      }}
      className="relative"
    >
      <label htmlFor="room-finder" className="sr-only">Room number</label>
      <Input id="room-finder" name="room" inputMode="numeric" placeholder="Room number" autoComplete="off" className="h-10 w-[180px] text-sm" />
      {missing ? <p role="status" className="absolute top-full right-0 mt-1 text-xs whitespace-nowrap text-[#a61b1b]">No room {missing} on this list</p> : null}
    </form>
  );
}
