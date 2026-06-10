// Tiny DOM construction helper shared by the IDE components. Components
// always create nodes through the document that owns their container, so
// they work in any window (popups, tests with a DOM shim).

export interface ElProps {
  className?: string;
  title?: string;
  textContent?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  spellcheck?: boolean;
  onClick?: (event: MouseEvent) => void;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: ElProps = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.title) node.title = props.title;
  if (props.textContent !== undefined) node.textContent = props.textContent;
  if (props.type !== undefined) (node as any).type = props.type;
  if (props.value !== undefined) (node as any).value = props.value;
  if (props.placeholder !== undefined) {
    (node as any).placeholder = props.placeholder;
  }
  if (props.spellcheck !== undefined) node.spellcheck = props.spellcheck;
  if (props.onClick) node.addEventListener("click", props.onClick as EventListener);
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      node.setAttribute(name, value);
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}
