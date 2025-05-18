const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// QR Code storage
let qrCodeData = null;

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
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--js-flags="--max-old-space-size=128"'  // Limit Chrome memory usage
    ],
    headless: true,
  }
});

// Store active OTPs
const activeOTPs = new Map();

// Track client state
let clientReady = false;

// Generate a random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// WhatsApp client events
client.on('qr', (qr) => {
  console.log('QR RECEIVED:');
  qrCodeData = qr;
  
  // Generate QR in console for local development
  qrcode.generate(qr, {small: true});
  console.log('Scan the QR code above to authenticate WhatsApp Web.');
  console.log('---------------------------------------------');
  console.log('If deployed, visit /qr endpoint to see the QR code in browser');
  console.log('---------------------------------------------');
});

client.on('ready', () => {
  qrCodeData = null; // Clear QR data when client is ready
  clientReady = true;
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

// Modify index.js to add reconnection logic
client.on('disconnected', async (reason) => {
  console.log('WhatsApp client disconnected:', reason);
  clientReady = false;
  console.log('Attempting to reconnect...');
  // Wait a bit before reinitializing
  setTimeout(() => {
    client.initialize();
  }, 3000);
});

// Initialize the WhatsApp client
client.initialize();

// API endpoints
app.get('/', (req, res) => {
  if (qrCodeData) {
    res.send(`
      <html>
        <head>
          <title>WhatsApp OTP Verification Service</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
            .container { max-width: 600px; margin: 0 auto; }
            .qr-container { margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>WhatsApp OTP Verification Service</h1>
            <p>Scan the QR code below to authenticate WhatsApp Web</p>
            <div class="qr-container">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}" alt="WhatsApp QR Code" />
            </div>
            <p>After scanning, refresh this page to verify authentication status.</p>
          </div>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <head>
          <title>WhatsApp OTP Verification Service</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
            .container { max-width: 600px; margin: 0 auto; }
            .status { padding: 10px; border-radius: 5px; margin: 20px 0; }
            .connected { background-color: #d4edda; color: #155724; }
            .disconnected { background-color: #f8d7da; color: #721c24; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>WhatsApp OTP Verification Service</h1>
            <div class="status ${clientReady ? 'connected' : 'disconnected'}">
              <p>${clientReady ? 
                '✅ Service is running and WhatsApp is connected!' : 
                '❌ Service is running but WhatsApp is NOT connected!'}
              </p>
            </div>
            ${!clientReady ? 
              '<p>Please wait for the service to reconnect, or check the logs for errors.</p>' : 
              '<p>Use the API endpoints to send and verify OTPs.</p>'}
            <p><strong>Status Endpoint:</strong> <a href="/status">/status</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// QR code endpoint
app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.setHeader('Content-Type', 'image/png');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}`;
    
    // Redirect to QR service
    res.redirect(qrUrl);
  } else {
    res.status(404).send('No QR code available. WhatsApp client might be already authenticated.');
  }
});

// Endpoint to send OTP
app.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber, callbackUrl } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    
    // Check if client is ready
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        message: 'WhatsApp service is not connected. Please check /status endpoint and try again later.' 
      });
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
    
    try {
      // Send OTP via WhatsApp with retry logic
      await client.sendMessage(formattedNumber, 
        `Your verification code is: *${otp}*\n\nValid for 5 minutes. Do not share this code with anyone.`);
    } catch (sendError) {
      console.error('Send message error:', sendError);
      
      // If we get a session error, mark client as not ready
      if (sendError.message.includes('Session closed')) {
        clientReady = false;
        client.initialize(); // Try to reconnect
        
        return res.status(503).json({
          success: false,
          message: 'WhatsApp service temporarily unavailable. Please try again in a few minutes.',
          error: 'Session error'
        });
      }
      
      throw sendError; // Re-throw for the outer catch block
    }
    
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

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({
    clientReady: clientReady,
    qrAvailable: qrCodeData !== null
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 