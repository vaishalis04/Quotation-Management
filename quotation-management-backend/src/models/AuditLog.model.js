const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

class AuditLog extends Model {}

AuditLog.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: true },
    entity_type: { type: DataTypes.STRING(50), allowNull: false },
    entity_id: { type: DataTypes.BIGINT, allowNull: true },
    action: { type: DataTypes.STRING(50), allowNull: false },
    performed_by: { type: DataTypes.BIGINT, allowNull: true },
    details: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: "AuditLog",
    tableName: "audit_logs",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["entity_type", "entity_id"] }, { fields: ["company_id"] }],
  }
);

module.exports = AuditLog;
