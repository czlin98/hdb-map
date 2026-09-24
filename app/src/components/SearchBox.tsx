import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { searchBlocks, type SearchRow } from "../lib/search";

interface Props {
  rows: SearchRow[];
  onSelect: (row: SearchRow) => void;
  // Ref onto the search input; the map measures its bottom edge to pad the fly-to
  // so a selected marker stays clear of the search box.
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchBox({ rows, onSelect, inputRef }: Props) {
  const [query, setQuery] = useState("");
  // The query outlives a pick so the user can reopen the same results and browse
  // neighbouring blocks; only the list's visibility is toggled.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchBlocks(rows, query), [rows, query]);
  const show = () => setOpen(true);

  // A tap or focus landing outside the box (the map, the details panel) dismisses the
  // list. The input's blur can't do this: a tap on a result blurs it before the click
  // lands, and tabbing out via the clear button leaves from the button, not the input.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  function handleSelect(row: SearchRow) {
    onSelect(row);
    setOpen(false);
  }

  return (
    // We filter ourselves; disable cmdk's built-in filtering.
    <Command ref={rootRef} shouldFilter={false} className="w-full">
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onClear={() => setQuery("")}
        onFocus={show}
        // Focus alone misses a re-click on an input that kept focus after an Enter pick.
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
            show();
          }
        }}
        placeholder="Search block, street, or postal…"
      />
      <CommandList>
        {open && query.trim() !== "" && (
          <>
            {results.length === 0 && (
              <CommandEmpty className="px-3 py-2 text-muted-foreground">No matches</CommandEmpty>
            )}
            {results.map((r) => (
              <CommandItem key={r.id} value={r.id} onSelect={() => handleSelect(r)}>
                {r.blk_no} {r.street_full} {r.postal}
              </CommandItem>
            ))}
          </>
        )}
      </CommandList>
    </Command>
  );
}
