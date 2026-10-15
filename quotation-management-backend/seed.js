require('dotenv').config();
const { sequelize, Company, User, Customer, Item, TermsTemplate, QuotationTemplate } = require('./src/models');
const { sampleHtml } = require('./src/services/sampleTemplate.service');

const seed = async () => {
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('Connected to DB');

  const [company] = await Company.findOrCreate({
    where: { name: 'Demo Security Systems' },
    defaults: {
      business_type: 'cctv', email: 'info@demo.com', city: 'Indore', state: 'Madhya Pradesh', state_code: '23',
      address: '12 Market Road', quote_prefix: 'QT', signatory_name: 'Authorised Signatory',
    },
  });

  const pass = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  await User.findOrCreate({ where: { email: 'super@admin.com' }, defaults: { name: 'Super Admin', password: pass, role: 'super_admin' } });
  await User.findOrCreate({ where: { email: process.env.SEED_ADMIN_EMAIL || 'admin@company.com' },
    defaults: { name: 'Company Admin', password: pass, role: 'company_admin', company_id: company.id } });

  await Customer.findOrCreate({ where: { company_id: company.id, name: 'Sample Customer Pvt Ltd' },
    defaults: { gstin: '27AAPFU0939F1ZV', state_code: '27', state: 'Maharashtra', billing_address: '5 Industrial Area', city: 'Pune' } });

  const items = [
    { name: 'IP Dome Camera 4MP', category: 'Camera', hsn_sac: '8525', unit: 'Nos', rate: 2850, gst_rate: 18, brand: 'Generic' },
    { name: '8 Channel NVR', category: 'Recorder', hsn_sac: '8521', unit: 'Nos', rate: 12500, gst_rate: 18 },
    { name: 'CAT6 Cable (305 m box)', category: 'Cable', hsn_sac: '8544', unit: 'Box', rate: 6200, gst_rate: 18 },
    { name: 'CCTV Installation', category: 'Service', item_type: 'service', hsn_sac: '995469', unit: 'Job', rate: 3000, gst_rate: 18 },
  ];
  for (const i of items) await Item.findOrCreate({ where: { company_id: company.id, name: i.name }, defaults: i });

  await TermsTemplate.findOrCreate({ where: { company_id: company.id, name: 'Standard CCTV terms' }, defaults: {
    business_type: 'cctv', is_default: true,
    content: '50% advance with order, balance on completion\nWarranty as per manufacturer terms\nPower and civil work by customer\nPrices valid for the period stated above' } });

  await QuotationTemplate.findOrCreate({ where: { company_id: null, name: 'Standard layout (HTML)' }, defaults: {
    format: 'html', html_content: sampleHtml(), business_type: 'cctv', is_default: true, description: 'Starter layout shared with every CCTV company' } });

  console.log(`✅ Seeded. Login: admin@company.com / ${pass}  (change this password!)`);
  await sequelize.close();
};

seed().catch((e) => { console.error(e); process.exit(1); });
