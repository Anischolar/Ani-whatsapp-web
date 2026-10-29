"use client";

const DEFAULT_KEYS = ["name", "first_name", "phone"];

/** Clickable chips that insert {{placeholders}} at the textarea cursor. */
export function PlaceholderChips({ textareaId, value, onChange }: { textareaId: string; value: string; onChange: (v: string) => void }) {
  function insert(key: string) {
    const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const token = `{{${key}}}`;
    if (!el) return onChange(value + token);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span>Insert:</span>
      {DEFAULT_KEYS.map((k) => (
        <button key={k} type="button" onClick={() => insert(k)} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
          {`{{${k}}}`}
        </button>
      ))}
      <span className="basis-full sm:basis-auto">
        Custom CSV columns work too, e.g. <code>{"{{city}}"}</code>. Fallback: <code>{"{{name|there}}"}</code>. Formatting: *bold* _italic_ ~strike~
      </span>
    </div>
  );
}
