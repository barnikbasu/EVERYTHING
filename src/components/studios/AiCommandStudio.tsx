import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { StudioShell } from '../StudioShell';
import { StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import { buildLocalWorkflowPlan } from '../../engines/aiCommandEngine';
import { requestCloudAiPlan } from '../../services/aiService';
import { CATEGORY_META, getToolById } from '../../registry/toolRegistry';
import type { AIWorkflowPlan } from '../../types/workspace';
import { formatBytes } from '../../utils/formatters';

const EXAMPLE_COMMANDS = [
  'Compress this PDF without making the text unreadable.',
  'Resize all these images to 1080 pixels wide.',
  'Extract the audio from this video.',
  'Convert these images into one PDF.',
  'Remove the metadata from these photographs.',
  'Run OCR on this scanned document.',
];

export const AiCommandStudio: React.FC = () => {
  const { files, addFiles, removeFile, openToolExecute } = useWorkspace();
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState('');
  const [useCloudAi, setUseCloudAi] = useState(false);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [plan, setPlan] = useState<AIWorkflowPlan | null>(null);
  const [planEngine, setPlanEngine] = useState<string>('Local Deterministic Router');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBuildPlan = async (overridePrompt?: string) => {
    const q = (overridePrompt ?? prompt).trim();
    if (!q) {
      setErrorMsg('Enter a task description first.');
      return;
    }
    setErrorMsg(null);
    setConfirmChecked(false);
    setIsPlanning(true);

    try {
      const rawFiles = files.map((f) => f.file);
      if (useCloudAi) {
        if (!cloudConsent) {
          throw new Error(
            'Explicit consent is required to send your prompt and file names to Gemini on the server.'
          );
        }
        const res = await requestCloudAiPlan(q, rawFiles, true);
        setPlan(res.plan);
        setPlanEngine(`Gemini (${res.engine}) + Validated Tool Registry`);
      } else {
        const localPlan = buildLocalWorkflowPlan(q, rawFiles);
        setPlan(localPlan);
        setPlanEngine('Local Deterministic Router (Offline)');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate plan');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleExecutePlan = () => {
    if (!plan) return;
    if (plan.requiresConfirmation && !confirmChecked) {
      setErrorMsg('Please confirm the warning checkbox before launching this operation.');
      return;
    }
    const preset = plan.parameters?.compressionPreset || null;
    openToolExecute(
      plan.toolId,
      files.map((f) => f.file),
      preset,
      plan.parameters || null
    );
  };

  const targetTool = plan ? getToolById(plan.toolId) : null;

  return (
    <StudioShell
      filename="ai_command_workspace"
      bottomMetaLeft={`${files.length} file(s) attached · Local planner works without API keys`}
      bottomMetaRight={planEngine}
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), false);
        }}
      />

      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        {/* Command Input Card */}
        <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center shrink-0">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-bold text-[#17191D]">AI Command Workspace</h1>
                <p className="text-xs text-[#717782]">
                  Describe what you want to accomplish. Review the structured plan before any file operation executes.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => filePickerRef.current?.click()}
              className="h-9 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Attach Files
            </button>
          </div>

          {/* Attached Files */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((wf) => (
                <div
                  key={wf.id}
                  className="px-2.5 py-1 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-mono flex items-center gap-2"
                >
                  <span className="truncate max-w-[180px]">{wf.name}</span>
                  <span className="text-[#717782] tabular-nums">{formatBytes(wf.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(wf.id)}
                    className="text-[#717782] hover:text-[#E5322D] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Compress this PDF without making the text unreadable…"
              className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] focus:border-[#1D4ED8] focus:bg-white rounded-lg text-sm text-[#17191D] focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_COMMANDS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setPrompt(ex);
                    handleBuildPlan(ex);
                  }}
                  className="px-2.5 py-1 bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] rounded-md text-[11px] text-[#717782] hover:text-[#17191D] cursor-pointer text-left"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Planner Mode & Explicit Consent */}
          <div className="p-3.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="radio"
                    checked={!useCloudAi}
                    onChange={() => setUseCloudAi(false)}
                    className="accent-[#1D4ED8]"
                  />
                  <span>Local Deterministic Planner (Offline)</span>
                </label>
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="radio"
                    checked={useCloudAi}
                    onChange={() => setUseCloudAi(true)}
                    className="accent-[#7C3AED]"
                  />
                  <span>Optional Gemini Cloud Planner</span>
                </label>
              </div>

              <button
                type="button"
                disabled={isPlanning}
                onClick={() => handleBuildPlan()}
                className="h-9 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPlanning ? 'Planning…' : 'Build Execution Plan'}
              </button>
            </div>

            {useCloudAi && (
              <label className="flex items-start gap-2 text-xs text-[#717782] pt-1 border-t border-[#E2E5EC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloudConsent}
                  onChange={(e) => setCloudConsent(e.target.checked)}
                  className="mt-0.5 accent-[#7C3AED] cursor-pointer"
                />
                <span>
                  I consent to send my command text and file metadata (filenames and sizes only—never file contents) to Gemini via the server to generate a structured tool plan.
                </span>
              </label>
            )}
          </div>

          {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}
        </div>

        {/* Structured Plan Preview */}
        {plan && targetTool && (
          <div className="bg-white border border-[#1D4ED8]/40 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#E2E5EC]">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#1D4ED8]">
                  Structured Execution Plan · {planEngine}
                </div>
                <h2 className="text-base font-bold text-[#17191D] mt-1">{plan.summary}</h2>
              </div>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-md"
                style={{
                  backgroundColor: CATEGORY_META[targetTool.category].lightTint,
                  color: CATEGORY_META[targetTool.category].primaryColor,
                }}
              >
                {targetTool.name}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#717782] uppercase tracking-wider">
                Planned Steps
              </p>
              <ol className="space-y-1.5">
                {plan.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#17191D]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9488] shrink-0 mt-0.5" />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {plan.warnings && plan.warnings.length > 0 && (
              <div className="p-3 bg-[#FFFBEB] border border-[#D97706]/30 rounded-lg space-y-1">
                {plan.warnings.map((w, i) => (
                  <div key={i} className="text-xs text-[#92400E] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {plan.requiresConfirmation && (
              <label className="flex items-start gap-2 p-3 bg-[#FEF2F2] border border-[#E5322D]/25 rounded-lg text-xs text-[#991B1B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 accent-[#E5322D]"
                />
                <span>
                  I understand this workflow performs a sensitive or irreversible transformation and want to proceed into {targetTool.name}.
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-[#717782] inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                Execution runs via validated local engine ({targetTool.engineName})
              </span>
              <button
                type="button"
                onClick={handleExecutePlan}
                className="h-9 px-5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span>{plan.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
