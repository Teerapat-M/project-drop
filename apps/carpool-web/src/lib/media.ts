import { useEffect, useState } from 'react';

export const DESKTOP_MQ = '(min-width: 768px)';

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(DESKTOP_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return desktop;
}
