const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

class Company extends Model {}

Company.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    legal_name: { type: DataTypes.STRING(255), allowNull: true },
    business_type: {
      type: DataTypes.ENUM("cctv", "security", "it", "electrical", "other"),
      allowNull: false,
      defaultValue: "other",
    },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    website: { type: DataTypes.STRING(255), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    state_code: { type: DataTypes.STRING(2), allowNull: true }, // GST state code - decides CGST+SGST vs IGST
    pincode: { type: DataTypes.STRING(10), allowNull: true },
    gstin: { type: DataTypes.STRING(15), allowNull: true },
    pan: { type: DataTypes.STRING(10), allowNull: true },
    logo: { type: DataTypes.STRING(255), allowNull: true },

    bank_name: { type: DataTypes.STRING(150), allowNull: true },
    bank_account_name: { type: DataTypes.STRING(150), allowNull: true },
    bank_account_no: { type: DataTypes.STRING(30), allowNull: true },
    bank_ifsc: { type: DataTypes.STRING(15), allowNull: true },
    bank_branch: { type: DataTypes.STRING(150), allowNull: true },
    upi_id: { type: DataTypes.STRING(100), allowNull: true },

    signatory_name: { type: DataTypes.STRING(150), allowNull: true },
    signatory_designation: { type: DataTypes.STRING(150), allowNull: true },

    // Quotation defaults
    quote_prefix: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "QT" },
    quote_number_padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    default_validity_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15 },
    default_gst_treatment: { type: DataTypes.ENUM("regular", "no_gst"), allowNull: false, defaultValue: "regular" },
    default_price_mode: { type: DataTypes.ENUM("exclusive", "inclusive"), allowNull: false, defaultValue: "exclusive" },
    round_off_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    default_terms: { type: DataTypes.TEXT, allowNull: true },

    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "Company",
    tableName: "companies",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["is_active"] }, { fields: ["business_type"] }],
  }
);

module.exports = Company;
