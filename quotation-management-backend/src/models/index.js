const sequelize = require("../config/db");

const Company = require("./Company.model");
const User = require("./User.model");
const Customer = require("./Customer.model");
const Item = require("./Item.model");
const Quotation = require("./Quotation.model");
const QuotationItem = require("./QuotationItem.model");
const QuotationTemplate = require("./QuotationTemplate.model");
const TermsTemplate = require("./TermsTemplate.model");
const NumberSeries = require("./NumberSeries.model");
const AuditLog = require("./AuditLog.model");

// Company -> everything it owns
Company.hasMany(User, { foreignKey: "company_id", as: "users" });
User.belongsTo(Company, { foreignKey: "company_id", as: "company" });

Company.hasMany(Customer, { foreignKey: "company_id", as: "customers" });
Customer.belongsTo(Company, { foreignKey: "company_id", as: "company" });

Company.hasMany(Item, { foreignKey: "company_id", as: "items" });
Item.belongsTo(Company, { foreignKey: "company_id", as: "company" });

Company.hasMany(Quotation, { foreignKey: "company_id", as: "quotations" });
Quotation.belongsTo(Company, { foreignKey: "company_id", as: "company" });

Company.hasMany(QuotationTemplate, { foreignKey: "company_id", as: "templates" });
QuotationTemplate.belongsTo(Company, { foreignKey: "company_id", as: "company" });

Company.hasMany(TermsTemplate, { foreignKey: "company_id", as: "terms_templates" });
TermsTemplate.belongsTo(Company, { foreignKey: "company_id", as: "company" });

Company.hasMany(NumberSeries, { foreignKey: "company_id", as: "number_series" });
NumberSeries.belongsTo(Company, { foreignKey: "company_id", as: "company" });

// Quotation
Customer.hasMany(Quotation, { foreignKey: "customer_id", as: "quotations" });
Quotation.belongsTo(Customer, { foreignKey: "customer_id", as: "customer" });

Quotation.hasMany(QuotationItem, { foreignKey: "quotation_id", as: "lines" });
QuotationItem.belongsTo(Quotation, { foreignKey: "quotation_id", as: "quotation" });

Item.hasMany(QuotationItem, { foreignKey: "item_id", as: "quotation_lines" });
QuotationItem.belongsTo(Item, { foreignKey: "item_id", as: "item" });

QuotationTemplate.hasMany(Quotation, { foreignKey: "template_id", as: "quotations" });
Quotation.belongsTo(QuotationTemplate, { foreignKey: "template_id", as: "template" });

User.hasMany(Quotation, { foreignKey: "created_by", as: "created_quotations" });
Quotation.belongsTo(User, { foreignKey: "created_by", as: "creator" });

User.hasMany(AuditLog, { foreignKey: "performed_by", as: "audit_logs" });
AuditLog.belongsTo(User, { foreignKey: "performed_by", as: "performer" });

module.exports = {
  sequelize,
  Sequelize: require("sequelize"),
  Company,
  User,
  Customer,
  Item,
  Quotation,
  QuotationItem,
  QuotationTemplate,
  TermsTemplate,
  NumberSeries,
  AuditLog,
};
