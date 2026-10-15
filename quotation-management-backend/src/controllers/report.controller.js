const { fn, col } = require("sequelize");
const { Quotation } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const { getCompanyId, todayStr, financialYearOf } = require("../utils/helpers");

module.exports = {
  // Counts and value per status for the latest version of each quotation
  summary: async (req, res, next) => {
    try {
      const { Op } = require("sequelize");
      const where = { is_deleted: false, is_latest: true };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;

      const fy = req.query.financial_year || financialYearOf(todayStr());
      where.financial_year = fy;

      const rows = await Quotation.findAll({
        where,
        attributes: ["status", [fn("COUNT", col("id")), "count"], [fn("SUM", col("grand_total")), "value"], [fn("SUM", col("tax_amount")), "tax"]],
        group: ["status"], raw: true,
      });
      const byStatus = rows.map((r) => ({ status: r.status, count: Number(r.count), value: Number(Number(r.value || 0).toFixed(2)), tax: Number(Number(r.tax || 0).toFixed(2)) }));
      const get = (s) => byStatus.find((x) => x.status === s) || { count: 0, value: 0 };
      const decided = get("accepted").count + get("rejected").count;
      res.json(new ApiResponse(200, {
        financial_year: fy,
        by_status: byStatus,
        total_quotations: byStatus.reduce((a, x) => a + x.count, 0),
        accepted_value: get("accepted").value,
        open_value: get("sent").value + get("draft").value,
        win_rate_percent: decided ? Number(((get("accepted").count / decided) * 100).toFixed(1)) : null,
      }));
    } catch (error) {
      next(error);
    }
  },
};
