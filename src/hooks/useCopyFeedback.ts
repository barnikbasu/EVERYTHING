import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyFeedback(timeoutMs = 1600) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copyText = useCallback(
    async (text: string, key = 'default') => {
      if (!text || !navigator.clipboard?.writeText) return false;
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          setCopiedKey((curr) => (curr === key ? null : curr));
        }, timeoutMs);
        return true;
      } catch {
        return false;
      }
    },
    [timeoutMs]
  );

  return { copiedKey, copyText };
}
