import { useMemo, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { searchBlocks, type SearchRow } from "../lib/search";

interface Props {
  rows: SearchRow[];
  onSelect: (row: SearchRow) => void;
}

export function SearchBox({ rows, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBlocks(rows, query), [rows, query]);

  return (
    // We filter ourselves; disable cmdk's built-in filtering.
    <Command shouldFilter={false} className="w-full">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search block, street, or postal…"
      />
      <CommandList>
        {query.trim() !== "" && results.length === 0 && (
          <CommandEmpty className="px-3 py-2 text-slate-500">No matches</CommandEmpty>
        )}
        {results.map((r) => (
          <CommandItem key={r.id} value={r.id} onSelect={() => onSelect(r)}>
            {r.blk_no} {r.street_full} {r.postal}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
