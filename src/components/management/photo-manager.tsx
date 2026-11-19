"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { keepValues } from "@/lib/forms";
import { MAX_IMAGE_BYTES } from "@/lib/images";
import { cn } from "@/lib/utils/cn";
import {
  deleteCategoryPhoto,
  deleteSitePhoto,
  moveCategoryPhoto,
  setCoverPhoto,
  updatePhotoAlt,
  uploadCategoryPhoto,
  uploadSitePhoto,
} from "@/server/photos";
import { ActionButton } from "./action-form";

export type ManagedPhoto = { id: string; url: string; alt: string; isCover?: boolean; group?: string };

type Action = (p: ActionResult | null, f: FormData) => Promise<ActionResult>;

/** Upload form with a local preview and client-side size/type hints (the server re-checks). */
export function UploadForm({
  action,
  hidden,
  groups,
  label = "Upload photo",
}: {
  action: Action;
  hidden: Record<string, string>;
  groups?: readonly string[];
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        keepValues(formAction)(e);
        setPreview(null);
        (e.currentTarget as HTMLFormElement).reset();
      }}
      className="space-y-3"
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500 hover:border-navy-400 hover:bg-ivory-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="" className="max-h-40 rounded object-contain" />
        ) : (
          <ImagePlus className="size-8 text-ink-400" strokeWidth={1.5} aria-hidden />
        )}
        <span><span className="font-medium text-navy-800">Choose a photo</span> · JPG, PNG or WebP, up to 5 MB</span>
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setHint(f && f.size > MAX_IMAGE_BYTES ? "This photo is over 5 MB and will be refused. Export a smaller version." : null);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>
      {hint ? <p className="text-sm text-warning-700">{hint}</p> : null}
      <div className={cn("grid gap-3", groups ? "sm:grid-cols-[1fr_12rem]" : "")}>
        <Field label="Describe the photo" htmlFor={`alt-${Object.values(hidden).join("-")}`} hint="Read aloud to visitors using screen readers, e.g. “Deluxe room with king bed and city view”.">
          <Input id={`alt-${Object.values(hidden).join("-")}`} name="altText" required minLength={3} maxLength={200} />
        </Field>
        {groups ? (
          <Field label="Gallery section" htmlFor="galleryGroup">
            <Select id="galleryGroup" name="galleryGroup" defaultValue={groups[0]}>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Photo uploaded. The website shows it now.</FormMessage> : null}
      <Button type="submit" variant="secondary" pending={pending}>{label}</Button>
    </form>
  );
}

function AltEditor({ photo, kind }: { photo: ManagedPhoto; kind: "room" | "site" }) {
  const [state, action, pending] = useActionState(updatePhotoAlt, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex gap-1.5">
      <input type="hidden" name="photoId" value={photo.id} />
      <input type="hidden" name="kind" value={kind} />
      <label className="sr-only" htmlFor={`alt-edit-${photo.id}`}>Photo description</label>
      <Input id={`alt-edit-${photo.id}`} name="altText" defaultValue={photo.alt} className="h-8 text-xs" maxLength={200} />
      <Button type="submit" size="sm" variant="ghost" pending={pending}>Save</Button>
      {state && !state.ok ? <span role="alert" className="text-xs text-danger-700">{state.message}</span> : null}
    </form>
  );
}

