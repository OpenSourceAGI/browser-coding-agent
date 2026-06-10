// PreviewManager tests: server-ready routing into an iframe-like target,
// port queries, refresh, and preview script injection (plan steps 1.4 / 4.2).

import { describe, it, expect, vi } from "vitest";
import { PreviewManager } from "../preview-manager";
import { FakeNodepodHost } from "./fake-host";

describe("PreviewManager", () => {
  it("tracks servers announced before the host is bound", () => {
    const previews = new PreviewManager();
    previews.notifyServerReady(3000, "https://x/__virtual__/p/3000/");
    expect(previews.urlFor(3000)).toBe("https://x/__virtual__/p/3000/");
    expect(previews.servers()).toEqual([
      { port: 3000, url: "https://x/__virtual__/p/3000/" },
    ]);
  });

  it("prefers the live host answer for urlFor", () => {
    const host = new FakeNodepodHost();
    const previews = new PreviewManager(host);
    const url = host.listen(3000);
    expect(previews.urlFor(3000)).toBe(url);
    expect(previews.urlFor(9999)).toBeNull();
  });

  it("auto-opens the first ready server into an attached target", () => {
    const previews = new PreviewManager();
    const target = { src: "" };
    previews.attach(target);
    previews.notifyServerReady(3000, "https://x/3000/");
    expect(target.src).toBe("https://x/3000/");
    expect(previews.activePort).toBe(3000);

    // a second server does not steal the active preview
    previews.notifyServerReady(4000, "https://x/4000/");
    expect(target.src).toBe("https://x/3000/");
  });

  it("auto-opens on attach when a server is already ready", () => {
    const previews = new PreviewManager();
    previews.notifyServerReady(3000, "https://x/3000/");
    const target = { src: "" };
    previews.attach(target);
    expect(target.src).toBe("https://x/3000/");
  });

  it("respects autoOpen: false", () => {
    const previews = new PreviewManager(undefined, { autoOpen: false });
    const target = { src: "" };
    previews.attach(target);
    previews.notifyServerReady(3000, "https://x/3000/");
    expect(target.src).toBe("");
    expect(previews.open(3000)).toBe(true);
    expect(target.src).toBe("https://x/3000/");
  });

  it("refresh re-navigates the active server and open switches ports", () => {
    const previews = new PreviewManager();
    const target = { src: "" };
    previews.attach(target);
    previews.notifyServerReady(3000, "https://x/3000/");
    previews.notifyServerReady(4000, "https://x/4000/");

    expect(previews.open(4000)).toBe(true);
    expect(target.src).toBe("https://x/4000/");

    target.src = "mutated-by-navigation";
    expect(previews.refresh()).toBe(true);
    expect(target.src).toBe("https://x/4000/");
  });

  it("emits server-ready, navigate and server-closed events", () => {
    const previews = new PreviewManager();
    const ready = vi.fn();
    const closed = vi.fn();
    const navigate = vi.fn();
    previews.on("server-ready", ready);
    previews.on("server-closed", closed);
    const offNavigate = previews.on("navigate", navigate);

    const target = { src: "" };
    previews.attach(target);
    previews.notifyServerReady(3000, "https://x/3000/");
    previews.notifyServerClosed(3000);

    expect(ready).toHaveBeenCalledWith({ port: 3000, url: "https://x/3000/" });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith({ port: 3000, url: "https://x/3000/" });
    expect(previews.activePort).toBeNull();
    expect(previews.servers()).toEqual([]);

    offNavigate();
    previews.notifyServerReady(5000, "https://x/5000/");
    previews.open(5000);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("delegates preview script injection to the host", async () => {
    const host = new FakeNodepodHost();
    const previews = new PreviewManager();
    await expect(previews.setPreviewScript("x")).rejects.toThrow(/no host/);

    previews.bindHost(host);
    await previews.setPreviewScript("window.__ide__ = true;");
    expect(host.previewScript).toBe("window.__ide__ = true;");
    await previews.clearPreviewScript();
    expect(host.previewScript).toBeNull();
  });
});
