"use client";

import { updateFeedItems } from "@/content/updateFeed";

export function UpdateTicker() {
  if (updateFeedItems.length === 0) return null;

  const items = [...updateFeedItems, ...updateFeedItems];

  return (
    <div className="w-full max-w-6xl border-2 border-black bg-white overflow-hidden">
      <div className="flex items-center bg-white text-black">
        <div className="shrink-0 border-r-2 border-black bg-gray-100 px-4 py-3 text-xs font-black uppercase tracking-[0.18em]">
          Updates
        </div>
        <div className="min-w-0 flex-1 overflow-hidden py-3">
          <div className="update-ticker-track flex w-max items-center gap-6 whitespace-nowrap pr-6">
            {items.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="inline-flex items-center gap-3 text-sm font-bold text-black"
              >
                <span className="border border-black bg-gray-100 px-2 py-1 text-[11px] font-black">
                  {item.date}
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
