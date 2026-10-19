const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

const money = () => ({ type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });
const pct = () => ({ type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0 });

class QuotationItem extends Model {}

QuotationItem.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    quotation_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "quotations", key: "id" } },
    line_type: { type: DataTypes.ENUM("item", "charge"), allowNull: false, defaultValue: "item" },
    line_no: { type: DataTypes.INTEGER, allowNull: false },
    section: { type: DataTypes.STRING(150), allowNull: true },
    item_id: { type: DataTypes.BIGINT, allowNull: true },

    name: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    brand: { type: DataTypes.STRING(100), allowNull: true },
    model_no: { type: DataTypes.STRING(100), allowNull: true },
    specs: { type: DataTypes.JSON, allowNull: true },
    hsn_sac: { type: DataTypes.STRING(10), allowNull: true },
    unit: { type: DataTypes.STRING(20), allowNull: true },

    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 1 },
    rate: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    discount_type: { type: DataTypes.ENUM("percent", "amount"), allowNull: true },
    discount_value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },

    gross_amount: money(),
    line_discount: money(),
    overall_discount_share: money(),
    taxable_amount: money(),
    gst_rate: pct(),
    cgst_rate: pct(),
    cgst_amount: money(),
    sgst_rate: pct(),
    sgst_amount: money(),
    igst_rate: pct(),
    igst_amount: money(),
    tax_amount: money(),
    line_total: money(),
  },
  {
    sequelize,
    modelName: "QuotationItem",
    tableName: "quotation_items",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["quotation_id", "line_type", "line_no"] }, { fields: ["item_id"] }],
  }
);

module.exports = QuotationItem;
