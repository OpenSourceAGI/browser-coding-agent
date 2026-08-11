import {
  attachPart,
  isPartVisibile,
  onPartVisibilityChange,
} from "@codingame/monaco-vscode-views-service-override";
import { Parts } from "@codingame/monaco-vscode-api/vscode/vs/workbench/services/layout/browser/layoutService";
import type { IDisposable } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
import { toDisposable } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";

interface PartBinding {
  part: Parts;
  selector: string;
  /** CSS variable driving this part's grid track, if it has one. */
  sizeVar?: string;
  defaultSize?: number;
}

const PARTS: PartBinding[] = [
  {
    part: Parts.TITLEBAR_PART,
    selector: "#ovn-titlebar",
    sizeVar: "--ovn-titlebar-height",
    defaultSize: 35,
  },
  {
    part: Parts.BANNER_PART,
    selector: "#ovn-banner",
    sizeVar: "--ovn-banner-height",
    defaultSize: 26,
  },
  {
    part: Parts.ACTIVITYBAR_PART,
    selector: "#ovn-activitybar",
    sizeVar: "--ovn-activitybar-width",
    defaultSize: 48,
  },
  {
    part: Parts.SIDEBAR_PART,
    selector: "#ovn-sidebar",
    sizeVar: "--ovn-sidebar-width",
    defaultSize: 300,
  },
  { part: Parts.EDITOR_PART, selector: "#ovn-editor" },
  {
    part: Parts.PANEL_PART,
    selector: "#ovn-panel",
    sizeVar: "--ovn-panel-height",
    defaultSize: 280,
  },
  {
    part: Parts.AUXILIARYBAR_PART,
    selector: "#ovn-auxiliarybar",
    sizeVar: "--ovn-auxiliarybar-width",
    defaultSize: 300,
  },
  {
    part: Parts.STATUSBAR_PART,
    selector: "#ovn-statusbar",
    sizeVar: "--ovn-statusbar-height",
    defaultSize: 22,
  },
];

/**
 * Mount VS Code's workbench parts into the page shell.
 *
 * The layout service tracks whether a part is *visible*, but in an embedded
 * workbench the host owns the geometry. So each part's grid track is driven by
 * a CSS variable that we collapse to zero when the part hides — otherwise the
 * grid keeps a gap where the sidebar or panel used to be.
 */
export function mountWorkbenchParts(): IDisposable[] {
  const root = document.querySelector<HTMLElement>("#ovn-workbench");
  if (!root) throw new Error("#ovn-workbench container is missing");

  const disposables: IDisposable[] = [];
  const sizes = new Map<string, number>();

  for (const { part, selector, sizeVar, defaultSize } of PARTS) {
    const container = document.querySelector<HTMLElement>(selector);
    if (!container) {
      console.warn(`[openvscode-nodepod] missing container for ${part}`);
      continue;
    }

    // Which parts exist depends on which service overrides are loaded, and
    // `attachPart` throws for one that was never registered. A missing
    // optional part (this build ships no title bar, banner, or status bar)
    // must not take down the whole IDE.
    try {
      disposables.push(attachPart(part, container));
    } catch {
      console.warn(`[openvscode-nodepod] part not available: ${part}`);
      if (sizeVar) root.style.setProperty(sizeVar, "0px");
      continue;
    }

    if (!sizeVar || defaultSize === undefined) continue;
    sizes.set(sizeVar, defaultSize);

    const applyVisibility = (visible: boolean) => {
      root.style.setProperty(
        sizeVar,
        visible ? `${sizes.get(sizeVar) ?? defaultSize}px` : "0px",
      );
    };
    applyVisibility(isPartVisibile(part));
    disposables.push(onPartVisibilityChange(part, applyVisibility));
  }

  disposables.push(
    installResizeHandle(root, "#ovn-sidebar-sash", "--ovn-sidebar-width", {
      axis: "x",
      min: 170,
      max: 800,
      sizes,
    }),
    installResizeHandle(root, "#ovn-panel-sash", "--ovn-panel-height", {
      axis: "y",
      min: 80,
      max: 900,
      invert: true,
      sizes,
    }),
  );

  return disposables;
}

/**
 * A drag handle for one grid track.
 *
 * VS Code's own sashes live inside parts and only resize views within a part,
 * so the boundaries between parts need handles from the host.
 */
function installResizeHandle(
  root: HTMLElement,
  selector: string,
  sizeVar: string,
  opts: {
    axis: "x" | "y";
    min: number;
    max: number;
    /** True when dragging toward the origin should grow the track. */
    invert?: boolean;
    sizes: Map<string, number>;
  },
): IDisposable {
  const handle = document.querySelector<HTMLElement>(selector);
  if (!handle) return toDisposable(() => {});

  let startPos = 0;
  let startSize = 0;
  let pointerId: number | null = null;

  const current = () =>
    Number.parseFloat(
      getComputedStyle(root).getPropertyValue(sizeVar) || "0",
    ) || 0;

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId === null) return;
    const delta =
      (opts.axis === "x" ? event.clientX - startPos : event.clientY - startPos) *
      (opts.invert ? -1 : 1);
    const next = Math.min(opts.max, Math.max(opts.min, startSize + delta));
    opts.sizes.set(sizeVar, next);
    root.style.setProperty(sizeVar, `${next}px`);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pointerId === null) return;
    handle.releasePointerCapture(event.pointerId);
    pointerId = null;
    document.body.style.userSelect = "";
  };

  const onPointerDown = (event: PointerEvent) => {
    pointerId = event.pointerId;
    startPos = opts.axis === "x" ? event.clientX : event.clientY;
    startSize = current();
    handle.setPointerCapture(event.pointerId);
    // Without this, dragging selects text across the whole workbench.
    document.body.style.userSelect = "none";
    event.preventDefault();
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerUp);

  return toDisposable(() => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
    handle.removeEventListener("pointercancel", onPointerUp);
  });
}
