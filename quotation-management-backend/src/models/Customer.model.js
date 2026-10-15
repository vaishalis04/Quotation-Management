const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

class Customer extends Model {}

Customer.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    name: { type: DataTypes.STRING(255), allowNull: false },
    contact_person: { type: DataTypes.STRING(150), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    gstin: { type: DataTypes.STRING(15), allowNull: true }, // blank = unregistered (B2C)
    pan: { type: DataTypes.STRING(10), allowNull: true },

    billing_address: { type: DataTypes.TEXT, allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    state_code: { type: DataTypes.STRING(2), allowNull: true },
    pincode: { type: DataTypes.STRING(10), allowNull: true },

    // Delivery / site address - for goods the place of supply is where they are delivered
    shipping_address: { type: DataTypes.TEXT, allowNull: true },
    shipping_state_code: { type: DataTypes.STRING(2), allowNull: true },

    notes: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "Customer",
    tableName: "customers",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["company_id"] }, { fields: ["company_id", "name"] }, { fields: ["gstin"] }, { fields: ["is_active"] }],
  }
);

module.exports = Customer;
