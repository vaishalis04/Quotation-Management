const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Step 1 of the catalogue: what the thing is (Camera, NVR, Cable, Installation...). Required on every item.
class ProductMaster extends Model {}

ProductMaster.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false }, // the business that owns it (tenant)
    name: { type: DataTypes.STRING(150), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "ProductMaster", tableName: "product_masters", timestamps: true, underscored: true, paranoid: false, indexes: [{ fields: ["company_id"] }] }
);

module.exports = ProductMaster;
