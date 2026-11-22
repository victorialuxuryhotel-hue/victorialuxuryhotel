"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { updateRoomStatus } from "@/server/rooms";
import { ActionButton } from "./action-form";
import { keepValues } from "@/lib/forms";

/** Quick status changes for one room, shown when its tile is opened. */
export function RoomQuickActions({ roomId, readiness, maintenance, large = false }: { roomId: string; readiness: string; maintenance: boolean; large?: boolean }) {
  // Phones (bottom sheet): full-width 48px buttons. Popover: compact.
  const size = large ? "lg" : "sm";
  const [state, action, pending] = useActionState(updateRoomStatus, null);
  const set = (value: string) => ({ roomId, readiness: value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {readiness !== "ready" ? <ActionButton action={updateRoomStatus} fields={set("ready")} size={size} className="items-stretch [&_button]:w-full">Mark ready</ActionButton> : null}
        {readiness !== "cleaning_in_progress" ? <ActionButton action={updateRoomStatus} fields={set("cleaning_in_progress")} size={size} variant="secondary" className="items-stretch [&_button]:w-full">Cleaning in progress</ActionButton> : null}
        {readiness !== "needs_cleaning" ? <ActionButton action={updateRoomStatus} fields={set("needs_cleaning")} size={size} variant="secondary" className="items-stretch [&_button]:w-full">Needs cleaning</ActionButton> : null}
      </div>
      <div className="border-t border-hairline pt-3">
        {maintenance ? (
          <ActionButton action={updateRoomStatus} fields={{ roomId, serviceStatus: "in_service" }} size={size} variant="secondary" className="items-stretch [&_button]:w-full">Return to service</ActionButton>
        ) : (
          <form action={action} onSubmit={keepValues(action)} className="space-y-2">
            <input type="hidden" name="roomId" value={roomId} />
            <input type="hidden" name="serviceStatus" value="maintenance" />
            <label className="sr-only" htmlFor={`note-${roomId}`}>Maintenance note</label>
            <Input id={`note-${roomId}`} name="note" placeholder="What needs fixing?" className={large ? undefined : "h-8 text-xs"} />
            <Button type="submit" size={size} variant="ghost" pending={pending} className="w-full text-danger-700 hover:bg-danger-50">Mark under maintenance</Button>
            {state && !state.ok ? <p role="alert" className="text-xs text-danger-700">{state.message}</p> : null}
          </form>
        )}
      </div>
    </div>
  );
}
