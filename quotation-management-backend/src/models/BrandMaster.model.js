const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Step 2: the company / brand UNDER a product (CP Plus under Camera). Optional - local / third-party items have none.
class BrandMaster extends Model {}

BrandMaster.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false }, // the business that owns it (tenant)
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "BrandMaster", tableName: "brand_masters", timestamps: true, underscored: true, paranoid: false, indexes: [{ fields: ["company_id"] }] }
);

module.exports = BrandMaster;
