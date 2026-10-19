const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Wide header / footer images printed on every page. The file itself lives on disk (uploads/letterheads);
// a quotation keeps the file NAME, so replacing or deleting a master never changes an issued quotation.
class LetterheadImage extends Model {}

LetterheadImage.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    kind: { type: DataTypes.ENUM("header", "footer"), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    file_name: { type: DataTypes.STRING(150), allowNull: false },
    mime: { type: DataTypes.STRING(50), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "LetterheadImage", tableName: "letterhead_images", timestamps: true, underscored: true, paranoid: false, indexes: [{ fields: ["company_id", "kind"] }] }
);

module.exports = LetterheadImage;