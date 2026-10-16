const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

class Item extends Model {}

Item.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    item_type: { type: DataTypes.ENUM("product", "service"), allowNull: false, defaultValue: "product" },
    // Quotation picking order: 1) product  2) company (brand, empty for local / third-party items)  3) category (the variant).
    // product "Camera" + brand "CP Plus" + category "ip 4mp dome color view with audio"
    product: { type: DataTypes.STRING(150), allowNull: true },
    // links to the masters (product_masters / brand_masters / category_masters); the text columns stay as the printed names
    product_id: { type: DataTypes.BIGINT, allowNull: true },
    brand_id: { type: DataTypes.BIGINT, allowNull: true },
    category_id: { type: DataTypes.BIGINT, allowNull: true },
    // free text so every business can use its own variants: "ip 4mp dome normal", "8 port giga", "4 zone"...
    category: { type: DataTypes.STRING(150), allowNull: true },
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
    // custom labels after brand / model no.: [{ label: "Pixels", value: "4MP" }, { label: "Lens type", value: "2.8mm" }, ...]
    specs: { type: DataTypes.JSON, allowNull: true },
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
