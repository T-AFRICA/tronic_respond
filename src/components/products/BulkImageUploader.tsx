"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  matchImageFilenames,
  registerProductImage,
} from "@/app/dashboard/products/images/actions";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB per image
const CONCURRENCY = 3;

type Item = {
  file: File;
  previewUrl: string;
  sku: string;
  productId: string | null;
  productName: string | null;
  replaces: boolean;
  status: "pending" | "no_match" | "invalid" | "uploading" | "done" | "error";
  message?: string;
};

function sanitizeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function BulkImageUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"idle" | "matching" | "ready" | "uploading" | "finished">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setPhase("matching");

    const list = Array.from(files).slice(0, 200);
    const res = await matchImageFilenames(list.map((f) => f.name));
    if (!res.ok) {
      setError(res.error);
      setPhase("idle");
      return;
    }

    const next: Item[] = list.map((file) => {
      const match = res.matches.find((m) => m.filename === file.name)!;
      const invalid = !ACCEPTED.includes(file.type)
        ? "Only JPEG, PNG, WebP"
        : file.size > MAX_SIZE
          ? "Larger than 5 MB"
          : null;
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        sku: match.sku,
        productId: match.product_id,
        productName: match.product_name,
        replaces: match.replaces_existing,
        status: invalid ? "invalid" : match.product_id ? "pending" : "no_match",
        message: invalid ?? undefined,
      };
    });
    setItems(next);
    setPhase("ready");
  }

  async function uploadAll() {
    setPhase("uploading");
    const supabase = createSupabaseBrowserClient();
    const queue = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === "pending");

    let cursor = 0;
    const update = (index: number, patch: Partial<Item>) =>
      setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

    async function worker() {
      for (;;) {
        const my = cursor++;
        if (my >= queue.length) return;
        const { item, index } = queue[my];
        update(index, { status: "uploading" });

        const path = `${sanitizeKey(item.sku)}/${Date.now()}-${sanitizeKey(item.file.name)}`;
        const { error: upError } = await supabase.storage
          .from("product-images")
          .upload(path, item.file, {
            contentType: item.file.type,
            cacheControl: "31536000",
          });
        if (upError) {
          update(index, { status: "error", message: upError.message });
          continue;
        }

        const reg = await registerProductImage({
          product_id: item.productId!,
          storage_path: path,
          make_primary: true,
        });
        if (!reg.ok) {
          update(index, { status: "error", message: reg.error });
          continue;
        }
        update(index, { status: "done" });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );
    setPhase("finished");
    router.refresh();
  }

  const counts = {
    total: items.length,
    matched: items.filter((i) => ["pending", "uploading", "done", "error"].includes(i.status)).length,
    noMatch: items.filter((i) => i.status === "no_match").length,
    invalid: items.filter((i) => i.status === "invalid").length,
    done: items.filter((i) => i.status === "done").length,
    failed: items.filter((i) => i.status === "error").length,
  };
  const progress =
    counts.matched > 0 ? Math.round(((counts.done + counts.failed) / counts.matched) * 100) : 0;

  const STATUS_LABEL: Record<Item["status"], string> = {
    pending: "ready",
    no_match: "no matching SKU",
    invalid: "invalid file",
    uploading: "uploading…",
    done: "✓ uploaded",
    error: "failed",
  };
  const STATUS_CLASS: Record<Item["status"], string> = {
    pending: "text-charcoal-light",
    no_match: "text-amber-700",
    invalid: "text-tronic-red",
    uploading: "text-blue-700",
    done: "text-green-700",
    error: "text-tronic-red",
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Picker */}
      <div
        className="border-2 border-dashed border-neutral-border rounded-lg p-8 text-center bg-white cursor-pointer hover:border-charcoal-light"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFilesChosen(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          className="hidden"
          onChange={(e) => void onFilesChosen(e.target.files)}
        />
        <p className="text-sm font-semibold">
          Drop product images here, or click to choose
        </p>
        <p className="text-xs text-charcoal-light mt-1">
          Filename = SKU, e.g. <code>TS 5011-BK.jpg</code> matches product{" "}
          <code>TS 5011-BK</code>. JPEG / PNG / WebP, max 5 MB each, up to 200
          files per batch.
        </p>
      </div>

      {phase === "matching" && (
        <p className="text-sm text-charcoal-light">Matching filenames against SKUs…</p>
      )}

      {items.length > 0 && phase !== "matching" && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm">
              {counts.total} file(s) · <span className="text-green-700">{counts.matched} matched</span>
              {counts.noMatch > 0 && <span className="text-amber-700"> · {counts.noMatch} without SKU match</span>}
              {counts.invalid > 0 && <span className="text-tronic-red"> · {counts.invalid} invalid</span>}
            </p>
            {phase === "ready" && counts.matched > 0 && (
              <button
                onClick={() => void uploadAll()}
                className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-5 py-2"
              >
                Upload {counts.matched} image(s)
              </button>
            )}
            {phase === "uploading" && (
              <div className="flex items-center gap-2 min-w-48">
                <div className="flex-1 h-2 bg-neutral-bg rounded overflow-hidden">
                  <div className="h-full bg-tronic-red transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-charcoal-light">{progress}%</span>
              </div>
            )}
            {phase === "finished" && (
              <p className="text-sm font-semibold text-green-700">
                Done — {counts.done} uploaded{counts.failed > 0 && `, ${counts.failed} failed`}
              </p>
            )}
          </div>

          <div className="border border-neutral-border rounded-lg overflow-hidden bg-white">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>File</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="w-12">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="w-10 h-10 object-contain bg-neutral-bg rounded"
                      />
                    </td>
                    <td className="font-mono text-xs">{item.file.name}</td>
                    <td className="font-mono text-xs">{item.sku}</td>
                    <td className="text-sm">
                      {item.productName ?? <span className="text-amber-700">—</span>}
                      {item.replaces && item.productName && (
                        <span className="ml-2 text-[10px] uppercase text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                          replaces current
                        </span>
                      )}
                    </td>
                    <td className={`text-xs ${STATUS_CLASS[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                      {item.message && ` — ${item.message}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
