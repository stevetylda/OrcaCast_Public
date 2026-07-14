import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HashScrollHandler } from "./HashScrollHandler";

describe("HashScrollHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("scrolls after a lazy route renders the hash target", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    function TestApp({ visible }: { visible: boolean }) {
      return visible ? <section id="explore">Explore</section> : null;
    }

    const view = render(
      <MemoryRouter initialEntries={["/#explore"]}>
        <HashScrollHandler />
        <TestApp visible={false} />
      </MemoryRouter>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    view.rerender(
      <MemoryRouter initialEntries={["/#explore"]}>
        <HashScrollHandler />
        <TestApp visible />
      </MemoryRouter>,
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});
