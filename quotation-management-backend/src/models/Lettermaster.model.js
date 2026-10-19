const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Saved covering letters ("Dear Sir, ...") that can be picked into a quotation and edited there.
class LetterMaster extends Model {}

LetterMaster.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "LetterMaster", tableName: "letter_masters", timestamps: true, underscored: true, paranoid: false, indexes: [{ fields: ["company_id"] }] }
);

module.exports = LetterMaster;