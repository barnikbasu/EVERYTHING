import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Upload } from 'lucide-react';
import type { ToolCategoryId } from '../types/workspace';
import { CATEGORY_META } from '../registry/toolRegistry';
import { ToolIcon } from './ToolIcon';

export type NoticeVariant = 'error' | 'success' | 'warning' | 'info';

interface StudioNoticeProps {
  variant: NoticeVariant;
  children: React.ReactNode;
  className?: string;
}

const NOTICE_STYLES: Record<NoticeVariant, string> = {
  error: 'bg-[#FEF2F2] border-[#E5322D]/25 text-[#991B1B]',
  success: 'bg-[#F0FDFA] border-[#0D9488]/30 text-[#0F766E]',
  warning: 'bg-[#FFFBEB] border-[#D97706]/30 text-[#92400E]',
  info: 'bg-[#EFF6FF] border-[#1D4ED8]/25 text-[#1E40AF]',
};

const NOTICE_ICONS: Record<NoticeVariant, React.ReactNode> = {
  error: <AlertCircle className="w-4 h-4 text-[#E5322D] shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />,
  info: <Info className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />,
};

export const StudioNotice: React.FC<StudioNoticeProps> = ({
  variant,
  children,
  className = '',
}) => {
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`p-3 border rounded-lg text-xs flex items-start gap-2 text-left leading-relaxed ${NOTICE_STYLES[variant]} ${className}`}
    >
      {NOTICE_ICONS[variant]}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

interface StudioEmptyCardProps {
  title: string;
  description: string;
  category?: ToolCategoryId;
  iconName?: string;
  primaryLabel: string;
  onPrimaryClick: () => void;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
  footnote?: string;
  children?: React.ReactNode;
  className?: string;
}

export const StudioEmptyCard: React.FC<StudioEmptyCardProps> = ({
  title,
  description,
  category = 'image',
  iconName,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
  footnote,
  children,
  className = '',
}) => {
  const meta = CATEGORY_META[category];

  return (
    <div
      className={`max-w-md w-full bg-white border border-[#E2E5EC] rounded-xl p-6 sm:p-8 text-center space-y-4 ${className}`}
    >
      <div
        className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center border"
        style={{
          backgroundColor: meta.lightTint,
          color: meta.primaryColor,
          borderColor: `${meta.primaryColor}25`,
        }}
      >
        {iconName ? <ToolIcon name={iconName} className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
      </div>

      <div className="space-y-1">
        <h2 className="text-base font-bold text-[#17191D]">{title}</h2>
        <p className="text-xs text-[#717782] leading-relaxed">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onPrimaryClick}
          className="h-9 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{primaryLabel}</span>
        </button>

        {secondaryLabel && onSecondaryClick && (
          <button
            type="button"
            onClick={onSecondaryClick}
            className="h-9 px-4 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-[#17191D] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            {secondaryLabel}
          </button>
        )}
      </div>

      {children}

      {footnote && (
        <p className="text-[11px] font-mono text-[#717782] pt-2 border-t border-[#F1F3F6]">
          {footnote}
        </p>
      )}
    </div>
  );
};
