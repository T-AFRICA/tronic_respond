import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Branded TRONIC quotation PDF (pdf-lib — pure JS, serverless-safe).
 * A4 portrait, TRONIC red header band, compact items table with automatic
 * page breaks, totals block, terms & conditions, validity and footer.
 */

const TRONIC_RED = rgb(0.84, 0, 0.11); // #D6001C
const CHARCOAL = rgb(0.17, 0.17, 0.17);
const GRAY = rgb(0.45, 0.45, 0.45);
const LIGHT = rgb(0.95, 0.95, 0.95);
const BORDER = rgb(0.85, 0.85, 0.85);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;

type QuotationItemRow = {
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  availability_note: string;
  sort_order: number;
};

type QuotationRow = {
  reference: string;
  version: number;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  delivery_charge: number;
  grand_total: number;
  valid_until: string | null;
  terms_conditions: string;
  created_at: string;
  quotation_items: QuotationItemRow[];
};

type CustomerRow = {
  full_name: string;
  company_name: string;
  whatsapp_phone: string;
  email: string | null;
} | null;

const money = (n: number, currency: string) =>
  `${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export async function renderQuotationPdf(input: {
  quotation: QuotationRow;
  customer: CustomerRow;
}): Promise<Uint8Array> {
  const { quotation: q, customer } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle(`TRONIC Quotation ${q.reference}`);
  doc.setAuthor("TRONIC Response");

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  const text = (
    str: string,
    x: number,
    size = 9,
    f: PDFFont = font,
    color = CHARCOAL,
  ) => page.drawText(str, { x, y, size, font: f, color });

  // Wrap text to a max width, returns number of lines drawn
  const wrap = (str: string, maxWidth: number, size: number, f: PDFFont) => {
    const words = str.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(probe, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // ---------- Header band ----------
  page.drawRectangle({
    x: 0,
    y: A4[1] - 90,
    width: A4[0],
    height: 90,
    color: TRONIC_RED,
  });
  page.drawText("TRONIC", {
    x: MARGIN,
    y: A4[1] - 52,
    size: 26,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Faster Responses. Smarter Sales.", {
    x: MARGIN,
    y: A4[1] - 68,
    size: 9,
    font,
    color: rgb(1, 1, 1),
  });
  page.drawText("QUOTATION", {
    x: A4[0] - MARGIN - bold.widthOfTextAtSize("QUOTATION", 20),
    y: A4[1] - 52,
    size: 20,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const refStr = `${q.reference}  ·  v${q.version}`;
  page.drawText(refStr, {
    x: A4[0] - MARGIN - font.widthOfTextAtSize(refStr, 9),
    y: A4[1] - 68,
    size: 9,
    font,
    color: rgb(1, 1, 1),
  });

  y = A4[1] - 115;

  // ---------- Meta block (customer + dates) ----------
  const issued = new Date(q.created_at).toLocaleDateString("en-GB");
  const validity = q.valid_until
    ? new Date(q.valid_until).toLocaleDateString("en-GB")
    : "As stated";

  text("QUOTATION FOR", MARGIN, 7.5, bold, GRAY);
  text("DATE ISSUED", 330, 7.5, bold, GRAY);
  text("VALID UNTIL", 450, 7.5, bold, GRAY);
  y -= 13;
  text(customer?.full_name || "Customer", MARGIN, 10, bold);
  text(issued, 330, 10);
  text(validity, 450, 10);
  y -= 12;
  if (customer?.company_name) {
    text(customer.company_name, MARGIN, 9, font, GRAY);
    y -= 11;
  }
  if (customer?.whatsapp_phone) {
    text(customer.whatsapp_phone, MARGIN, 9, font, GRAY);
    y -= 11;
  }
  y -= 12;

  // ---------- Items table ----------
  const cols = {
    sku: MARGIN,
    name: MARGIN + 80,
    qty: 352,
    unit: 392,
    disc: 462,
    total: 500,
  };
  const nameWidth = cols.qty - cols.name - 8;

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN - 4,
      y: y - 4,
      width: A4[0] - 2 * MARGIN + 8,
      height: 16,
      color: LIGHT,
    });
    text("SKU", cols.sku, 7.5, bold, GRAY);
    text("PRODUCT", cols.name, 7.5, bold, GRAY);
    text("QTY", cols.qty, 7.5, bold, GRAY);
    text("UNIT PRICE", cols.unit, 7.5, bold, GRAY);
    text("DISC", cols.disc, 7.5, bold, GRAY);
    text("TOTAL", cols.total, 7.5, bold, GRAY);
    y -= 18;
  };

  drawTableHeader();

  const items = [...q.quotation_items].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  for (const item of items) {
    const nameLines = wrap(item.product_name, nameWidth, 8.5, font);
    const noteLines = item.availability_note
      ? wrap(item.availability_note, nameWidth, 7.5, font)
      : [];
    const rowHeight = Math.max(1, nameLines.length) * 10 + noteLines.length * 9 + 8;

    if (y - rowHeight < 150) {
      newPage();
      drawTableHeader();
    }

    text(item.sku.slice(0, 18), cols.sku, 8);
    nameLines.forEach((line, i) => {
      page.drawText(line, { x: cols.name, y: y - i * 10, size: 8.5, font, color: CHARCOAL });
    });
    text(String(item.quantity), cols.qty, 8.5);
    text(
      Number(item.unit_price).toLocaleString("en-US", { minimumFractionDigits: 2 }),
      cols.unit,
      8.5,
    );
    text(item.discount_pct > 0 ? `${item.discount_pct}%` : "—", cols.disc, 8.5);
    text(
      Number(item.line_total).toLocaleString("en-US", { minimumFractionDigits: 2 }),
      cols.total,
      8.5,
    );

    let consumed = Math.max(1, nameLines.length) * 10;
    noteLines.forEach((line, i) => {
      page.drawText(line, {
        x: cols.name,
        y: y - consumed - i * 9,
        size: 7.5,
        font,
        color: GRAY,
      });
    });
    consumed += noteLines.length * 9;

    y -= consumed + 6;
    page.drawLine({
      start: { x: MARGIN - 4, y: y + 3 },
      end: { x: A4[0] - MARGIN + 4, y: y + 3 },
      thickness: 0.5,
      color: BORDER,
    });
    y -= 4;
  }

  // ---------- Totals ----------
  if (y < 220) newPage();
  y -= 8;
  const totalsX = 390;
  const totalsValX = 500;
  const totalRow = (label: string, value: string, emphasize = false) => {
    text(label, totalsX, emphasize ? 10 : 9, emphasize ? bold : font, emphasize ? CHARCOAL : GRAY);
    text(value, totalsValX, emphasize ? 10 : 9, emphasize ? bold : font);
    y -= emphasize ? 16 : 13;
  };

  totalRow("Subtotal", money(q.subtotal, q.currency));
  if (Number(q.discount_total) > 0)
    totalRow("Discounts", `-${money(q.discount_total, q.currency)}`);
  if (Number(q.tax_total) > 0) totalRow("Tax", money(q.tax_total, q.currency));
  if (Number(q.delivery_charge) > 0)
    totalRow("Delivery", money(q.delivery_charge, q.currency));
  page.drawLine({
    start: { x: totalsX, y: y + 8 },
    end: { x: A4[0] - MARGIN, y: y + 8 },
    thickness: 1,
    color: TRONIC_RED,
  });
  y -= 4;
  totalRow("GRAND TOTAL", money(q.grand_total, q.currency), true);

  // ---------- Terms ----------
  if (q.terms_conditions?.trim()) {
    y -= 10;
    if (y < 140) newPage();
    text("TERMS & CONDITIONS", MARGIN, 7.5, bold, GRAY);
    y -= 12;
    for (const paragraph of q.terms_conditions.split("\n")) {
      for (const line of wrap(paragraph, A4[0] - 2 * MARGIN, 8, font)) {
        if (y < 90) newPage();
        text(line, MARGIN, 8, font, GRAY);
        y -= 10;
      }
    }
  }

  // ---------- Footer on every page ----------
  const pages = doc.getPages();
  pages.forEach((p: PDFPage, idx: number) => {
    p.drawLine({
      start: { x: MARGIN, y: 60 },
      end: { x: A4[0] - MARGIN, y: 60 },
      thickness: 0.5,
      color: BORDER,
    });
    p.drawText(
      "This quotation is not an invoice or confirmation of sale. Prices are confirmed upon acceptance within the validity period.",
      { x: MARGIN, y: 48, size: 7, font, color: GRAY },
    );
    p.drawText(`TRONIC Response · ${q.reference} · Page ${idx + 1} of ${pages.length}`, {
      x: MARGIN,
      y: 37,
      size: 7,
      font,
      color: GRAY,
    });
  });

  return doc.save();
}
