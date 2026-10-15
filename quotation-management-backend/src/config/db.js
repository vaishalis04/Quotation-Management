// config/db.js - Sequelize Configuration
const { Sequelize } = require("sequelize");
require("dotenv").config();

const dialect = process.env.DB_DIALECT || "mysql";

const sequelize = new Sequelize(
  process.env.DB_NAME || "quotation_management",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "root",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect,
    storage: process.env.DB_STORAGE, // only used when DB_DIALECT=sqlite (tests)
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: {
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
      underscored: true,
      timestamps: true,
      paranoid: false,
    },
    ...(dialect === "mysql" && { timezone: "+05:30" }),
  }
);

module.exports = sequelize;
