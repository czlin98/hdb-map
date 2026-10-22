// Official line colors by code prefix. Keep in step with OPEN_LINES in pipeline/src/config.py:
// a newly opened line needs its prefix there and a color here.
const LRT_GREY = "#748477";
const LINE_COLORS: Record<string, string> = {
  NS: "#d42e12",
  EW: "#009645",
  CG: "#009645",
  NE: "#9900aa",
  CC: "#fa9e0d",
  DT: "#005ec4",
  TE: "#9d5b25",
  BP: LRT_GREY,
  STC: LRT_GREY,
  SE: LRT_GREY,
  SW: LRT_GREY,
  PTC: LRT_GREY,
  PE: LRT_GREY,
  PW: LRT_GREY,
};

// The LRT lines are the ones that share the grey, so the table above is the one list of them.
export function isLrtOnly(codes: string[]): boolean {
  return codes.every((code) => LINE_COLORS[linePrefix(code)] === LRT_GREY);
}

function linePrefix(code: string): string {
  // Prefixes run two or three letters, and some codes have no number (STC, PTC).
  return /^[A-Z]+/.exec(code)?.[0] ?? "";
}

// White on the Circle Line's orange is only about 2:1 contrast.
const DARK_TEXT = new Set(["CC"]);

export function lineChipColors(code: string): { background: string; color: string } {
  const prefix = linePrefix(code);
  return {
    background: LINE_COLORS[prefix] ?? LRT_GREY,
    color: DARK_TEXT.has(prefix) ? "#1f2937" : "#ffffff",
  };
}
