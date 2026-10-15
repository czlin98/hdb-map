// Vaul scrolls a sheet's body only at the top snap; below it a drag moves the sheet. Elsewhere,
// touch-none hands every drag to Vaul so the browser can't hijack it.
export function sheetBodyClass(fullyOpen: boolean): string {
  return fullyOpen
    ? "overflow-y-auto overscroll-contain touch-pan-y"
    : "overflow-hidden touch-none";
}
