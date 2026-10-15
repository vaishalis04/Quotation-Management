const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Running quotation number per company per financial year (resets every 1 April). Allocated inside the
// same DB transaction as the quotation insert, so a failed save never burns a number.
class NumberSeries extends Model {}

NumberSeries.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    series_key: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "quotation" },
    financial_year: { type: DataTypes.STRING(9), allowNull: false },
    last_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: "NumberSeries",
    tableName: "number_series",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["company_id", "series_key", "financial_year"], unique: true }],
  }
);

module.exports = NumberSeries;
