const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Step 3: the variant UNDER a company (or directly under a product when there is no company), e.g. "ip 4mp dome color view with audio". Optional.
class CategoryMaster extends Model {}

CategoryMaster.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false }, // the business that owns it (tenant)
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    brand_id: { type: DataTypes.BIGINT, allowNull: true }, // empty = sits directly under the product (local / third-party)
    name: { type: DataTypes.STRING(150), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "CategoryMaster", tableName: "category_masters", timestamps: true, underscored: true, paranoid: false, indexes: [{ fields: ["company_id"] }] }
);

module.exports = CategoryMaster;
