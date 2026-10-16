const { sequelize } = require("./src/models");
const { backfillItemMasters } = require("./src/services/catalogueMaster.service");

async function syncAll() {
  try {
    console.log("🔄 Syncing all models with database (alter mode)...");
    await sequelize.sync({ alter: true });
    console.log("✅ Sync complete. All tables/columns are up to date.");
    // give existing items their Product / Company / Category master rows (safe to run again)
    const linked = await backfillItemMasters();
    if (linked) console.log(`✅ Linked ${linked} existing item(s) to Product / Company / Category masters.`);
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
  } finally {
    await sequelize.close();
  }
}

syncAll();
