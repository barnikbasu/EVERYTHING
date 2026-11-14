import React from 'react';
import { ArrowDown, ArrowUp, RotateCw, Trash2 } from 'lucide-react';
import type { PdfPagePreview, PdfPageSpec } from '../../../engines/pdfEngine';

interface PdfThumbnailGridProps {
  previews: PdfPagePreview[];
  currentSpecs: PdfPageSpec[];
  onMoveSpec: (idx: number, dir: -1 | 1) => void;
  onRotateSpec: (idx: number) => void;
  onToggleDeleteSpec: (idx: number) => void;
}

export const PdfThumbnailGrid: React.FC<PdfThumbnailGridProps> = ({
  previews,
  currentSpecs,
  onMoveSpec,
  onRotateSpec,
  onToggleDeleteSpec,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {currentSpecs.map((spec, idx) => {
        const preview = previews[spec.originalIndex];
        if (!preview) return null;
        return (
          <div
            key={`${spec.originalIndex}-${idx}`}
            className={`bg-white border rounded-xl p-2.5 flex flex-col justify-between transition-opacity ${
              spec.deleted ? 'opacity-40 border-[#E5322D]' : 'border-[#E2E5EC]'
            }`}
          >
            <div className="aspect-[3/4] bg-[#F6F7F9] rounded-md overflow-hidden flex items-center justify-center">
              <img
                src={preview.thumbnailUrl}
                alt={`Page ${spec.originalIndex + 1}`}
                style={{ transform: `rotate(${spec.rotation}deg)` }}
                className="max-w-full max-h-full object-contain transition-transform"
              />
            </div>
            <div className="mt-2 pt-2 border-t border-[#F1F3F6] flex items-center justify-between gap-1">
              <span className="text-[11px] font-mono text-[#717782]">
                P{spec.originalIndex + 1}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onMoveSpec(idx, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  className="p-1 text-[#717782] hover:text-[#17191D] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSpec(idx, 1)}
                  disabled={idx === currentSpecs.length - 1}
                  title="Move down"
                  className="p-1 text-[#717782] hover:text-[#17191D] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRotateSpec(idx)}
                  title="Rotate 90°"
                  className="p-1 text-[#717782] hover:text-[#1D4ED8] cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleDeleteSpec(idx)}
                  title={spec.deleted ? 'Restore page' : 'Delete page'}
                  className="p-1 text-[#717782] hover:text-[#E5322D] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
