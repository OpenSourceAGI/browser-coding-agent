"use client";

const EXT_COLORS: Record<string, string> = {
  rs: "#dea584",
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#f7df1e",
  mjs: "#f7df1e",
  cjs: "#f7df1e",
  json: "#cbcb41",
  toml: "#9c4221",
  md: "#519aba",
  mdx: "#519aba",
  css: "#563d7c",
  scss: "#cd6799",
  less: "#1d365d",
  html: "#e34c26",
  htm: "#e34c26",
  xml: "#e37933",
  svg: "#ffb13b",
  py: "#3572a5",
  svelte: "#ff3e00",
  vue: "#41b883",
  yaml: "#cb171e",
  yml: "#cb171e",
  sh: "#89e051",
  bash: "#89e051",
  go: "#00add8",
  java: "#b07219",
  kt: "#a97bff",
  rb: "#cc342d",
  php: "#4f5d95",
  c: "#555555",
  h: "#555555",
  cpp: "#f34b7d",
  hpp: "#f34b7d",
  cs: "#178600",
  swift: "#f05138",
  sql: "#e38c00",
  graphql: "#e10098",
  gql: "#e10098",
  lock: "#555d6b",
  gitignore: "#f64d27",
  env: "#ecd53f",
};

const DEFAULT_COLOR = "#9ca3af";
const FOLDER_COLOR = "#e5c07b";
const FOLDER_OPEN_COLOR = "#e0a569";

export function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  const color = EXT_COLORS[ext] || DEFAULT_COLOR;

  // special file icons
  if (ext === "rs") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z"
          fill="none"
          stroke={color}
          strokeWidth="1.2"
        />
        <text x="4.5" y="11" fontSize="8" fill={color} fontWeight="bold" fontFamily="monospace">
          R
        </text>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 1.5h6.5L13 5v9.5H3z"
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M9.5 1.5V5H13" fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      {ext && (
        <text x="4" y="12" fontSize="5" fill={color} fontFamily="monospace">
          {ext.slice(0, 3)}
        </text>
      )}
    </svg>
  );
}

export function FolderIcon({
  open = false,
  size = 14,
}: {
  open?: boolean;
  size?: number;
}) {
  const color = open ? FOLDER_OPEN_COLOR : FOLDER_COLOR;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      {open ? (
        <>
          <path d="M1.5 3h4l1.5 1.5H14v1H2.5L1 12.5V3z" fill={color} opacity="0.3" />
          <path d="M2 5.5h12l-2 7H1.5z" fill={color} opacity="0.6" />
        </>
      ) : (
        <path d="M1.5 2.5h4l1.5 1.5h7v9h-13z" fill={color} opacity="0.5" />
      )}
    </svg>
  );
}
