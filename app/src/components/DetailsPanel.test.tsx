import { render, screen, waitFor } from "@testing-library/react";
import { DetailsContent, useBlockDetail } from "./DetailsPanel";
import { renderHook } from "@testing-library/react";
import { sampleShard } from "../test/fixtures";

test("DetailsContent renders header, fields, and Sold/Rental groups", () => {
  render(<DetailsContent detail={sampleShard["123-ang-mo-kio-ave-3"]} />);
  expect(screen.getByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" })).toBeInTheDocument();
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
