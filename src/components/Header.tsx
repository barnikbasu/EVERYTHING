import React from 'react';
import { History, Search, Terminal, Menu, X } from 'lucide-react';
import { useWorkspace } from '../state/workspaceStore';
import type { ToolCategoryId } from '../types/workspace';

interface HeaderProps {
  activeCategory: ToolCategoryId | 'all';
  onSelectCategory: (cat: ToolCategoryId | 'all') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeCategory, onSelectCategory }) => {
  const { stage, goHome, setSearchOpen, setHistoryOpen, history, openToolExecute } = useWorkspace();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems: Array<{ id: ToolCategoryId | 'all'; label: string }> = [
    { id: 'all', label: 'All Tools' },
    { id: 'pdf', label: 'PDF & Docs' },
    { id: 'image', label: 'Image & BG' },
    { id: 'audio-video', label: 'Audio & Video' },
    { id: 'design', label: 'Design & Studio' },
  ];

  const handleNavClick = (id: ToolCategoryId | 'all') => {
    onSelectCategory(id);
    if (stage !== 'discover') {
      goHome();
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 h-[60px] bg-white border-b border-[#E2E5EC]">
      <div className="max-w-[1360px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Brand Lockup */}
        <button
          type="button"
          onClick={() => handleNavClick('all')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded-md px-1 py-1 cursor-pointer"
        >
          <span className="text-[15px] font-bold tracking-tight text-[#17191D]">EVERYTHING</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="w-2 h-2 rounded-full bg-[#E5322D]" />
            <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
            <span className="w-2 h-2 rounded-full bg-[#D97706]" />
            <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />
          </span>
        </button>

        {/* Center Category Nav */}
        <nav
          aria-label="Primary categories"
          className="hidden lg:flex items-center gap-1 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg p-1"
        >
          {navItems.map((item) => {
            const isActive = stage === 'discover' && activeCategory === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#17191D] shadow-xs border border-[#E2E5EC]/70'
                    : 'text-[#717782] hover:text-[#17191D]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-9 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-xs text-[#717782] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5 text-[#717782]" />
            <span className="hidden sm:inline">Search all tools…</span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-white border border-[#E2E5EC] rounded text-[#717782]">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open recent history"
            className="relative flex items-center gap-1.5 h-9 px-2.5 bg-white hover:bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-medium text-[#17191D] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <History className="w-3.5 h-3.5 text-[#717782]" />
            <span className="hidden sm:inline">History</span>
            {history.length > 0 && (
              <span className="font-mono text-[11px] text-[#717782] tabular-nums">
                ({history.length})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => openToolExecute('ai-command')}
            className="hidden sm:flex items-center gap-1.5 h-9 px-3 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>AI Command</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="lg:hidden flex items-center justify-center w-9 h-9 border border-[#E2E5EC] rounded-lg text-[#17191D] hover:bg-[#F6F7F9] cursor-pointer transition-colors"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-[#E2E5EC] px-4 py-3 space-y-2 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {navItems.map((item) => {
              const isActive = stage === 'discover' && activeCategory === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#17191D] text-white border-[#17191D]'
                      : 'bg-[#F6F7F9] hover:bg-[#ECEFF4] text-[#17191D] border-[#E2E5EC]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                openToolExecute('ai-command');
              }}
              className="flex-1 h-9 px-3 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer"
            >
              Open AI Command Workspace
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
