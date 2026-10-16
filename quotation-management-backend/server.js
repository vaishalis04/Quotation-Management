const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const sequelize = require('./src/config/db');
const { errorHandler } = require('./src/middleware/error.middleware');
const { startExpiryScheduler } = require('./src/services/expiry.service');

const authRoutes = require('./src/routes/auth.routes');
const companyRoutes = require('./src/routes/company.routes');
const customerRoutes = require('./src/routes/customer.routes');
const itemRoutes = require('./src/routes/item.routes');
const termsRoutes = require('./src/routes/terms.routes');
const chargeRoutes = require('./src/routes/charge.routes');
const catalogueMasterRoutes = require('./src/routes/catalogueMaster.routes');
const templateRoutes = require('./src/routes/template.routes');
const quotationRoutes = require('./src/routes/quotation.routes');
const metaRoutes = require('./src/routes/meta.routes');
const reportRoutes = require('./src/routes/report.routes');

const app = express();

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      if (process.env.SYNC_DB === 'true') {
        await sequelize.sync({ alter: true });
        console.log('✅ Database synchronized.');
      } else {
        console.log('ℹ️ Database sync skipped. Using existing tables.');
      }
      startExpiryScheduler();
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
    }
  })();
}

const allowedOrigins = ['http://localhost:5173', process.env.CLIENT_URL].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`❌ Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
}));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// company logos are public images; layouts (docx/xlsx) are NOT served statically - they are only read by the renderer
const { UPLOAD_DIR } = require('./src/middleware/upload.middleware');
const path = require('path');
app.use('/uploads/logos', express.static(path.join(UPLOAD_DIR, 'logos'), { fallthrough: false, maxAge: '1d' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/terms-templates', termsRoutes);
app.use('/api/v1/charges', chargeRoutes);
app.use('/api/v1/catalogue-masters', catalogueMasterRoutes);
app.use('/api/v1/quotation-templates', templateRoutes);
app.use('/api/v1/quotations', quotationRoutes);
app.use('/api/v1/meta', metaRoutes);
app.use('/api/v1/reports', reportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'MySQL' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5700;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;
