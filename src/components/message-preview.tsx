"use client";

import type { ReactNode } from "react";

// Renders WhatsApp-style formatting: *bold*, _italic_, ~strike~, ```mono```. Output is React text nodes only.
function formatLine(line: string, key: number): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g;
  let last = 0;
  let i = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) parts.push(line.slice(last, m.index));
    const tok = m[0];
    const inner = tok.startsWith("```") ? tok.slice(3, -3) : tok.slice(1, -1);
    if (tok.startsWith("*")) parts.push(<strong key={i++}>{inner}</strong>);
    else if (tok.startsWith("_")) parts.push(<em key={i++}>{inner}</em>);
    else if (tok.startsWith("~")) parts.push(<s key={i++}>{inner}</s>);
    else parts.push(<code key={i++} className="font-mono text-[0.85em]">{inner}</code>);
    last = m.index! + tok.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return <span key={key}>{parts}{"\n"}</span>;
}

export function MessagePreview({ text, imageUrl, recipient }: { text: string; imageUrl?: string | null; recipient?: string }) {
  return (
    <div className="rounded-xl bg-[#efeae2] p-3 sm:p-4">
      {recipient && <p className="mb-2 text-center text-[11px] font-medium text-slate-500">To {recipient}</p>}
      <div className="ml-auto w-fit max-w-[90%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1 shadow-sm">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mb-1 max-h-72 w-full rounded-md object-cover" />
        )}
        {text ? (
          <p className="whitespace-pre-wrap break-words px-1.5 pb-1 pt-0.5 text-[14px] leading-snug text-slate-900">
            {text.split("\n").map(formatLine)}
          </p>
        ) : (
          !imageUrl && <p className="px-2 py-1 text-sm italic text-slate-400">Message is empty</p>
        )}
        <p className="px-1.5 pb-0.5 text-right text-[10px] text-slate-500">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
        </p>
      </div>
    </div>
  );
}
