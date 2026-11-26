"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { updateRoomStatus } from "@/server/rooms";
import { ActionButton } from "./action-form";
import { useActionFeedback, withFeedback } from "./action-feedback";
import { keepValues } from "@/lib/forms";

const readinessMessage = {
  ready: "marked ready",
  cleaning_in_progress: "marked as being cleaned",
  needs_cleaning: "marked for cleaning",
} as const;

export function RoomQuickActions({ roomId, number, readiness, maintenance, note, large = false, inline = false }: {
  roomId: string;
  number: string;
  readiness: string;
  maintenance: boolean;
  note?: string;
  large?: boolean;
  inline?: boolean;
}) {
  const size = large ? "lg" : "sm";
  const feedback = useActionFeedback();
  /** Announce a change, with the fields that would put the room back as it was. */
  const changed = (what: string, previous: Record<string, string>) => () => {
    const fields = new FormData();
    for (const [k, v] of Object.entries({ roomId, ...previous })) fields.set(k, v);
    feedback({
      message: `Room ${number} ${what}.`,
      revert: { run: () => updateRoomStatus(null, fields), message: `Room ${number} is back as it was.` },
    });
  };
  const [state, action, pending] = useActionState(
    withFeedback(updateRoomStatus, changed("taken out of service", { serviceStatus: "in_service" })),
    null,
  );
  const readinessButton = (value: keyof typeof readinessMessage, label: string, variant?: "secondary") =>
    readiness === value ? null : (
      <ActionButton
        action={updateRoomStatus}
        fields={{ roomId, readiness: value }}
        size={size}
        variant={variant}
        className="items-stretch [&_button]:w-full"
        onSuccess={changed(readinessMessage[value], { readiness })}
      >
        {label}
      </ActionButton>
    );
  return (
    <div className={inline ? "flex flex-wrap items-start gap-2" : "space-y-3"}>
      <div className={inline ? "flex flex-wrap items-start gap-2" : "grid grid-cols-1 gap-2"}>
        {readinessButton("ready", "Mark ready")}
        {readinessButton("cleaning_in_progress", "Cleaning in progress", "secondary")}
        {readinessButton("needs_cleaning", "Needs cleaning", "secondary")}
      </div>
      <div className={inline ? undefined : "border-t border-hairline pt-3"}>
        {maintenance ? (
          <ActionButton
            action={updateRoomStatus}
            fields={{ roomId, serviceStatus: "in_service" }}
            size={size}
            variant="secondary"
            className="items-stretch [&_button]:w-full"
            onSuccess={changed("returned to service", { serviceStatus: "maintenance", note: note ?? "" })}
          >
            Return to service
          </ActionButton>
        ) : (
          <form action={action} onSubmit={keepValues(action)} className={inline ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
            <input type="hidden" name="roomId" value={roomId} />
            <input type="hidden" name="serviceStatus" value="maintenance" />
            <label className="sr-only" htmlFor={`note-${roomId}`}>Maintenance note</label>
            <Input id={`note-${roomId}`} name="note" placeholder="What needs fixing?" className={large ? undefined : "h-8 w-48 text-xs md:h-8 md:text-xs"} />
            <Button type="submit" size={size} variant="ghost" pending={pending} className={`text-danger-700 hover:bg-danger-50 ${inline ? "" : "w-full"}`}>Mark out of service</Button>
            {state && !state.ok ? <p role="alert" className="text-xs text-danger-700">{state.message}</p> : null}
          </form>
        )}
      </div>
    </div>
  );
}
