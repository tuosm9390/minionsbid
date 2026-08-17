"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/ui/CyberIcons";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(left: Date | null, right: Date | null) {
  if (!left || !right) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isOutsideRange(date: Date, minDate?: Date, maxDate?: Date) {
  const target = startOfDay(date).getTime();
  const min = minDate ? startOfDay(minDate).getTime() : null;
  const max = maxDate ? startOfDay(maxDate).getTime() : null;

  if (min !== null && target < min) return true;
  if (max !== null && target > max) return true;
  return false;
}

function buildMonthCells(month: Date) {
  const firstDay = startOfMonth(month);
  const startWeekday = firstDay.getDay();
  const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= lastDate; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ScheduleCalendar({
  label,
  selectedDate,
  onChange,
  daySummaries,
  minDate,
  maxDate,
}: {
  label: string;
  selectedDate: Date;
  onChange: (date: Date) => void;
  daySummaries: Map<string, { total: number; completed: number; labels?: string[] }>;
  minDate?: Date;
  maxDate?: Date;
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate));

  useEffect(() => {
    queueMicrotask(() => setViewMonth(startOfMonth(selectedDate)));
  }, [selectedDate]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);

  return (
    <div className="border-2 border-black bg-white">
      <div className="flex items-center justify-between border-b-2 border-black px-3 py-2 bg-minion-yellow">
        <div>
          <p className="text-fluid-xs font-black uppercase tracking-[0.18em]">{label}</p>
          <p className="text-fluid-sm font-black">
            {viewMonth.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
            className="border-2 border-black bg-white p-1.5 hover:bg-black hover:text-white transition-colors"
            aria-label={`${label} 이전 달`}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
            className="border-2 border-black bg-white p-1.5 hover:bg-black hover:text-white transition-colors"
            aria-label={`${label} 다음 달`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b-2 border-black bg-black text-white">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <div key={day} className="py-2 text-center text-fluid-xs font-black">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          const dateKey = cell ? formatDateKey(cell) : "";
          const summary = cell ? daySummaries.get(dateKey) : null;
          const disabledByRange = cell ? isOutsideRange(cell, minDate, maxDate) : true;
          return (
            <button
              key={`${cell?.toISOString() ?? "empty"}-${index}`}
              type="button"
              onClick={() => cell && !disabledByRange && onChange(cell)}
              disabled={disabledByRange}
              className={`aspect-square border-r border-b border-black/15 text-fluid-sm font-bold transition-colors relative ${
                !cell
                  ? "bg-neutral-100 cursor-default"
                  : disabledByRange
                    ? "bg-neutral-100 text-gray-300 cursor-not-allowed"
                  : isSameDay(cell, selectedDate)
                    ? "bg-minion-blue text-white"
                    : "bg-white hover:bg-minion-yellow/30"
              }`}
            >
              <span>{cell?.getDate() ?? ""}</span>
              {summary && summary.total > 0 && (
                <div className="absolute inset-x-1 bottom-1 flex flex-col gap-0.5">
                  {(summary.labels && summary.labels.length > 0
                    ? summary.labels.slice(0, 2)
                    : [`${summary.completed}/${summary.total}`]
                  ).map((labelText, labelIndex) => (
                    <span
                      key={`${dateKey}-${labelIndex}-${labelText}`}
                      className={`block truncate px-1.5 py-0.5 text-fluid-xs leading-none border border-black ${
                        summary.completed === summary.total
                          ? "bg-green-500 text-white"
                          : "bg-minion-yellow text-black"
                      }`}
                    >
                      {labelText}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
