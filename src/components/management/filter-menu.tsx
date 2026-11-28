"use client";

import { useRef } from "react";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";

/**
 * A list filter as a dropdown (design D2): "Any status ▾" opens the choices with a tick on the chosen one and
 * Clear. Choosing one submits the surrounding search form, so the list updates straight away.
 */
export function FilterMenu({ name, label, value, options }: { name: string; label: string; value?: string; options: Array<[string, string]> }) {
  const input = useRef<HTMLInputElement>(null);
  const current = options.find(([v]) => v === value);
  const choose = (next: string) => {
    if (!input.current) return;
    input.current.value = next;
    input.current.form?.requestSubmit();
  };
  return (
    <>
      <input ref={input} type="hidden" name={name} defaultValue={value ?? ""} />
      <Menu
        label={`${label}: ${current ? current[1] : "any"}`}
        button={
          <>
            <span className="truncate">{current ? current[1] : `Any ${label.toLowerCase()}`}</span>
            <span aria-hidden className="text-[#5b6372]">▾</span>
          </>
        }
        buttonClassName="flex h-11 w-full items-center justify-between gap-2.5 rounded-lg border border-[#bdb7a8] bg-white px-3 text-sm text-ink-900 hover:border-ink-900/45 md:h-10 md:w-40"
      >
        {options.map(([v, l]) => (
          <MenuItem key={v} selected={v === value} onSelect={() => choose(v)}>{l}</MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => choose("")}>Clear</MenuItem>
      </Menu>
    </>
  );
}
