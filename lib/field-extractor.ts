export interface ExtractedBillFields {
  customer_name: string;
  contact_number: string;
  bill_number: string;
  bill_date: string;
  restaurant: string;
  address: string;
  delivery_partner: string;
}

const DELIVERY_PARTNERS = [
  'zomato', 'swiggy', 'uber eats', 'ubereats', 'dunzo', 'magicpin',
  'foodpanda', 'ola foods', 'rapido', 'porter', 'shadowfax',
];

export function extractFields(rawText: string): ExtractedBillFields {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const text = rawText;

  return {
    customer_name: extractCustomerName(lines, text),
    contact_number: extractContactNumber(text),
    bill_number: extractBillNumber(lines, text),
    bill_date: extractBillDate(lines, text),
    restaurant: extractRestaurant(lines, text),
    address: extractAddress(lines, text),
    delivery_partner: extractDeliveryPartner(text),
  };
}

function extractContactNumber(text: string): string {
  // Indian mobile numbers: 10 digits, optionally prefixed with +91 or 0
  const patterns = [
    /(?:mob(?:ile)?|phone|contact|tel(?:ephone)?|ph)[\s:.\-]*([6-9]\d{9})/i,
    /(?:\+91|91|0)[\s\-]?([6-9]\d{9})/,
    /([6-9]\d{9})/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const num = m[1].replace(/\D/g, '');
      if (num.length === 10) return num;
    }
  }
  return '';
}

function extractCustomerName(lines: string[], text: string): string {
  const patterns = [
    /(?:customer|name|dear|hello|hi|to)\s*[:\-]?\s*([A-Z][a-zA-Z\s]{2,30})/i,
    /(?:bill\s+to|billed\s+to|ship\s+to)\s*[:\-]?\s*([A-Z][a-zA-Z\s]{2,30})/i,
    /(?:mr\.?|mrs\.?|ms\.?|dr\.?)\s+([A-Z][a-zA-Z\s]{2,25})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  // Try first non-empty line that looks like a name (2+ words, all letters)
  for (const line of lines.slice(0, 8)) {
    if (/^[A-Z][a-zA-Z]+(\s[A-Z][a-zA-Z]+)+$/.test(line) && line.length < 40) {
      return line;
    }
  }

  return '';
}

function extractBillNumber(lines: string[], text: string): string {
  const match = text.match(
    /(?:bill\s*(?:no|num|number|#)|invoice\s*(?:no|num|number|#)|order\s*(?:no|num|number|#)|receipt\s*(?:no|num|number|#))\s*[:\-#]?\s*([A-Z0-9\-\/]+)/i
  );
  if (match) return match[1].trim();

  // Fallback: look for patterns like INV-001, ORD-12345
  const fallback = text.match(/\b(INV|ORD|BILL|RCP|TXN|REF)[\-\/]?([A-Z0-9]{3,12})\b/i);
  if (fallback) return fallback[0].trim();

  return '';
}

function extractBillDate(lines: string[], text: string): string {
  const patterns = [
    /(?:date|dated|bill\s+date|order\s+date|invoice\s+date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0]).trim();
  }
  return '';
}

function extractRestaurant(lines: string[], text: string): string {
  // First few lines often contain restaurant name
  const skipWords = /^(bill|invoice|receipt|order|date|total|amount|gst|tax|address|phone|mobile|email|website|thank|welcome)/i;

  for (const line of lines.slice(0, 6)) {
    if (
      line.length > 3 &&
      line.length < 60 &&
      !skipWords.test(line) &&
      !/^\d/.test(line) &&
      /[a-zA-Z]/.test(line)
    ) {
      return line;
    }
  }
  return '';
}

function extractAddress(lines: string[], text: string): string {
  const addrMatch = text.match(
    /(?:address|addr|location|delivered\s+to|ship\s+to)\s*[:\-]?\s*([\w\s,\-#\/\.]{10,120}?)(?:\n|phone|mob|tel|email|gst|$)/i
  );
  if (addrMatch) return addrMatch[1].replace(/\s+/g, ' ').trim();

  // Look for a line containing a pincode (6 digits)
  for (let i = 0; i < lines.length; i++) {
    if (/\b\d{6}\b/.test(lines[i])) {
      const start = Math.max(0, i - 1);
      return lines.slice(start, i + 1).join(', ').trim();
    }
  }
  return '';
}

function extractDeliveryPartner(text: string): string {
  const lower = text.toLowerCase();
  for (const partner of DELIVERY_PARTNERS) {
    if (lower.includes(partner)) {
      return partner.charAt(0).toUpperCase() + partner.slice(1);
    }
  }
  return '';
}
