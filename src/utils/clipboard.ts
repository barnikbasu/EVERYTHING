export async function readSupportedClipboardFiles(filenamePrefix = 'pasted_asset'): Promise<{
  files: File[];
  unsupportedError: string | null;
}> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    return {
      files: [],
      unsupportedError: 'Press Ctrl+V / Cmd+V anywhere on this page to paste a copied image or file.',
    };
  }

  try {
    const items = await navigator.clipboard.read();
    const pasted: File[] = [];
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/') || type === 'application/pdf') {
          const blob = await item.getType(type);
          const ext = type.split('/')[1] || 'png';
          pasted.push(new File([blob], `${filenamePrefix}_${Date.now()}.${ext}`, { type }));
        }
      }
    }
    if (pasted.length === 0) {
      return {
        files: [],
        unsupportedError: 'Clipboard does not contain an image or PDF. Copy an image first or press Ctrl+V.',
      };
    }
    return { files: pasted, unsupportedError: null };
  } catch {
    return {
      files: [],
      unsupportedError: 'Clipboard permission denied. Use Ctrl+V / Cmd+V or select a local file.',
    };
  }
}
