"use client";
// 엑셀 시트 미리보기와 컬럼 매핑 UI를 제공한다.

import {
  EXCEL_FIELD_LABELS,
  type ExcelFieldKey,
  type ExcelPreviewState,
} from "@/features/auction/hooks/useCreateRoom";

interface ExcelSheetMappingPanelProps {
  preview: ExcelPreviewState;
  isUploading: boolean;
  onHeaderRowChange: (rowIndex: number) => void;
  onToggleColumn: (columnIndex: number) => void;
  onSelectRange: (startIndex: number, endIndex: number) => void;
  onFieldMappingChange: (
    field: ExcelFieldKey,
    columnIndex: number | null,
  ) => void;
  onApply: () => void;
  onCancel: () => void;
}

const FIELD_ORDER: ExcelFieldKey[] = [
  "name",
  "tier",
  "mainPosition",
  "subPosition",
  "description",
  "desiredTeam",
  "aramTier",
  "tftTier",
];

function getColumnName(index: number) {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function getHeaderLabel(preview: ExcelPreviewState, columnIndex: number) {
  const header = preview.rows[preview.headerRowIndex]?.[columnIndex]?.trim();
  return header || `${getColumnName(columnIndex)}열`;
}

export function ExcelSheetMappingPanel({
  preview,
  isUploading,
  onHeaderRowChange,
  onToggleColumn,
  onSelectRange,
  onFieldMappingChange,
  onApply,
  onCancel,
}: ExcelSheetMappingPanelProps) {
  const maxColumns = Math.max(...preview.rows.map((row) => row.length), 0);
  const columnIndexes = Array.from({ length: maxColumns }, (_, index) => index);
  const selectedColumnSet = new Set(preview.selectedColumnIndexes);
  const previewRows = preview.rows.slice(0, 8);
  const rangeStart = preview.selectedColumnIndexes[0] ?? 0;
  const rangeEnd =
    preview.selectedColumnIndexes[preview.selectedColumnIndexes.length - 1] ??
    Math.max(0, maxColumns - 1);

  return (
    <div className="mb-5 border-4 border-black bg-white p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-black">시트 데이터 미리보기</p>
          <p className="mt-1 text-xs font-bold text-gray-600">
            {preview.fileName} / {preview.sheetName}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="pixel-button bg-white px-3 py-1 text-xs font-bold text-black"
        >
          취소
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[9rem_1fr]">
        <label className="text-xs font-black text-gray-600" htmlFor="excel-header-row">
          헤더 행
        </label>
        <select
          id="excel-header-row"
          value={preview.headerRowIndex}
          onChange={(event) => onHeaderRowChange(Number(event.target.value))}
          className="border-2 border-black bg-white px-2 py-1.5 text-sm font-bold"
        >
          {preview.rows.slice(0, 10).map((row, index) => (
            <option key={index} value={index}>
              {index + 1}행 {row.filter(Boolean).slice(0, 4).join(" / ")}
            </option>
          ))}
        </select>

        <span className="text-xs font-black text-gray-600">연속 열 범위</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="시작 열"
            value={rangeStart}
            className="border-2 border-black bg-white px-2 py-1.5 text-sm font-bold"
            onChange={(event) =>
              onSelectRange(Number(event.target.value), rangeEnd)
            }
          >
            {columnIndexes.map((index) => (
              <option key={index} value={index}>
                {getColumnName(index)} {getHeaderLabel(preview, index)}
              </option>
            ))}
          </select>
          <span className="text-xs font-black">~</span>
          <select
            aria-label="끝 열"
            value={rangeEnd}
            className="border-2 border-black bg-white px-2 py-1.5 text-sm font-bold"
            onChange={(event) =>
              onSelectRange(rangeStart, Number(event.target.value))
            }
          >
            {columnIndexes.map((index) => (
              <option key={index} value={index}>
                {getColumnName(index)} {getHeaderLabel(preview, index)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-black text-gray-600">사용할 열</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {columnIndexes.map((index) => {
            const headerLabel = getHeaderLabel(preview, index);
            return (
              <label
                key={index}
                className="flex cursor-pointer items-center gap-2 border-2 border-black bg-gray-50 px-2 py-1.5 text-xs font-black"
              >
                <input
                  type="checkbox"
                  aria-label={`사용 열: ${headerLabel}`}
                  checked={selectedColumnSet.has(index)}
                  onChange={() => onToggleColumn(index)}
                />
                <span className="truncate">
                  {getColumnName(index)} {headerLabel}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {FIELD_ORDER.map((field) => (
          <label key={field} className="flex flex-col gap-1 text-xs font-black text-gray-600">
            {EXCEL_FIELD_LABELS[field]} 열
            <select
              aria-label={`${EXCEL_FIELD_LABELS[field]} 열`}
              value={preview.fieldMapping[field] ?? "__none__"}
              onChange={(event) =>
                onFieldMappingChange(
                  field,
                  event.target.value === "__none__"
                    ? null
                    : Number(event.target.value),
                )
              }
              className="border-2 border-black bg-white px-2 py-1.5 text-sm font-bold text-black"
            >
              <option value="__none__">사용 안 함</option>
              {preview.selectedColumnIndexes.map((index) => (
                <option key={index} value={index}>
                  {getColumnName(index)} {getHeaderLabel(preview, index)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto border-2 border-black">
        <table className="min-w-full border-collapse text-xs">
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={
                  rowIndex === preview.headerRowIndex
                    ? "bg-minion-yellow/30 font-black"
                    : "bg-white"
                }
              >
                <th className="border border-black bg-black px-2 py-1 text-minion-yellow">
                  {rowIndex + 1}
                </th>
                {columnIndexes.map((columnIndex) => (
                  <td
                    key={columnIndex}
                    className={`max-w-40 border border-black px-2 py-1 ${
                      selectedColumnSet.has(columnIndex)
                        ? "text-black"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <span className="block truncate">
                      {row[columnIndex] ?? ""}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onApply}
          disabled={isUploading}
          className="pixel-button bg-black px-6 py-2 text-xs font-heading text-minion-yellow disabled:opacity-50"
        >
          이 데이터 사용
        </button>
      </div>
    </div>
  );
}
