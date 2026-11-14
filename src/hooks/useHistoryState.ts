import { useCallback, useState } from 'react';

interface HistoryStackState<T> {
  stack: T[];
  index: number;
}

export function useHistoryState<T>(initialValue: T, maxEntries = 30) {
  const [history, setHistory] = useState<HistoryStackState<T>>(() => ({
    stack: [initialValue],
    index: 0,
  }));

  const current = history.stack[history.index] ?? history.stack[0];
  const canUndo = history.index > 0;
  const canRedo = history.index < history.stack.length - 1;

  const push = useCallback(
    (updater: (prev: T) => T) => {
      setHistory((prev) => {
        const currVal = prev.stack[prev.index];
        const nextVal = updater(currVal);
        const sliced = prev.stack.slice(0, prev.index + 1);
        const nextStack = [...sliced, nextVal].slice(-maxEntries);
        return {
          stack: nextStack,
          index: nextStack.length - 1,
        };
      });
    },
    [maxEntries]
  );

  const reset = useCallback((value: T) => {
    setHistory({
      stack: [value],
      index: 0,
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => ({
      ...prev,
      index: Math.max(0, prev.index - 1),
    }));
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => ({
      ...prev,
      index: Math.min(prev.stack.length - 1, prev.index + 1),
    }));
  }, []);

  return {
    state: current,
    canUndo,
    canRedo,
    push,
    reset,
    undo,
    redo,
  };
}
