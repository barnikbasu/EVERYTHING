import React, { Suspense, lazy } from 'react';
import { useWorkspace } from '../state/workspaceStore';

// Lazy-load specialized studios so homepage stays fast and processing engines load on demand
const ImageStudio = lazy(() =>
  import('./studios/ImageStudio').then((m) => ({ default: m.ImageStudio }))
);
const PdfStudio = lazy(() =>
  import('./studios/PdfStudio').then((m) => ({ default: m.PdfStudio }))
);
const AudioStudio = lazy(() =>
  import('./studios/AudioStudio').then((m) => ({ default: m.AudioStudio }))
);
const VideoStudio = lazy(() =>
  import('./studios/VideoStudio').then((m) => ({ default: m.VideoStudio }))
);
const OfficeStudio = lazy(() =>
  import('./studios/OfficeStudio').then((m) => ({ default: m.OfficeStudio }))
);
const OcrStudio = lazy(() =>
  import('./studios/OcrStudio').then((m) => ({ default: m.OcrStudio }))
);
const DesignStudio = lazy(() =>
  import('./studios/DesignStudio').then((m) => ({ default: m.DesignStudio }))
);
const DeveloperStudio = lazy(() =>
  import('./studios/DeveloperStudio').then((m) => ({ default: m.DeveloperStudio }))
);
const UtilitiesStudio = lazy(() =>
  import('./studios/UtilitiesStudio').then((m) => ({ default: m.UtilitiesStudio }))
);
const PrivacyStudio = lazy(() =>
  import('./studios/PrivacyStudio').then((m) => ({ default: m.PrivacyStudio }))
);
const BatchStudio = lazy(() =>
  import('./studios/BatchStudio').then((m) => ({ default: m.BatchStudio }))
);
const AiCommandStudio = lazy(() =>
  import('./studios/AiCommandStudio').then((m) => ({ default: m.AiCommandStudio }))
);

const StudioLoadingFallback: React.FC = () => (
  <div className="h-[calc(100vh-60px)] flex items-center justify-center bg-[#F6F7F9]">
    <div className="bg-white border border-[#E2E5EC] rounded-xl px-6 py-4 text-xs font-mono text-[#717782]">
      Loading local studio engine…
    </div>
  </div>
);

export const StageCExecute: React.FC = () => {
  const { selectedTool } = useWorkspace();
  if (!selectedTool) return null;

  const renderStudio = () => {
    switch (selectedTool.workspaceType) {
      case 'image':
        return <ImageStudio />;
      case 'pdf':
        return <PdfStudio />;
      case 'audio':
        return <AudioStudio />;
      case 'video':
        return <VideoStudio />;
      case 'office':
        return <OfficeStudio />;
      case 'ocr':
        return <OcrStudio />;
      case 'design':
        return <DesignStudio />;
      case 'developer':
        return <DeveloperStudio />;
      case 'utilities':
        return <UtilitiesStudio />;
      case 'privacy':
        return <PrivacyStudio />;
      case 'batch':
        return <BatchStudio />;
      case 'ai':
        return <AiCommandStudio />;
      default:
        return <BatchStudio />;
    }
  };

  return <Suspense fallback={<StudioLoadingFallback />}>{renderStudio()}</Suspense>;
};
