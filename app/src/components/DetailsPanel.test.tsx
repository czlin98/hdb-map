import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailsContent, DetailsPanel, useBlockDetail } from "./DetailsPanel";
import { renderHook } from "@testing-library/react";
import { sampleShard } from "../test/fixtures";

const panelProps = {
  selectedId: "123-ang-mo-kio-ave-3",
  selectedTown: "ANG MO KIO",
  open: true,
  snapPoints: ["88px", 0.5, 1] as (string | number)[],
  activeSnap: 0.5 as string | number | null,
  onSnapChange: () => {},
};

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

test("desktop panel renders details and Close requests the close (before clearing)", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const onRequestClose = vi.fn();
  const onClose = vi.fn();
  render(
    <DetailsPanel
      {...panelProps}
      getBlockDetail={get}
      isDesktop
      onRequestClose={onRequestClose}
      onClose={onClose}
    />,
  );

  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });
  await userEvent.click(screen.getByRole("button", { name: /close/i }));

  // The close is animated: it requests the close now, and clears only once the
  // slide-out animation ends (which jsdom does not fire), so onClose stays put.
  expect(onRequestClose).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("desktop panel closes on Escape", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const onRequestClose = vi.fn();
  render(
    <DetailsPanel
      {...panelProps}
      getBlockDetail={get}
      isDesktop
      onRequestClose={onRequestClose}
      onClose={() => {}}
    />,
  );

  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });
  await userEvent.keyboard("{Escape}");

  expect(onRequestClose).toHaveBeenCalledTimes(1);
});
