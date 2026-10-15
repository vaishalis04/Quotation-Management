import { inr } from '../utils/format';

const Row = ({ label, value, strong, minus }) => (
  <div className={`trow ${strong ? 'strong' : ''}`}><span>{label}</span><span>{minus ? '- ' : ''}{inr(value)}</span></div>
);

/** The figures exactly as the server calculated them (nothing is computed in the browser). */
export default function TotalsPanel({ calc, stateName }) {
  if (!calc) return <p className="muted">Select a customer and fill at least one item (name, quantity, rate) to see the totals.</p>;
  const t = calc.totals;
  const supply = calc.gst_treatment === 'no_gst' ? 'No GST charged'
    : calc.supply_type === 'intra' ? 'Intra-state · CGST + SGST' : 'Inter-state · IGST';
  return (
    <div className="totals">
      <div className="supply">
        <span className={`badge ${calc.supply_type === 'inter' ? 'st-sent' : 'st-accepted'}`}>{supply}</span>
        {stateName && <span className="muted small"> Place of supply: {stateName}</span>}
      </div>
      <Row label="Items total" value={t.items_gross} />
      {t.line_discount_total + t.overall_discount > 0 && <Row label="Discount" value={t.line_discount_total + t.overall_discount} minus />}
      {t.charges_taxable > 0 && <Row label="Additional charges" value={t.charges_taxable} />}
      <Row label="Taxable value" value={t.taxable_amount} />
      {t.cgst_amount > 0 && <Row label="CGST" value={t.cgst_amount} />}
      {t.sgst_amount > 0 && <Row label="SGST / UTGST" value={t.sgst_amount} />}
      {t.igst_amount > 0 && <Row label="IGST" value={t.igst_amount} />}
      {t.round_off !== 0 && <Row label="Round off" value={t.round_off} />}
      <Row label="Grand total (INR)" value={t.grand_total} strong />
      <p className="words">{t.amount_in_words}</p>
      {calc.tax_summary?.length > 0 && calc.gst_treatment === 'regular' && (
        <table className="table compact">
          <thead><tr><th>HSN/SAC</th><th className="r">Taxable</th><th className="r">GST %</th><th className="r">Tax</th></tr></thead>
          <tbody>
            {calc.tax_summary.map((s, i) => (
              <tr key={i}><td>{s.hsn_sac || '—'}</td><td className="r">{inr(s.taxable_amount)}</td><td className="r">{s.gst_rate}</td><td className="r">{inr(s.tax_amount)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
