export let getInput = (form: HTMLFormElement, name: string = "text") => {
  let node = form.elements.namedItem(name);
  if (node instanceof HTMLInputElement) return node;
  return null;
};
