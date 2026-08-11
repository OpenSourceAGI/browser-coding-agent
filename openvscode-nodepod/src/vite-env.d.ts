/// <reference types="vite/client" />

// `?worker` imports are a Vite transform, so TypeScript needs to be told what
// they resolve to. Vite's own client types only cover relative specifiers.
declare module "*?worker" {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
