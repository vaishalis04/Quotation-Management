const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Reusable terms & conditions blocks (warranty, payment, AMC, installation scope...) a user can pick into a quotation.
class TermsTemplate extends Model {}

TermsTemplate.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    name: { type: DataTypes.STRING(150), allowNull: false },
    business_type: { type: DataTypes.ENUM("cctv", "security", "it", "electrical", "other"), allowNull: false, defaultValue: "other" },
    content: { type: DataTypes.TEXT, allowNull: false }, // one term per line
    is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "TermsTemplate",
    tableName: "terms_templates",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["company_id"] }],
  }
);

module.exports = TermsTemplate;
