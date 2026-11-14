export type ToolCategoryId =
  | 'pdf'
  | 'image'
  | 'audio-video'
  | 'design'
  | 'office'
  | 'ocr'
  | 'developer'
  | 'utilities'
  | 'privacy'
  | 'ai-batch';

export type WorkspaceType =
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'office'
  | 'ocr'
  | 'design'
  | 'developer'
  | 'utilities'
  | 'privacy'
  | 'batch'
  | 'ai';

export type ProcessingMode = 'local' | 'optional-cloud';

export type ToolStatus = 'implemented' | 'beta' | 'limited';

export type AppStage = 'discover' | 'prepare' | 'execute';

export interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategoryId;
  categoryLabel: string;
  description: string;
  shortSpecLeft: string;
  shortSpecRight: string;
  acceptedExtensions: string[];
  acceptedMimePrefixes: string[];
  outputFormats: string[];
  engineName: string;
  processingMode: ProcessingMode;
  status: ToolStatus;
  workspaceType: WorkspaceType;
  supportsMultiple: boolean;
  requiresFile: boolean;
  maxRecommendedSizeMB: number;
  iconName: string;
  keywords: string[];
  popular?: boolean;
  presets?: Array<{
    id: string;
    label: string;
    detail: string;
    badge: string;
  }>;
  limitationsNote?: string;
}

export interface CategoryMeta {
  id: ToolCategoryId;
  label: string;
  shortLabel: string;
  primaryColor: string;
  lightTint: string;
  description: string;
}

export interface WorkspaceFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  extension: string;
  objectUrl: string;
  addedAt: number;
}

export interface HistoryRecord {
  id: string;
  toolId: string;
  toolName: string;
  category: ToolCategoryId;
  inputFilename: string;
  outputFilename: string;
  inputSize: number;
  outputSize: number;
  durationMs: number;
  timestamp: number;
  mode: ProcessingMode;
}

export interface AIWorkflowPlan {
  summary: string;
  toolId: string;
  actionLabel: string;
  requiresConfirmation: boolean;
  parameters?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
    compressionPreset?: string;
    language?: string;
    notes?: string;
  };
  steps: string[];
  warnings?: string[];
}
