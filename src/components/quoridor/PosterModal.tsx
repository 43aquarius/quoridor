"use client";

/* 棋谱海报弹窗：全部着法排成诗歌般的文字版画，叠印双方棋色。
 * Canvas 渲染 → 预览 → 下载 PNG / 系统分享。
 */

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { skinById } from "@/lib/game/types";
import { generatePosterPng, posterFileName } from "@/lib/game/poster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function PosterModal() {
  const open = useQuoridor((s) => s.posterOpen);
  const entry = useQuoridor((s) => s.posterEntry);
  const skin = useQuoridor((s) => s.skin);
  const closePoster = useQuoridor((s) => s.closePoster);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    let objectUrl: string | null = null;
    let alive = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      setUrl(null);
      const blob = await generatePosterPng(entry, skinById(skin));
      if (!alive || !blob) {
        setBusy(false);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setBusy(false);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, entry, skin]);

  const download = async () => {
    if (!entry) return;
    const blob = await generatePosterPng(entry, skinById(skin));
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = posterFileName(entry);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const share = async () => {
    if (!entry) return;
    const blob = await generatePosterPng(entry, skinById(skin));
    if (!blob) return;
    const file = new File([blob], posterFileName(entry), { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({
          files: [file],
          title: "步步为营 · 棋谱海报",
          text: `一局 ${entry.moveCount} 手的对弈，排成了一张印刷品。`,
        });
      } catch {
        /* 用户取消分享 */
      }
    } else {
      void download();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closePoster()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-2 border-ink bg-paper sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-black">棋谱海报 · 印张预览</DialogTitle>
          <DialogDescription className="font-mono text-xs leading-relaxed text-ink/60">
            全部着法记录排成一幅文字版画：着法编号构成诗行，双方棋色叠印其上。
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-[320px] items-center justify-center border border-ink/40 bg-ink/[0.03] p-3">
          {busy && (
            <p className="thinking-dots font-mono text-xs tracking-[0.3em] text-ink/60">
              正在拼版排版……
            </p>
          )}
          {url && (
            <img
              src={url}
              alt="棋谱海报预览"
              className="block h-auto max-h-[62svh] w-full border border-ink/30 object-contain"
            />
          )}
          {!busy && !url && (
            <p className="font-mono text-xs text-ink/50">海报生成失败，请重试。</p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            className="gap-2 border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
            onClick={share}
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden />
            分享
          </Button>
          <Button
            className="gap-2 bg-ink font-mono text-xs text-paper hover:bg-ink/85"
            onClick={download}
            disabled={busy || !url}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            下载 PNG
          </Button>
        </div>

        <button
          type="button"
          aria-label="关闭海报预览"
          className="absolute right-4 top-4"
          onClick={closePoster}
        >
          <X className="h-4 w-4 text-ink/60" aria-hidden />
        </button>
      </DialogContent>
    </Dialog>
  );
}
