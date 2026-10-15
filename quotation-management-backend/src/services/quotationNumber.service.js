const { NumberSeries } = require('../models');
const { financialYearOf } = require('../utils/helpers');

// Must be called inside the same transaction that inserts the quotation.
const allocateNumber = async (company, quoteDate, transaction) => {
  const financialYear = financialYearOf(quoteDate);
  const where = { company_id: company.id, series_key: 'quotation', financial_year: financialYear };
  const lockOpts = { where, transaction, lock: transaction.LOCK.UPDATE };

  let row = await NumberSeries.findOne(lockOpts);
  if (!row) {
    try {
      row = await NumberSeries.create({ ...where, last_number: 0 }, { transaction });
    } catch (err) {
      row = await NumberSeries.findOne(lockOpts); // another request created it first
      if (!row) throw err;
    }
  }
  row.last_number += 1;
  await row.save({ transaction });

  const padded = String(row.last_number).padStart(company.quote_number_padding || 4, '0');
  const prefix = (company.quote_prefix || 'QT').trim();
  return {
    financial_year: financialYear,
    sequence_no: row.last_number,
    quote_number: `${prefix}/${financialYear}/${padded}`,
  };
};

module.exports = { allocateNumber };
