import { useState, useMemo } from 'react';
import { BookOpen, X, ChevronRight, Sparkles } from 'lucide-react';
import type { AuctionEntry, Seat } from '@/types/bridge';
import { getGuideContext, getSection, getAllSections } from '@/lib/biddingGuide';

interface BiddingReferenceProps {
  auction: AuctionEntry[];
  dealer: Seat | null;
  mySeat: Seat | null;
  onClose: () => void;
}

export function BiddingReference({ auction, dealer, mySeat, onClose }: BiddingReferenceProps) {
  const { primaryId, relatedIds } = useMemo(() => {
    const bidderSeat: Seat = mySeat ?? dealer ?? 'N';
    return getGuideContext(auction, bidderSeat, dealer ?? 'N');
  }, [auction, mySeat, dealer]);

  const [activeId, setActiveId] = useState(primaryId);
  const allSections = useMemo(() => getAllSections(), []);
  const section = getSection(activeId) ?? allSections[0];
  const relatedSections = useMemo(
    () => relatedIds.map(id => getSection(id)).filter(Boolean),
    [relatedIds],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Bidding Guide</h2>
              <p className="text-xs text-slate-500">Standard American conventions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar: section list */}
          <div className="w-44 shrink-0 border-r border-slate-700/40 bg-slate-900/60 overflow-y-auto py-2">
            {allSections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeId === s.id
                    ? 'text-emerald-400 bg-emerald-600/10 border-l-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Auto-suggested badge */}
            {activeId === primaryId && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Suggested for your current situation</span>
              </div>
            )}

            <h3 className="text-lg font-bold text-white mb-1">{section.title}</h3>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">{section.context}</p>

            {/* Reference table */}
            <div className="space-y-1.5">
              {section.rows.map((row, i) => (
                <div
                  key={i}
                  className="bg-slate-800/40 rounded-lg border border-slate-700/30 p-3 hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-20">
                      <span className="text-sm font-bold text-emerald-400 font-mono">{row.bid}</span>
                    </div>
                    <div className="shrink-0 w-16">
                      <span className="text-xs font-medium text-amber-400/90">{row.points}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 leading-relaxed">{row.meaning}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {section.note && (
              <div className="mt-4 px-3 py-2.5 rounded-lg bg-amber-950/20 border border-amber-800/30 text-xs text-amber-300/90 leading-relaxed">
                {section.note}
              </div>
            )}

            {/* Related sections */}
            {relatedSections.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-700/40">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Related Topics
                </p>
                <div className="flex flex-wrap gap-2">
                  {relatedSections.map(rs => rs && (
                    <button
                      key={rs.id}
                      onClick={() => setActiveId(rs.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs text-slate-300 hover:text-emerald-400 hover:border-emerald-600/40 transition-colors"
                    >
                      {rs.title}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
