// Build the WhatsApp template header banner (1200x628 JPEG, brand style).
import sharp from "sharp";

const LOGO = "D:/T-project/tronic-response/public/brand/tronic-logo.webp";
const OUT = "D:/T-project/tronic-response/public/brand/offer-header.jpg";

const W = 1200;
const H = 628;

// Logo is 2000x585 transparent. Scale to ~880px wide.
const logoW = 880;
const logo = await sharp(LOGO).resize({ width: logoW }).png().toBuffer();
const meta = await sharp(logo).metadata();

// Red accent bar bottom + white canvas.
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect y="${H - 14}" width="${W}" height="14" fill="#d6001c"/>
  <text x="${W / 2}" y="${H - 92}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="bold"
    fill="#1a1a1d">EXCLUSIVE SPECIAL OFFERS</text>
  <text x="${W / 2}" y="${H - 44}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="26"
    fill="#6b6b66">Electrical &amp; lighting products — limited time</text>
</svg>`;

await sharp(Buffer.from(svg))
  .composite([
    {
      input: logo,
      left: Math.round((W - logoW) / 2),
      top: Math.round((H - 140 - (meta.height ?? 257)) / 2) - 40,
    },
  ])
  .jpeg({ quality: 90 })
  .toFile(OUT);

console.log("banner written:", OUT);
