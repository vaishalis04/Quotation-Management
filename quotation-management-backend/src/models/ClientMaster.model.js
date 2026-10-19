const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Reference clients ("Our clients") that can be printed on a quotation before the items.
class ClientMaster extends Model {}

ClientMaster.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    location: { type: DataTypes.STRING(150), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "ClientMaster", tableName: "client_masters", timestamps: true, underscored: true, paranoid: false, indexes: [{ fields: ["company_id"] }] }
);

module.exports = ClientMaster;