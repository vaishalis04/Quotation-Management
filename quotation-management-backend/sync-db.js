const { sequelize } = require("./src/models");

async function syncAll() {
  try {
    console.log("🔄 Syncing all models with database (alter mode)...");
    await sequelize.sync({ alter: true });
    console.log("✅ Sync complete. All tables/columns are up to date.");
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
  } finally {
    await sequelize.close();
  }
}

syncAll();
