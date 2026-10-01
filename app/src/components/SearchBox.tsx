import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { searchBlocks, type SearchRow } from "../lib/search";

interface Props {
  rows: SearchRow[];
  onSelect: (row: SearchRow) => void;
  // Escape in the box; the parent closes whatever the search opened (the details panel).
  onDismiss?: () => void;
  // The map measures the input's bottom edge to keep a flown-to marker clear of the box.
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchBox({ rows, onSelect, onDismiss, inputRef }: Props) {
  // The query outlives a pick so the user can reopen the same results and browse
  // neighbouring blocks; only the list's visibility toggles.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // cmdk's highlighted row, controlled only so it can be reset.
  const [active, setActive] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchBlocks(rows, query), [rows, query]);

  // cmdk won't scroll new results to the top: each edit clears the highlight (see
  // onValueChange), leaving it no row to scroll into view.
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  function openList() {
    if (open) return;
    setOpen(true);
    // cmdk only forgets a highlight when the *last* row unmounts, so a picked row would
    // stay highlighted on reopen.
    setActive("");
  }

  // The input's blur can't dismiss the list: a tap on a result blurs it before the click
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
    <Command
      ref={rootRef}
      shouldFilter={false}
      value={active}
      onValueChange={setActive}
      className="w-full"
    >
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          // cmdk scrolls the old highlighted row into view before it moves to the new first
          // result; if that row still matches but ranks lower, the list jumps down to it.
          setActive("");
          openList();
        }}
        onClear={() => setQuery("")}
        // Not on focus: returning to the tab refocuses the input and would pop the list open.
        onClick={openList}
        onKeyDown={(e) => {
          // One Escape backs all the way out (list, focus, details panel) but keeps the query.
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            e.currentTarget.blur();
            onDismiss?.();
          } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
            openList();
          }
        }}
        placeholder="Search block, street, or postal…"
        // The longest real query is 41 chars. Uncapped, a long paste of common words makes
        // every keystroke score thousands of them.
        maxLength={50}
      />
      <CommandList ref={listRef}>
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
