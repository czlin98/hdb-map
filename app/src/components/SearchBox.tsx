import { useEffect, useMemo, useState, type Ref } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { searchBlocks, type SearchRow } from "../lib/search";

interface Props {
  rows: SearchRow[];
  onSelect: (row: SearchRow) => void;
  // Address of the current search-origin selection, echoed into the input. null
  // when nothing is selected or the selection came from a marker tap, so a map
  // click never clobbers the search field.
  selectedLabel?: string | null;
  // Clears the input and dismisses any open details panel.
  onClear?: () => void;
  // Ref onto the search input; the map measures its bottom edge to pad the fly-to
  // so a selected marker stays clear of the search box.
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchBox({ rows, onSelect, selectedLabel = null, onClear, inputRef }: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // True while `query` echoes a committed selection rather than a live search.
  // Editing clears it; until then the dropdown stays hidden so we don't re-list
  // the block the user already picked.
  const [reflecting, setReflecting] = useState(false);

  // Mirror the selection into the input: fill on a search selection, empty when
  // the selection is cleared (or replaced by a marker tap).
  useEffect(() => {
    if (selectedLabel) {
      setQuery(selectedLabel);
      setReflecting(true);
    } else {
      setReflecting((wasReflecting) => {
        if (wasReflecting) setQuery("");
        return false;
      });
    }
  }, [selectedLabel]);

  // Focus-gated: the dropdown shows only while the user is actively searching, so
  // clicking a marker (which blurs the input) tucks it away without losing text.
  const showResults = focused && !reflecting && query.trim() !== "";
  const results = useMemo(
    () => (showResults ? searchBlocks(rows, query) : []),
    [showResults, rows, query],
  );

  const handleClear = () => {
    setQuery("");
    setReflecting(false);
    onClear?.();
  };

  return (
    // We filter ourselves; disable cmdk's built-in filtering.
    <Command shouldFilter={false} className="w-full">
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          setReflecting(false);
        }}
        onFocus={(e) => {
          setFocused(true);
          // Select-all so one keystroke replaces the whole reflected address.
          if (reflecting) e.currentTarget.select();
        }}
        onBlur={() => setFocused(false)}
        onClear={handleClear}
        placeholder="Search block, street, or postal…"
      />
      {showResults && (
        // Keep focus on the input when a result is clicked, so the focus-gated
        // list doesn't unmount out from under the click.
        <CommandList onMouseDown={(e) => e.preventDefault()}>
          {results.length === 0 && (
            <CommandEmpty className="px-3 py-2 text-muted-foreground">No matches</CommandEmpty>
          )}
          {results.map((r) => (
            <CommandItem key={r.id} value={r.id} onSelect={() => onSelect(r)}>
              {r.blk_no} {r.street_full} {r.postal}
            </CommandItem>
          ))}
        </CommandList>
      )}
    </Command>
  );
}
