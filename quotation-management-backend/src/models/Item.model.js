const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

class Item extends Model {}

Item.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    item_type: { type: DataTypes.ENUM("product", "service"), allowNull: false, defaultValue: "product" },
    // free text so every business can use its own groups: "IP Camera", "NVR", "Guard Service", "MCB", "Laptop"...
    category: { type: DataTypes.STRING(100), allowNull: true },
    sku: { type: DataTypes.STRING(60), allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    brand: { type: DataTypes.STRING(100), allowNull: true },
    model_no: { type: DataTypes.STRING(100), allowNull: true },
    hsn_sac: { type: DataTypes.STRING(10), allowNull: true }, // HSN for goods, SAC for services
    unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Nos" },
    rate: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    cost_price: { type: DataTypes.DECIMAL(14, 4), allowNull: true }, // never printed on a quotation, used for margin
    gst_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 18 },
    warranty: { type: DataTypes.STRING(100), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "Item",
    tableName: "items",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "sku"], unique: true },
      { fields: ["company_id"] },
      { fields: ["company_id", "category"] },
      { fields: ["company_id", "name"] },
      { fields: ["is_active"] },
    ],
  }
);

module.exports = Item;
