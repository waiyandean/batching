// Google Sheets tab names can't contain: \ / ? * [ ] :  — max 100 characters.
export function safeSheetName(name) {
  return name.replace(/[\\/?*[\]:]/g, '-').substring(0, 100).trim();
}

// Wrap a sheet title for use in A1-notation ranges, e.g. Chef's Teriyaki -> 'Chef''s Teriyaki'
export function a1Quote(title) {
  return `'${title.replace(/'/g, "''")}'`;
}

export function colToLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function headerIndex(headers, name) {
  return headers.indexOf(name);
}

// Extract the 1-indexed row number of the first cell from an updatedRange
// like "'Products'!A5:G5" or "Sheet1!A5" (as returned by values.append).
export function parseAppendedRowNum(updatedRange) {
  const rangePart = updatedRange.slice(updatedRange.lastIndexOf('!') + 1);
  const firstCell = rangePart.split(':')[0];
  const m = firstCell.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}
