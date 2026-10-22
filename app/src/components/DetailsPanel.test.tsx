import { createRef, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GetBlockDetail } from "../lib/data";
import {
  DetailsContent,
  DetailsPanel,
  useBlockDetail,
  type DetailsPanelHandle,
} from "./DetailsPanel";
import { renderHook } from "@testing-library/react";
import { sampleShard } from "../test/fixtures";
import { useColorMode } from "../store/color";

const panelProps = {
  selectedId: "123-ang-mo-kio-ave-3",
  selectedTown: "ANG MO KIO",
  snapPoints: ["88px", 0.5, 1] as (string | number)[],
  activeSnap: 0.5 as string | number | null,
  onSnapChange: () => {},
};

// Mirrors App, which owns open/close, so the close controls drive onOpenChange.
function ControlledPanel({
  getBlockDetail,
  isDesktop,
}: {
  getBlockDetail: GetBlockDetail;
  isDesktop: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <DetailsPanel
      {...panelProps}
      getBlockDetail={getBlockDetail}
      isDesktop={isDesktop}
      open={open}
      onOpenChange={setOpen}
      onClose={() => setGone(true)}
    />
  );
}

test("DetailsContent renders header, fields, and Sold/Rental groups", () => {
  render(<DetailsContent detail={sampleShard["123-ang-mo-kio-ave-3"]} />);
  expect(
    screen.getByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" }),
  ).toBeInTheDocument();
  expect(screen.getByText("1978")).toBeInTheDocument();
  expect(screen.getByText("Sold")).toBeInTheDocument();
  expect(screen.getByText(/3-Room/)).toBeInTheDocument();
  expect(screen.getByText("Rental")).toBeInTheDocument();
});

test("DetailsContent omits the Rental group when there is no rental", () => {
  const detail = { ...sampleShard["123-ang-mo-kio-ave-3"], rental_units_by_type: undefined };
  render(<DetailsContent detail={detail} />);
  expect(screen.queryByText("Rental")).not.toBeInTheDocument();
});

afterEach(() => useColorMode.getState().setMode("none"));

// The <div> holding a field's <dt> label and <dd> value.
function field(label: string) {
  return screen.getByText(label, { selector: "dt" }).parentElement!;
}

