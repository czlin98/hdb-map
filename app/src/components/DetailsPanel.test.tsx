import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailsContent, DetailsPanel, useBlockDetail } from "./DetailsPanel";
import { renderHook } from "@testing-library/react";
import { sampleShard } from "../test/fixtures";

const panelProps = {
  selectedId: "123-ang-mo-kio-ave-3",
  selectedTown: "ANG MO KIO",
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

test("desktop panel renders details and Close begins the close (before clearing)", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const onBeginClose = vi.fn();
  const onClose = vi.fn();
  render(
    <DetailsPanel
      {...panelProps}
      getBlockDetail={get}
      isDesktop
      onBeginClose={onBeginClose}
      onClose={onClose}
    />,
  );

  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });
  await userEvent.click(screen.getByRole("button", { name: /close/i }));

  // The close is animated: it begins the close now, and clears only once the
  // slide-out animation ends (which jsdom does not fire), so onClose stays put.
  expect(onBeginClose).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("mobile drawer clears the selection after the slide-out when closed via the open prop", () => {
  vi.useFakeTimers();
  try {
    const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
    const onClose = vi.fn();
    const { rerender } = render(
      <DetailsPanel
        {...panelProps}
        getBlockDetail={get}
        isDesktop={false}
        open={true}
        onBeginClose={() => {}}
        onClose={onClose}
      />,
    );
    // Close the way an empty-map tap or the clear button does: flip the controlled
    // prop. Vaul won't fire its own onAnimationEnd for this, so the panel must
    // clear itself once the slide-out finishes.
    rerender(
      <DetailsPanel
        {...panelProps}
        getBlockDetail={get}
        isDesktop={false}
        open={false}
        onBeginClose={() => {}}
        onClose={onClose}
      />,
    );
    expect(onClose).not.toHaveBeenCalled(); // still animating out
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test("mobile drawer does not clear if it reopens before the slide-out finishes", () => {
  vi.useFakeTimers();
  try {
    const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
    const onClose = vi.fn();
    const props = {
      ...panelProps,
      getBlockDetail: get,
      isDesktop: false,
      onBeginClose: () => {},
      onClose,
    };
    const { rerender } = render(<DetailsPanel {...props} open={true} />);
    rerender(<DetailsPanel {...props} open={false} />); // begin close
    vi.advanceTimersByTime(200);
    rerender(<DetailsPanel {...props} open={true} />); // cancel-and-reopen
    vi.advanceTimersByTime(500);
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("desktop panel closes on Escape", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const onBeginClose = vi.fn();
  render(
    <DetailsPanel
      {...panelProps}
      getBlockDetail={get}
      isDesktop
      onBeginClose={onBeginClose}
      onClose={() => {}}
    />,
  );

  await screen.findByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" });
  await userEvent.keyboard("{Escape}");

  expect(onBeginClose).toHaveBeenCalledTimes(1);
});
