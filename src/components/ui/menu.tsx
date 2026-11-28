"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A small menu that drops from a button (designs D1, D2): the account menu, a row's ⋯ actions, a filter list.
 * Escape or a click outside closes it; arrow keys move between items.
 */
const MenuContext = createContext<{ close: () => void }>({ close: () => {} });

export function Menu({
  label,
  button,
  buttonClassName,
  children,
  align = "left",
  side = "bottom",
  width = "w-[220px]",
  className,
  onClose,
}: {
  /** Called each time the menu closes (a multi-choice filter applies its ticks then). */
  onClose?: () => void;
  /** Accessible name of the button when its content isn't text (⋯). */
  label?: string;
  button: ReactNode;
  buttonClassName?: string;
  children: ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const wasOpen = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (wasOpen.current && !open) onCloseRef.current?.();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[role^=menuitem]:not([aria-disabled=true])")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
      >
        {button}
      </button>
      {open ? (
        <MenuContext.Provider value={{ close }}>
          <div
            id={id}
            role="menu"
            onKeyDown={onMenuKey}
            className={cn(
              "absolute z-50 overflow-hidden rounded-xl border border-hairline bg-white py-1.5 text-left shadow-[0_12px_32px_rgba(11,31,92,.18)]",
              width,
              align === "right" ? "right-0" : "left-0",
              side === "top" ? "bottom-full mb-2" : "top-full mt-1.5",
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      ) : null}
    </div>
  );
}

const item = "block w-full px-3.5 py-[9px] text-left text-sm font-semibold focus:outline-none focus-visible:bg-ivory-100 hover:bg-ivory-100";

function Body({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <>
      {children}
      {hint ? <span className="block text-xs font-normal text-[#5b6372]">{hint}</span> : null}
    </>
  );
}

/** One line in a menu: a button or a link, with an optional grey hint under it. `selected` shows a tick (D2). */
export function MenuItem({ children, hint, onSelect, href, tone, selected, disabled }: {
  children: ReactNode; hint?: ReactNode; onSelect?: () => void; href?: string; tone?: "danger"; selected?: boolean; disabled?: boolean;
}) {
  const { close } = useContext(MenuContext);
  const className = cn(
    item,
    tone === "danger" ? "text-[#a61b1b]" : selected ? "bg-[#e8eefb] text-navy-800 hover:bg-[#dfe7f9]" : "text-ink-900",
    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
  );
  if (href && !disabled) {
    return (
      <Link role="menuitem" href={href} onClick={close} className={className}>
        <Body hint={hint}>{selected ? "✓ " : null}{children}</Body>
      </Link>
    );
  }
  return (
    <button
      type="button"
      role={selected === undefined ? "menuitem" : "menuitemradio"}
      aria-disabled={disabled || undefined}
      aria-checked={selected === undefined ? undefined : selected}
      onClick={() => {
        if (disabled) return;
        close();
        onSelect?.();
      }}
      className={className}
    >
      <Body hint={hint}>{selected ? "✓ " : null}{children}</Body>
    </button>
  );
}

/** A heading block at the top of a menu (the account menu's name and role). */
export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="-mt-1.5 mb-1.5 border-b border-hairline px-3.5 pt-2.5 pb-2">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-hairline" />;
}

/** For items that render their own control (a form button such as Lock or Sign out): closes the menu after a click. */
export function useMenuClose() {
  return useContext(MenuContext).close;
}

export const menuItemClass = item;