/** All photos of one room type: cover, order, descriptions, delete, upload. */
export function CategoryPhotoManager({ categoryId, photos }: { categoryId: string; photos: ManagedPhoto[] }) {
  return (
    <div className="space-y-6">
      {photos.length === 0 ? (
        <p className="text-sm text-ink-500">No photos yet. The website shows a branded placeholder until you add one. The first photo becomes the cover.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-md border border-ivory-200 bg-white">
              <div className="relative aspect-[4/3] bg-ivory-200">
                <Image src={p.url} alt={p.alt} fill sizes="(min-width: 1280px) 20vw, 50vw" className="object-cover" />
                {p.isCover ? <span className="absolute top-2 left-2 rounded-full bg-gold-400 px-2 py-0.5 text-xs font-semibold text-navy-950">Cover</span> : null}
              </div>
              <div className="space-y-2 p-3">
                <AltEditor photo={p} kind="room" />
                <div className="flex flex-wrap items-center gap-1">
                  {!p.isCover ? (
                    <ActionButton action={setCoverPhoto} fields={{ photoId: p.id }} size="sm" variant="ghost"><Star className="size-3.5" aria-hidden /> Make cover</ActionButton>
                  ) : null}
                  {i > 0 ? <ActionButton action={moveCategoryPhoto} fields={{ photoId: p.id, direction: "up" }} size="sm" variant="ghost"><ArrowUp className="size-3.5" aria-label="Move earlier" /></ActionButton> : null}
                  {i < photos.length - 1 ? <ActionButton action={moveCategoryPhoto} fields={{ photoId: p.id, direction: "down" }} size="sm" variant="ghost"><ArrowDown className="size-3.5" aria-label="Move later" /></ActionButton> : null}
                  <ActionButton action={deleteCategoryPhoto} fields={{ photoId: p.id }} size="sm" variant="ghost" confirm="Delete this photo from the website?" className="ml-auto">
                    <Trash2 className="size-3.5 text-danger-700" aria-label="Delete photo" />
                  </ActionButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl">
        <UploadForm action={uploadCategoryPhoto} hidden={{ categoryId }} label="Upload photo" />
      </div>
    </div>
  );
}

/** One website photo place (hero, pool, ...): current photo, brief, replace/remove. */
export function SitePhotoSlot({
  slot,
  label,
  where,
  shape,
  shot,
  photo,
}: {
  slot: string;
  label: string;
  where: string;
  shape: string;
  shot: string;
  photo?: ManagedPhoto;
}) {
  return (
    <div className="grid gap-5 border-b border-ivory-200 p-5 last:border-0 md:grid-cols-[16rem_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-ivory-200">
        {photo ? (
          <Image src={photo.url} alt={photo.alt} fill sizes="16rem" className="object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-500">No photo yet</span>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="font-medium text-ink-900">{label}</h3>
          <p className="text-xs text-ink-500">{where} · {shape}</p>
          <p className="mt-2 rounded-md bg-gold-50 px-3 py-2 text-sm text-ink-700"><span className="font-medium">The shot: </span>{shot}</p>
        </div>
        {photo ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-64 flex-1"><AltEditor photo={photo} kind="site" /></div>
            <ActionButton action={deleteSitePhoto} fields={{ photoId: photo.id }} size="sm" variant="ghost" confirm="Remove this photo from the website?">
              <Trash2 className="size-3.5 text-danger-700" aria-hidden /> Remove
            </ActionButton>
          </div>
        ) : null}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-navy-800">{photo ? "Replace photo" : "Upload photo"}</summary>
          <div className="mt-3"><UploadForm action={uploadSitePhoto} hidden={{ slot }} label={photo ? "Replace" : "Upload"} /></div>
        </details>
      </div>
    </div>
  );
}

export function GalleryManager({ photos, groups }: { photos: ManagedPhoto[]; groups: readonly string[] }) {
  return (
    <div className="space-y-6 p-5">
      {photos.length === 0 ? <p className="text-sm text-ink-500">No gallery photos yet. Room-type photos also appear in the gallery automatically.</p> : null}
      {groups.map((g) => {
        const inGroup = photos.filter((p) => p.group === g);
        return inGroup.length ? (
          <section key={g}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">{g}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
              {inGroup.map((p) => (
                <li key={p.id} className="group relative aspect-square overflow-hidden rounded-md bg-ivory-200">
                  <Image src={p.url} alt={p.alt} fill sizes="12rem" className="object-cover" />
                  <div className="absolute right-1 bottom-1">
                    <ActionButton action={deleteSitePhoto} fields={{ photoId: p.id }} size="sm" variant="secondary" confirm="Remove this photo from the gallery?">
                      <Trash2 className="size-3.5 text-danger-700" aria-label="Remove from gallery" />
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
      <div className="max-w-xl border-t border-ivory-200 pt-5">
        <UploadForm action={uploadSitePhoto} hidden={{ slot: "gallery" }} groups={groups} label="Add to gallery" />
      </div>
    </div>
  );
}
