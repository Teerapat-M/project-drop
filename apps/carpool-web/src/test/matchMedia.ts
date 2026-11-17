export function mockMatchMedia(widthPx: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: widthPx });
  window.matchMedia = (query: string) => {
    const min = /min-width:\s*(\d+)/.exec(query);
    const max = /max-width:\s*(\d+)/.exec(query);
    let matches = true;
    if (min) matches = matches && widthPx >= Number(min[1]);
    if (max) matches = matches && widthPx <= Number(max[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  };
}
