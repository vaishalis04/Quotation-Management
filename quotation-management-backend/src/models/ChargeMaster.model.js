const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Reusable additional charges (installation, freight, commissioning, AMC...) a user can pick into a quotation.
// A quotation copies the values into its own lines, so editing or deleting a master never changes an issued quotation.
class ChargeMaster extends Model {}

ChargeMaster.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    hsn_sac: { type: DataTypes.STRING(10), allowNull: true },
    default_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    gst_rate: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 18 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "ChargeMaster",
    tableName: "charge_masters",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["company_id"] }],
  }
);

module.exports = ChargeMaster;
