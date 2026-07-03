export const SHEET_PRODUCTS = 'Products';
export const PRODUCTS_HEADERS = ['ID', 'Name', 'Category', 'Packaging Type', 'Label URL', 'Ingredients', 'Last Updated'];

export const HEADER_BG = { red: 0x1a / 255, green: 0x19 / 255, blue: 0x16 / 255 };
export const HEADER_FG = { red: 1, green: 1, blue: 1 };

export const LABEL_YES_BG = { red: 0xed / 255, green: 0xf7 / 255, blue: 0xed / 255 };
export const LABEL_YES_FG = { red: 0x2d / 255, green: 0x6e / 255, blue: 0x2d / 255 };
export const LABEL_NO_BG = { red: 0xfd / 255, green: 0xec / 255, blue: 0xea / 255 };
export const LABEL_NO_FG = { red: 0xc0 / 255, green: 0x39 / 255, blue: 0x2c / 255 };

export const DATE_FORMAT = 'dd/MM/yyyy';
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm';

// Must match the spreadsheet's own timezone (Batching Records -> File -> Settings -> Time zone)
// so instant timestamps land on the same day/hour Apps Script used to place them.
export const SHEET_TIMEZONE = 'Europe/London';
