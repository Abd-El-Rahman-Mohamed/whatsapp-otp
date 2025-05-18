const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    headless: true,
  }
});

// Store active OTPs
const activeOTPs = new Map();

// Generate a random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// WhatsApp client events
client.on('qr', (qr) => {
  console.log('QR RECEIVED:');
  qrcode.generate(qr, {small: true});
  console.log('Scan the QR code above to authenticate WhatsApp Web.');
});

client.on('ready', () => {
  console.log('WhatsApp client is ready!');
});

client.on('message', async (message) => {
  if (activeOTPs.has(message.from)) {
    const otpData = activeOTPs.get(message.from);
    if (message.body === otpData.otp) {
      await message.reply('✅ OTP verified successfully!');
      
      // Notify the requesting service about verification
      if (otpData.callbackUrl) {
        try {
          // In a real app, you would make an HTTP request to the callback URL
          console.log(`OTP verified for ${message.from}, notifying: ${otpData.callbackUrl}`);
        } catch (error) {
          console.error('Error notifying service:', error);
        }
      }
      
      // Remove the OTP from active list
      activeOTPs.delete(message.from);
    } else {
      await message.reply('❌ Invalid OTP. Please try again.');
    }
  }
});

// Initialize the WhatsApp client
client.initialize();

// API endpoints
app.get('/', (req, res) => {
  res.send('WhatsApp OTP Verification Service is running!');
});

// Endpoint to send OTP
app.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber, callbackUrl } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    
    // Format phone number to WhatsApp format (with @c.us suffix)
    const formattedNumber = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber.replace(/[^\d]/g, '')}@c.us`;
    
    // Generate OTP
    const otp = generateOTP();
    
    // Save OTP to active list with expiration (5 minutes)
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 5);
    
    activeOTPs.set(formattedNumber, {
      otp,
      expiry: expiryTime,
      callbackUrl
    });
    
    // Send OTP via WhatsApp
    await client.sendMessage(formattedNumber, 
      `Your verification code is: *${otp}*\n\nValid for 5 minutes. Do not share this code with anyone.`);
    
    // Set up expiration for this OTP
    setTimeout(() => {
      if (activeOTPs.has(formattedNumber) && 
          activeOTPs.get(formattedNumber).otp === otp) {
        activeOTPs.delete(formattedNumber);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    return res.json({ 
      success: true, 
      message: 'OTP sent successfully',
      phoneNumber: formattedNumber
    });
    
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to send OTP',
      error: error.message
    });
  }
});

// Verify OTP via API (alternative to WhatsApp verification)
app.post('/verify-otp', (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    
    if (!phoneNumber || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and OTP are required' 
      });
    }
    
    // Format phone number
    const formattedNumber = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber.replace(/[^\d]/g, '')}@c.us`;
    
    // Check if OTP exists and is valid
    if (activeOTPs.has(formattedNumber) && 
        activeOTPs.get(formattedNumber).otp === otp) {
      
      // Remove the OTP from active list
      activeOTPs.delete(formattedNumber);
      
      return res.json({ 
        success: true, 
        message: 'OTP verified successfully' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP or expired' 
      });
    }
    
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to verify OTP',
      error: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 