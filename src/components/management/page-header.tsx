import type { ReactNode } from "react";
import { HelpButton, HelpPurpose } from "./screen-help";

/**
 * The white bar at the top of a staff screen (designs R101–R109): the title (22/700), one line under it,
 * and the area's actions at the right end. The one primary button goes last.
 */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-[72px] flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline bg-white px-4 py-3 lg:px-7">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="text-[22px] font-bold text-ink-900">{title}</h1>
          <HelpButton />
        </div>
        {description ? <div className="mt-0.5 text-[13px] text-[#5b6372]">{description}</div> : <HelpPurpose className="mt-0.5 text-[13px] text-[#5b6372]" />}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
