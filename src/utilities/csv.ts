export interface CsvFieldValidationError {
  line: number;
  field: number; // 1-based field index
  error: string;
}

/**
 * Parses a CSV line and returns both the parsed values and the original field substrings (with quotes preserved).
 */
export function parseCsvLineWithErrors(
  line: string,
  header?: string[]
): {
  row: string[];
  parseErrors: { error: string; field: number }[];
  quotedFields: boolean[];
  originalFields: string[];
} {
  const result: string[] = [];
  const quotedFields: boolean[] = [];
  const parseErrors: { error: string; field: number }[] = [];
  const originalFields: string[] = [];
  let current = '';
  let inQuotes = false;
  let fieldQuoted = false;
  let i = 0;
  let fieldIndex = 0;
  let fieldStart = 0;

  while (i < line.length) {
    const char = line[i];
    if (char === '"') {
      if (!inQuotes && current === '') {
        inQuotes = true;
        fieldQuoted = true;
        fieldStart = i; // mark the start of quoted field
      } else if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (inQuotes) {
        inQuotes = false;
      } else {
        // Unescaped quote in unquoted field
        const fieldName = header?.[fieldIndex] ?? `#${fieldIndex + 1}`;
        parseErrors.push({
          error: `[${fieldName}] Unescaped quote found in unquoted field`,
          field: fieldIndex + 1
        });
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      quotedFields.push(fieldQuoted);
      // Save the original field substring
      const fieldEnd = i;
      if (fieldQuoted) {
        // Include quotes
        originalFields.push(line.slice(fieldStart, fieldEnd));
      } else {
        originalFields.push(line.slice(fieldEnd - current.length, fieldEnd));
      }
      current = '';
      fieldQuoted = false;
      fieldIndex++;
      fieldStart = i + 1;
    } else {
      current += char;
    }
    i++;
  }
  if (inQuotes) {
    const fieldName = header?.[fieldIndex] ?? `#${fieldIndex + 1}`;
    parseErrors.push({
      error: `[${fieldName}] Unclosed quoted field`,
      field: fieldIndex + 1
    });
  }
  result.push(current);
  quotedFields.push(fieldQuoted);
  // Save the last field's original substring
  if (fieldQuoted) {
    originalFields.push(line.slice(fieldStart));
  } else {
    originalFields.push(line.slice(line.length - current.length));
  }
  return { row: result, parseErrors, quotedFields, originalFields };
}

export function validateCsvString(csvContent: string): CsvFieldValidationError[] {
  const errors: CsvFieldValidationError[] = [];
  const lines = csvContent.split(/\r?\n/);
  let expectedNumFields: number | null = null;
  let headerChecked = false;
  let header: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    // Pass header to parser for error context
    const { row, parseErrors, quotedFields } = parseCsvLineWithErrors(line, header);

    // Store header for field names
    if (!headerChecked) {
      expectedNumFields = row.length;
      header = row;
      headerChecked = true;
    } else if (row.length !== expectedNumFields) {
      errors.push({
        line: i + 1,
        field: 0,
        error: `[Row] Inconsistent number of fields: expected ${expectedNumFields}, got ${row.length}`
      });
    }

    // Field-specific errors
    for (let j = 0; j < row.length; j++) {
      const field = row[j];
      const quoted = quotedFields[j];
      const fieldName = header[j] ?? `#${j + 1}`;
      if (
        (field.includes(",") || field.includes("\r") || field.includes("\n") || field.includes('"')) &&
        !quoted
      ) {
        errors.push({
          line: i + 1,
          field: j + 1, // 1-based index
          error: `[${fieldName}] Field containing comma, CR, LF, or double quote must be quoted`
        });
      }
      if (quoted && /(^|[^"])""(?!")/.test(field)) {
        errors.push({
          line: i + 1,
          field: j + 1,
          error: `[${fieldName}] Field has improperly escaped double quotes`
        });
      }
      // Length validation with field name
      if (field.length > 1000) {
        errors.push({
          line: i + 1,
          field: j + 1,
          error: `[${fieldName}] Field exceeds maximum length of 1000 characters (actual: ${field.length})`
        });
      }
    }

    // Parse errors (now field-specific if possible)
    for (const parseError of parseErrors) {
      errors.push({
        line: i + 1,
        field: parseError.field,
        error: parseError.error
      });
    }
  }
  return errors;
}