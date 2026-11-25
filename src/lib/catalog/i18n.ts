/**
 * External catalog translations — English + Swahili.
 * The catalog is server-rendered; the language comes from the `lang` search
 * param (default "en") so links stay shareable.
 */

export type CatalogLang = "en" | "sw";

const dict = {
  en: {
    title: "TRONIC Product Catalog",
    tagline: "Faster Responses. Smarter Sales.",
    search_placeholder: "Search by name, SKU or model…",
    all_categories: "All categories",
    all_brands: "All brands",
    filter: "Filter",
    products: "products",
    no_products: "No products match your search.",
    price_note: "Price subject to quotation confirmation",
    view_details: "View details",
    add_to_cart: "Add to selection",
    in_cart: "In selection",
    quantity: "Quantity",
    specifications: "Technical specifications",
    description: "Description",
    brand: "Brand",
    model: "Model",
    sku: "SKU",
    availability: "Availability",
    available: "Available",
    on_request: "On request",
    discontinued: "Discontinued",
    cart_title: "Your selection",
    cart_empty: "Your selection is empty. Browse the catalog and add products.",
    browse_catalog: "Browse catalog",
    remove: "Remove",
    request_quotation: "Request Quotation",
    talk_to_sales: "Talk to Sales on WhatsApp",
    your_details: "Your details",
    your_name: "Your name",
    your_phone: "WhatsApp number (e.g. +2557…)",
    your_company: "Company (optional)",
    notes: "Notes for our sales team (optional)",
    submit_request: "Submit Quotation Request",
    submitting: "Submitting…",
    request_sent:
      "Thank you! Your quotation request has been received. Our sales team will contact you on WhatsApp shortly.",
    request_ref: "Your reference",
    request_error: "Something went wrong — please try again or contact us on WhatsApp.",
    phone_invalid: "Please enter a valid WhatsApp number including country code.",
    back_to_catalog: "Back to catalog",
    items: "item(s)",
    language: "Kiswahili",
    offers_title: "TRONIC Special Offers",
    offer_valid_until: "Valid until",
    no_offers: "No active offers right now — check back soon.",
    you_save: "Save",
    offer_price_note: "Offer prices are valid while the offer is active",
    all_offers: "Special offers",
  },
  sw: {
    title: "Katalogi ya Bidhaa za TRONIC",
    tagline: "Majibu ya Haraka. Mauzo Bora.",
    search_placeholder: "Tafuta kwa jina, SKU au modeli…",
    all_categories: "Aina zote",
    all_brands: "Chapa zote",
    filter: "Chuja",
    products: "bidhaa",
    no_products: "Hakuna bidhaa zinazolingana na utafutaji wako.",
    price_note: "Bei itathibitishwa kwenye nukuu ya bei",
    view_details: "Angalia maelezo",
    add_to_cart: "Weka kwenye orodha",
    in_cart: "Ipo kwenye orodha",
    quantity: "Idadi",
    specifications: "Vipimo vya kiufundi",
    description: "Maelezo",
    brand: "Chapa",
    model: "Modeli",
    sku: "SKU",
    availability: "Upatikanaji",
    available: "Inapatikana",
    on_request: "Kwa maombi",
    discontinued: "Imesitishwa",
    cart_title: "Orodha yako",
    cart_empty: "Orodha yako iko tupu. Vinjari katalogi na uongeze bidhaa.",
    browse_catalog: "Vinjari katalogi",
    remove: "Ondoa",
    request_quotation: "Omba Nukuu ya Bei",
    talk_to_sales: "Ongea na Mauzo kwenye WhatsApp",
    your_details: "Taarifa zako",
    your_name: "Jina lako",
    your_phone: "Namba ya WhatsApp (mf. +2557…)",
    your_company: "Kampuni (hiari)",
    notes: "Ujumbe kwa timu yetu ya mauzo (hiari)",
    submit_request: "Tuma Ombi la Nukuu ya Bei",
    submitting: "Inatuma…",
    request_sent:
      "Asante! Ombi lako la nukuu ya bei limepokelewa. Timu yetu ya mauzo itawasiliana nawe kupitia WhatsApp hivi karibuni.",
    request_ref: "Kumbukumbu yako",
    request_error: "Hitilafu imetokea — tafadhali jaribu tena au wasiliana nasi WhatsApp.",
    phone_invalid: "Tafadhali weka namba sahihi ya WhatsApp pamoja na msimbo wa nchi.",
    back_to_catalog: "Rudi kwenye katalogi",
    items: "bidhaa",
    language: "English",
    offers_title: "Ofa Maalum za TRONIC",
    offer_valid_until: "Inatumika hadi",
    no_offers: "Hakuna ofa zinazoendelea kwa sasa — tafadhali rudi tena.",
    you_save: "Okoa",
    offer_price_note: "Bei za ofa zinatumika wakati ofa ikiwa hai",
    all_offers: "Ofa maalum",
  },
} as const;

export type CatalogDict = Record<keyof (typeof dict)["en"], string>;

export function getLang(raw: string | undefined): CatalogLang {
  return raw === "sw" ? "sw" : "en";
}

export function t(lang: CatalogLang): CatalogDict {
  return dict[lang];
}

/** Toggle target for the language switch link. */
export function otherLang(lang: CatalogLang): CatalogLang {
  return lang === "en" ? "sw" : "en";
}
