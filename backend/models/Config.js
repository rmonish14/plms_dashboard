const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // 'system_settings'
  
  // Thresholds
  thresholds: {
    aqi: { type: Number, default: 150 },
    pm25: { type: Number, default: 35 },
    co: { type: Number, default: 9 },
    co2: { type: Number, default: 1000 }
  },
  
  // Notification channels
  notifications: {
    emailEnabled: { type: Boolean, default: false },
    emailAddr: { type: String, default: '' },
    telegramEnabled: { type: Boolean, default: false },
    telegramToken: { type: String, default: '' },
    telegramChatId: { type: String, default: '' },
    smsEnabled: { type: Boolean, default: false },
    smsNumber: { type: String, default: '' },
    notifyOnWarn: { type: Boolean, default: true },
    notifyOnCrit: { type: Boolean, default: true }
  },

  // MQTT Client connection settings
  mqtt: {
    host: { type: String, default: 'localhost' },
    port: { type: String, default: '1883' },
    user: { type: String, default: '' },
    pass: { type: String, default: '' },
    tls: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema);
