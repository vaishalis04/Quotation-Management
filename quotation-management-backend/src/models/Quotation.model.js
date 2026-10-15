const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

const money = () => ({ type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });

class Quotation extends Model {}

Quotation.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    customer_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "customers", key: "id" } },

    // Numbering: QT/2026-27/0007 ; revisions keep the number and bump version -> QT/2026-27/0007-R1
    quote_number: { type: DataTypes.STRING(60), allowNull: false },
    financial_year: { type: DataTypes.STRING(9), allowNull: false },
    sequence_no: { type: DataTypes.INTEGER, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    root_quotation_id: { type: DataTypes.BIGINT, allowNull: true }, // first version of this quotation
    parent_quotation_id: { type: DataTypes.BIGINT, allowNull: true }, // version this one was revised from
    is_latest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    quote_date: { type: DataTypes.DATEONLY, allowNull: false },
    valid_until: { type: DataTypes.DATEONLY, allowNull: true },
    status: {
      type: DataTypes.ENUM("draft", "sent", "accepted", "rejected", "expired", "revised", "cancelled"),
      allowNull: false,
      defaultValue: "draft",
    },
    subject: { type: DataTypes.STRING(500), allowNull: true },
    reference_no: { type: DataTypes.STRING(100), allowNull: true }, // customer enquiry / RFQ number
    kind_attention: { type: DataTypes.STRING(150), allowNull: true },

    // Frozen copies so old quotations never change when the master data is edited
    customer_snapshot: { type: DataTypes.JSON, allowNull: true },
    company_snapshot: { type: DataTypes.JSON, allowNull: true },

    // Tax set-up
    place_of_supply_state_code: { type: DataTypes.STRING(2), allowNull: true },
    supply_type: { type: DataTypes.ENUM("intra", "inter"), allowNull: true },
    gst_treatment: { type: DataTypes.ENUM("regular", "no_gst"), allowNull: false, defaultValue: "regular" },
    price_mode: { type: DataTypes.ENUM("exclusive", "inclusive"), allowNull: false, defaultValue: "exclusive" },
    discount_type: { type: DataTypes.ENUM("percent", "amount"), allowNull: true },
    discount_value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    round_off_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // Calculated totals (always written by the calculator, never trusted from the client)
    items_gross: money(),
    line_discount_total: money(),
    overall_discount: money(),
    taxable_amount: money(),
    cgst_amount: money(),
    sgst_amount: money(),
    igst_amount: money(),
    tax_amount: money(),
    round_off: money(),
    grand_total: money(),
    amount_in_words: { type: DataTypes.STRING(500), allowNull: true },
    tax_summary: { type: DataTypes.JSON, allowNull: true },

    terms: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    template_id: { type: DataTypes.BIGINT, allowNull: true },

    sent_at: { type: DataTypes.DATE, allowNull: true },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
    status_reason: { type: DataTypes.STRING(500), allowNull: true },

    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // QT/2026-27/0007 for v1, QT/2026-27/0007-R1 for the first revision
    display_number: {
      type: DataTypes.VIRTUAL,
      get() {
        const v = this.getDataValue("version");
        const n = this.getDataValue("quote_number");
        return v > 1 ? `${n}-R${v - 1}` : n;
      },
    },
  },
  {
    sequelize,
    modelName: "Quotation",
    tableName: "quotations",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "quote_number", "version"], unique: true },
      { fields: ["company_id", "status"] },
      { fields: ["company_id", "quote_date"] },
      { fields: ["customer_id"] },
      { fields: ["root_quotation_id"] },
    ],
  }
);

module.exports = Quotation;
