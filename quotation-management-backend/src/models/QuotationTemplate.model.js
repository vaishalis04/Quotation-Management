const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// A quotation LAYOUT. docx/xlsx layouts are uploaded files with {placeholders}; html layouts are stored inline (Handlebars).
// company_id = NULL => a shared starter layout created by the super admin, visible to every company.
class QuotationTemplate extends Model {}

QuotationTemplate.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: true, references: { model: "companies", key: "id" } },
    name: { type: DataTypes.STRING(150), allowNull: false },
    business_type: { type: DataTypes.ENUM("cctv", "security", "it", "electrical", "other"), allowNull: false, defaultValue: "other" },
    format: { type: DataTypes.ENUM("docx", "xlsx", "html"), allowNull: false },
    file_path: { type: DataTypes.STRING(500), allowNull: true }, // relative to UPLOAD_DIR (docx / xlsx)
    original_name: { type: DataTypes.STRING(255), allowNull: true },
    html_content: { type: DataTypes.TEXT("long"), allowNull: true }, // html format only
    description: { type: DataTypes.STRING(500), allowNull: true },
    is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "QuotationTemplate",
    tableName: "quotation_templates",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["company_id"] }, { fields: ["business_type"] }, { fields: ["is_active"] }],
  }
);

module.exports = QuotationTemplate;
