export interface CsvFieldValidationError {
  line: number;
  field: number; // 1-based field index
  error: string;
}

/**
 * Robust RFC 4180-compliant CSV line parser.
 * Returns parsed values, original field substrings, and error info.
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

  let i = 0;
  let fieldIndex = 0;
  let inQuotes = false;
  let fieldQuoted = false;
  let current = '';
  let fieldStart = 0;

  while (i <= line.length) {
    let char = line[i];
    if (i === line.length || (char === ',' && !inQuotes)) {
      // End of field
      let originalField = line.slice(fieldStart, i);
      originalFields.push(originalField);

      // Unescape quoted field if needed
      let value = current;
      if (fieldQuoted) {
        // Remove surrounding quotes and unescape double quotes
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1).replace(/""/g, '"');
        }
      }
      result.push(value);
      quotedFields.push(fieldQuoted);

      // Reset for next field
      current = '';
      fieldQuoted = false;
      inQuotes = false;
      fieldStart = i + 1;
      fieldIndex++;
      i++;
      continue;
    }

    if (char === '"') {
      if (!inQuotes && current === '') {
        inQuotes = true;
        fieldQuoted = true;
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
    } else {
      current += char;
    }
    i++;
  }

  // Check for unclosed quoted field
  if (inQuotes) {
    const fieldName = header?.[fieldIndex - 1] ?? `#${fieldIndex}`;
    parseErrors.push({
      error: `[${fieldName}] Unclosed quoted field`,
      field: fieldIndex
    });
  }

  return { row: result, parseErrors, quotedFields, originalFields };
}

export function validateCsvString(csvContent: string): CsvFieldValidationError[] {
  const errors: CsvFieldValidationError[] = [];
  const lines = csvContent.split(/\r?\n/);
  let expectedNumFields: number | null = null;
  let headerChecked = false;
  let header: string[] = [];
  let correctFieldIndexes: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    // Pass header to parser for error context
    const { row, parseErrors, quotedFields } = parseCsvLineWithErrors(line, header);

    // Store header for field names and find correct{x} fields
    if (!headerChecked) {
      expectedNumFields = row.length;
      header = row;
      headerChecked = true;
      correctFieldIndexes = header
        .map((name, idx) => /^correct\d+$/i.test(name.trim()) ? idx : -1)
        .filter(idx => idx !== -1);
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

    // --- Custom validation for correct{x} fields ---
    if (headerChecked && correctFieldIndexes.length > 0 && i > 0) {
      let hasTrue = false;
      for (const idx of correctFieldIndexes) {
        const val = (row[idx] ?? '').trim().toUpperCase();
        const fieldName = header[idx];
        if (val !== '' && val !== 'TRUE' && val !== 'FALSE') {
          errors.push({
            line: i + 1,
            field: idx + 1,
            error: `[${fieldName}] Value must be either TRUE or FALSE`
          });
        }
        if (val === 'TRUE') hasTrue = true;
      }
      if (!hasTrue) {
        errors.push({
          line: i + 1,
          field: 0,
          error: `[Row] At least one correct{x} field must be TRUE`
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