test("no band swatch while coloring is off", () => {
  render(<DetailsContent detail={sampleShard["123-ang-mo-kio-ave-3"]} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("year coloring puts the block's band swatch on the year row only", () => {
  act(() => useColorMode.getState().setMode("year"));
  render(<DetailsContent detail={sampleShard["123-ang-mo-kio-ave-3"]} />);
  const swatch = within(field("Year completed")).getByRole("img", { name: "Before 1980" });
  expect(swatch).toHaveStyle({ backgroundColor: "#c7e9b4" });
  expect(within(field("Floors")).queryByRole("img")).not.toBeInTheDocument();
});

test("floors coloring puts the block's band swatch on the floors row", () => {
  act(() => useColorMode.getState().setMode("floors"));
  render(<DetailsContent detail={sampleShard["123-ang-mo-kio-ave-3"]} />);
  expect(within(field("Floors")).getByRole("img", { name: "10 to 12" })).toBeInTheDocument();
  expect(within(field("Year completed")).queryByRole("img")).not.toBeInTheDocument();
});

const outram = {
  id: "outram-park",
  name: "Outram Park",
  codes: ["EW16", "NE3", "TE17"],
  exit: "Exit 5",
  distance: 176,
};
const threeStations = {
  ...sampleShard["123-ang-mo-kio-ave-3"],
  nearest_stations: [
    outram,
    { id: "tanjong-pagar", name: "Tanjong Pagar", codes: ["EW15"], exit: "Exit A", distance: 640 },
    { id: "maxwell", name: "Maxwell", codes: ["TE18"], exit: "Exit 2", distance: 1000 },
  ],
};

function stationRows() {
  return within(screen.getByRole("list", { name: "Nearest MRT" })).getAllByRole("listitem");
}

test.each([
  ["one station", { ...sampleShard["123-ang-mo-kio-ave-3"], nearest_stations: [outram] }, 1],
  ["three stations", threeStations, 3],
])("the Nearest MRT heading names the list with %s", (_, detail, rows) => {
  render(<DetailsContent detail={detail} />);
  expect(screen.getByRole("heading", { level: 3, name: "Nearest MRT" })).toBeInTheDocument();
  expect(stationRows()).toHaveLength(rows);
});

test("each station row names the station, a chip per line, the exit and the distance", () => {
  render(<DetailsContent detail={threeStations} />);
  const [first, second, third] = stationRows();
  expect(first).toHaveTextContent(/^Outram Park/);
  expect(
    within(first)
      .getAllByText(/^(EW16|NE3|TE17)$/)
      .map((c) => c.textContent),
  ).toEqual(["EW16", "NE3", "TE17"]);
  expect(within(first).getByText("NE3")).toHaveStyle({ backgroundColor: "#9900aa" });
  expect(first).toHaveTextContent(/· Exit 5\s*176 m$/);
  expect(second).toHaveTextContent(/^Tanjong Pagar\s*EW15\s*· Exit A\s*640 m$/);
  expect(third).toHaveTextContent(/^Maxwell\s*TE18\s*· Exit 2\s*1\.0 km$/);
});

test("MRT coloring puts one band swatch after the first distance, a blank on the others", () => {
  act(() => useColorMode.getState().setMode("mrt"));
  render(<DetailsContent detail={threeStations} />);
  const [first, ...others] = stationRows();
  const swatch = within(first).getByRole("img", { name: "Under 200 m" });
  expect(swatch).toHaveStyle({ backgroundColor: "#005a32" });
  expect(screen.getAllByRole("img")).toEqual([swatch]);
  for (const row of others) {
    expect(row.querySelectorAll("[aria-hidden='true']")).toHaveLength(1);
  }
});

test("other modes leave the station rows without a swatch or a blank", () => {
  act(() => useColorMode.getState().setMode("year"));
  render(<DetailsContent detail={threeStations} />);
  for (const row of stationRows()) {
    expect(within(row).queryByRole("img")).not.toBeInTheDocument();
    expect(row.querySelector("[aria-hidden='true']")).toBeNull();
  }
});

test("useBlockDetail: loading -> ready", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const { result } = renderHook(() => useBlockDetail("123-ang-mo-kio-ave-3", "ANG MO KIO", get));
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.detail?.year_completed).toBe(1978);
});

test("useBlockDetail: missing record -> empty", async () => {
  const get = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useBlockDetail("nope", "ANG MO KIO", get));
  await waitFor(() => expect(result.current.status).toBe("empty"));
});

test("desktop panel renders details and dismisses on the Close control", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  render(<ControlledPanel getBlockDetail={get} isDesktop />);

  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });
  await userEvent.click(screen.getByRole("button", { name: /close/i }));

  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ }),
    ).not.toBeInTheDocument(),
  );
});

test("imperative close() on desktop dismisses via the controlled open prop", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const onOpenChange = vi.fn();
  const ref = createRef<DetailsPanelHandle>();
  render(
    <DetailsPanel
      {...panelProps}
      getBlockDetail={get}
      isDesktop
      open
      onOpenChange={onOpenChange}
      onClose={() => {}}
      ref={ref}
    />,
  );
  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });

  ref.current?.close();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("imperative close() on mobile dismisses via the drawer Close control", async () => {
  // Regression: closing Vaul via the controlled prop skips onClose, so the marker stayed
  // selected. The mobile close must click its own Close control.
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const ref = createRef<DetailsPanelHandle>();
  render(
    <DetailsPanel
      {...panelProps}
      getBlockDetail={get}
      isDesktop={false}
      open
      onOpenChange={() => {}}
      onClose={() => {}}
      ref={ref}
    />,
  );
  const closeBtn = await screen.findByRole("button", { name: /close/i });
  const clicked = vi.fn();
  closeBtn.addEventListener("click", clicked);

  ref.current?.close();
  expect(clicked).toHaveBeenCalledTimes(1);
});

test("desktop panel closes on Escape", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  render(<ControlledPanel getBlockDetail={get} isDesktop />);

  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });
  await userEvent.keyboard("{Escape}");

  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ }),
    ).not.toBeInTheDocument(),
  );
});
