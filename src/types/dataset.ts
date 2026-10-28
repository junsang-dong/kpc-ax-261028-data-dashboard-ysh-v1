export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export type DataType = "number" | "string" | "date" | "boolean";
export type SemanticType =
  | "numeric"
  | "temporal"
  | "categorical"
  | "identifier"
  | "text"
  | "boolean";

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  q1: number;
  q3: number;
  sum: number;
}

export interface ColumnProfile {
  nullCount: number;
  nullRatio: number;
  uniqueCount: number;
  /** 추론된 타입에 맞지 않아 null로 정제된 값의 수 */
  typeMismatchCount: number;
  numeric?: NumericStats;
  dateRange?: { min: string; max: string; invalidCount: number };
  topValues?: { value: string; count: number }[];
}

export interface ColumnSchema {
  /** 정제 후 유일한 컬럼 키 */
  key: string;
  /** 원본 헤더 */
  originalName: string;
  dataType: DataType;
  inferredType: DataType;
  semanticType: SemanticType;
  profile: ColumnProfile;
}

export type IssueSeverity = "info" | "warning" | "critical";

export interface QualityIssue {
  severity: IssueSeverity;
  column?: string;
  message: string;
}

export interface QualityReport {
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  duplicateRatio: number;
  issues: QualityIssue[];
}

export interface Dataset {
  datasetId: string;
  workspaceId: string;
  datasetName: string;
  sourceType: "csv" | "xlsx" | "sample";
  originalFileName: string;
  schemaDefinition: ColumnSchema[];
  rowCount: number;
  columnCount: number;
  dataQuality: QualityReport;
  datasetVersion: number;
  lastUpdatedAt: string;
  processingStatus: "queued" | "processing" | "completed" | "failed";
  /** 정제된(타입 변환된) 값 */
  rows: Row[];
  /** 원본 문자열 값 — 정제 값과 구분하여 보관 */
  rawRows: string[][];
  notes?: string[];
}

export interface RawTable {
  headers: string[];
  rows: unknown[][];
  warnings: string[];
}

export type Aggregation = "count" | "sum" | "avg" | "min" | "max" | "median" | "distinct";
export type TimeGrain = "day" | "month" | "quarter" | "year";

export type FilterOperator = "eq" | "in" | "between" | "gte" | "lte" | "contains";
export interface Filter {
  field: string;
  operator: FilterOperator;
  value: Cell | Cell[];
}
