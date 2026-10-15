// Indian numbering system (thousand, lakh, crore) - "Rupees ... and ... Paise Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));

const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
};

// integer >= 0 (BigInt-safe for up to 99,99,99,99,999 using string maths)
const integerToWords = (n) => {
  let num = BigInt(n);
  if (num === 0n) return 'Zero';
  const parts = [];
  const crore = num / 10000000n; num %= 10000000n;
  const lakh = num / 100000n; num %= 100000n;
  const thousand = num / 1000n; num %= 1000n;
  const rest = Number(num);
  if (crore > 0n) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh > 0n) parts.push(`${twoDigits(Number(lakh))} Lakh`);
  if (thousand > 0n) parts.push(`${twoDigits(Number(thousand))} Thousand`);
  if (rest > 0) parts.push(threeDigits(rest));
  return parts.join(' ');
};

// amount: Decimal | number | string with up to 2 decimals
const amountInWords = (amount) => {
  const fixed = Number(amount).toFixed(2);
  const negative = fixed.startsWith('-');
  const [rupeesStr, paiseStr] = fixed.replace('-', '').split('.');
  const rupees = BigInt(rupeesStr);
  const paise = parseInt(paiseStr, 10);

  let words = '';
  if (rupees > 0n || paise === 0) words += `Rupees ${integerToWords(rupees)}`;
  if (paise > 0) words += `${words ? ' and ' : ''}${twoDigits(paise)} Paise`;
  return `${negative ? 'Minus ' : ''}${words} Only`;
};

module.exports = { amountInWords, integerToWords };
