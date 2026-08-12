// Bundle entry for the workbench. Kept separate from `main.ts` so the CSS
// import lands before any workbench module runs and the splash is styled on
// the very first paint.
import "./workbench.css";
import "./main";
