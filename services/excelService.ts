import path from "node:path";
import * as XLSX from "xlsx";

const workbookPath = path.resolve(process.cwd(), "Adjusted cash.xlsx");
const adjustedCashLabel = "adjusted cash";

type CellLocation = {
  address: string;
  value: unknown;
};

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[$,\s]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function updateRange(sheet: XLSX.WorkSheet, address: string): void {
  const decodedAddress = XLSX.utils.decode_cell(address);
  const existingRange = sheet["!ref"]
    ? XLSX.utils.decode_range(sheet["!ref"])
    : {
        s: decodedAddress,
        e: decodedAddress,
      };

  existingRange.s.r = Math.min(existingRange.s.r, decodedAddress.r);
  existingRange.s.c = Math.min(existingRange.s.c, decodedAddress.c);
  existingRange.e.r = Math.max(existingRange.e.r, decodedAddress.r);
  existingRange.e.c = Math.max(existingRange.e.c, decodedAddress.c);
  sheet["!ref"] = XLSX.utils.encode_range(existingRange);
}

function findAdjustedCashCell(sheet: XLSX.WorkSheet): CellLocation | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (normalizeLabel(row[columnIndex]) !== adjustedCashLabel) {
        continue;
      }

      const rightValue = row[columnIndex + 1];
      const belowValue = rows[rowIndex + 1]?.[columnIndex];
      const valueIsRight = toNumber(rightValue) !== null || rightValue != null;
      const valueColumn = valueIsRight ? columnIndex + 1 : columnIndex;
      const valueRow = valueIsRight ? rowIndex : rowIndex + 1;
      const value = valueIsRight ? rightValue : belowValue;

      return {
        address: XLSX.utils.encode_cell({ r: valueRow, c: valueColumn }),
        value,
      };
    }
  }

  return null;
}

export async function getAdjustedCash(): Promise<number> {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const cashCell = findAdjustedCashCell(sheet);
  const adjustedCash = cashCell ? toNumber(cashCell.value) : null;

  if (adjustedCash === null) {
    throw new Error("Adjusted Cash value was not found in Adjusted cash.xlsx");
  }

  return adjustedCash;
}

export async function saveAdjustedCash(newBalance: number): Promise<void> {
  if (!Number.isFinite(newBalance)) {
    throw new Error("Adjusted Cash must be a finite number");
  }

  const workbook = XLSX.readFile(workbookPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const cashCell = findAdjustedCashCell(sheet);

  if (cashCell) {
    sheet[cashCell.address] = {
      t: "n",
      v: Number(newBalance.toFixed(2)),
    };
    updateRange(sheet, cashCell.address);
  } else {
    sheet.A1 = { t: "s", v: "Adjusted Cash" };
    sheet.A2 = { t: "n", v: Number(newBalance.toFixed(2)) };
    sheet["!ref"] = "A1:A2";
  }

  XLSX.writeFile(workbook, workbookPath);
}
