"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { updateRoomStatus } from "@/server/rooms";
import { ActionButton } from "./action-form";
import { keepValues } from "@/lib/forms";

/** Quick status changes for one room, shown when its tile is opened. */
export function RoomQuickActions({ roomId, readiness, maintenance }: { roomId: string; readiness: string; maintenance: boolean }) {
  const [state, action, pending] = useActionState(updateRoomStatus, null);
  const set = (value: string) => ({ roomId, readiness: value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {readiness !== "ready" ? <ActionButton action={updateRoomStatus} fields={set("ready")} size="sm" className="items-stretch">Mark ready</ActionButton> : null}
        {readiness !== "cleaning_in_progress" ? <ActionButton action={updateRoomStatus} fields={set("cleaning_in_progress")} size="sm" variant="secondary" className="items-stretch">Cleaning in progress</ActionButton> : null}
        {readiness !== "needs_cleaning" ? <ActionButton action={updateRoomStatus} fields={set("needs_cleaning")} size="sm" variant="secondary" className="items-stretch">Needs cleaning</ActionButton> : null}
      </div>
      <div className="border-t border-ivory-200 pt-3">
        {maintenance ? (
          <ActionButton action={updateRoomStatus} fields={{ roomId, serviceStatus: "in_service" }} size="sm" variant="secondary" className="items-stretch">Return to service</ActionButton>
        ) : (
          <form action={action} onSubmit={keepValues(action)} className="space-y-2">
            <input type="hidden" name="roomId" value={roomId} />
            <input type="hidden" name="serviceStatus" value="maintenance" />
            <label className="sr-only" htmlFor={`note-${roomId}`}>Maintenance note</label>
            <Input id={`note-${roomId}`} name="note" placeholder="What needs fixing?" className="h-8 text-xs" />
            <Button type="submit" size="sm" variant="ghost" pending={pending} className="w-full text-danger-700 hover:bg-danger-50">Mark under maintenance</Button>
            {state && !state.ok ? <p role="alert" className="text-xs text-danger-700">{state.message}</p> : null}
          </form>
        )}
      </div>
    </div>
  );
}
