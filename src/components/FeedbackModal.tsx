import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, MessageSquare, ShieldCheck, X } from 'lucide-react';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

type FeedbackCategory = 'Bug report' | 'Feature idea' | 'Format compatibility';

const ISSUES_URL = 'https://github.com/barnikbasu/everything-workspace/issues/new';

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose }) => {
  const titleId = useId();
  const [category, setCategory] = useState<FeedbackCategory>('Bug report');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [copied, setCopied] = useState(false);
  const summaryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    const raf = requestAnimationFrame(() => summaryInputRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', handleKey);
      cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  if (!open) return null;

  const trimmedSummary = summary.trim() || 'Workspace feedback';
  const markdownReport = [
    `### Category: ${category}`,
    '',
    `**Summary:** ${trimmedSummary}`,
    '',
    '### Details / Steps to reproduce',
    details.trim() || '_No additional notes provided._',
    '',
    '---',
    '_Privacy check: Submitted manually without attached user files, filenames, or document contents._',
  ].join('\n');

  const issueHref = `${ISSUES_URL}?title=${encodeURIComponent(`[${category}] ${trimmedSummary}`)}&body=${encodeURIComponent(markdownReport)}`;

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(markdownReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17191D]/45 p-4 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white border border-[#E2E5EC] rounded-xl shadow-xl overflow-hidden text-left"
      >
        <div className="px-5 py-4 border-b border-[#E2E5EC] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-[#17191D]">
                Send Workspace Feedback
              </h2>
              <p className="text-xs text-[#717782]">
                Report a bug, format edge case, or feature idea
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback dialog"
            className="w-10 h-10 rounded-lg border border-transparent hover:border-[#E2E5EC] hover:bg-[#F6F7F9] text-[#717782] hover:text-[#17191D] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#F0FDFA] border border-[#0D9488]/20 text-xs text-[#17191D]">
            <ShieldCheck className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Your workspace files, filenames, and document contents stay strictly on your device and are never included in feedback reports.
            </p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-[#17191D]">Feedback Type</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['Bug report', 'Format compatibility', 'Feature idea'] as const).map((item) => {
                const selected = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={selected}
                    className={`min-h-10 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                        : 'bg-[#F6F7F9] text-[#17191D] border-[#E2E5EC] hover:bg-white'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="feedback-summary" className="block text-xs font-semibold text-[#17191D]">
              Short Summary
            </label>
            <input
              ref={summaryInputRef}
              id="feedback-summary"
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g., Batch PNG to WebP zip download stalled on mobile Safari"
              className="w-full h-10 px-3 bg-white border border-[#E2E5EC] rounded-lg text-xs text-[#17191D] placeholder:text-[#717782] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-details" className="block text-xs font-semibold text-[#17191D]">
              Details or Steps to Reproduce
            </label>
            <textarea
              id="feedback-details"
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the file type, expected behavior, and browser used (do not paste private data)."
              className="w-full p-3 bg-white border border-[#E2E5EC] rounded-lg text-xs text-[#17191D] placeholder:text-[#717782] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
            />
          </div>
        </div>

        <div className="px-5 py-4 bg-[#F6F7F9] border-t border-[#E2E5EC] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleCopyReport}
            className="min-h-10 px-3.5 bg-white hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-xs font-semibold text-[#17191D] inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#0D9488]" />
                <span>Report Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#717782]" />
                <span>Copy Report</span>
              </>
            )}
          </button>

          <a
            href={issueHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-10 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <span>Open GitHub Issue</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
