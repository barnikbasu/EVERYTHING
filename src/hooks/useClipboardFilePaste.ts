import { useEffect, useRef } from 'react';

export function useClipboardFilePaste(
  onFilesPasted: (files: File[]) => void,
  options?: { enabled?: boolean; ignoreInputs?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const ignoreInputs = options?.ignoreInputs ?? true;
  const callbackRef = useRef(onFilesPasted);
  callbackRef.current = onFilesPasted;

  useEffect(() => {
    if (!enabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (ignoreInputs) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return;
        }
      }

      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        e.preventDefault();
        callbackRef.current(Array.from(items));
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [enabled, ignoreInputs]);
}
