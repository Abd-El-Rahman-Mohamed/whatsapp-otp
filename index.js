const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

// Log memory usage to help with debugging
function logMemoryUsage() {
  const used = process.memoryUsage();
  const messages = [];
  for (let key in used) {
    messages.push(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
  }
  console.log('MEMORY USAGE:', messages.join(', '));
}

// Log memory usage every 5 minutes
setInterval(logMemoryUsage, 5 * 60 * 1000);
logMemoryUsage(); // Log at startup

const app = express();
app.use(compression()); // Add compression for all responses
app.use(express.json({ limit: '1mb' })); // Limit request size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// QR Code storage
let qrCodeData = null;

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: '/tmp/whatsapp-auth', // Use /tmp for Railway's ephemeral storage
  }),
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
      '--js-flags="--max-old-space-size=128"',  // Limit Chrome memory usage
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--mute-audio',
      '--js-flags="--max_old_space_size=128 --expose-gc"',
      '--disable-background-networking'
    ],
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // Use custom Chromium if available
  }
});

// Store active OTPs
const activeOTPs = new Map();

// Track client state
let clientReady = false;
let restartTimeout;

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
  
  // Schedule the next restart
  scheduleRestart();
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

// Add a periodic restart mechanism to prevent session issues
function scheduleRestart() {
  // Clear any existing restart timer
  if (restartTimeout) {
    clearTimeout(restartTimeout);
  }
  
  // Schedule restart every 2 hours (reduced from 6 hours to prevent memory buildup)
  restartTimeout = setTimeout(async () => {
    console.log('Performing scheduled WhatsApp client restart...');
    
    try {
      // Set client as not ready during restart
      clientReady = false;
      
      // Try to properly destroy the client if possible
      await client.destroy().catch(err => console.log('Error during destroy:', err));
      
      // Run garbage collection if exposed
      if (global.gc) {
        try {
          global.gc();
          console.log('Manual garbage collection executed');
        } catch (e) {
          console.error('Error during manual GC:', e);
        }
      }
      
      // Small delay before reinitializing
      setTimeout(() => {
        console.log('Reinitializing WhatsApp client...');
        client.initialize();
      }, 5000);
    } catch (error) {
      console.error('Error during scheduled restart:', error);
      // Try to initialize anyway
      client.initialize();
    }
  }, 2 * 60 * 60 * 1000); // 2 hours
}

// Handle process termination signals
async function handleTermination() {
  console.log('Received termination signal, cleaning up...');
  
  try {
    // Clear all timeouts
    if (restartTimeout) {
      clearTimeout(restartTimeout);
    }
    
    // Destroy client properly
    if (client) {
      await client.destroy().catch(e => console.log('Error destroying client:', e));
    }
    
    console.log('Cleanup complete, exiting gracefully');
    process.exit(0);
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  }
}

// Listen for termination signals
process.on('SIGTERM', handleTermination);
process.on('SIGINT', handleTermination);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  handleTermination();
});

// Call this after client initialization
scheduleRestart();

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

    // Maximum retry attempts
    const MAX_RETRIES = 2;
    let retries = 0;
    let success = false;
    
    while (retries <= MAX_RETRIES && !success) {
      try {
        // Check if client is ready
        if (!clientReady) {
          console.log(`Client not ready (attempt ${retries + 1}/${MAX_RETRIES + 1}), waiting...`);
          
          if (retries === MAX_RETRIES) {
            return res.status(503).json({ 
              success: false, 
              message: 'WhatsApp service is not connected after multiple attempts. Please try again later.' 
            });
          }

          // Force restart client
          try {
            await client.destroy().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
            client.initialize();
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for client to initialize
          } catch (err) {
            console.error('Error during client restart:', err);
          }
          
          retries++;
          continue;
        }
        
        // Send OTP via WhatsApp
        await client.sendMessage(formattedNumber, 
          `Your verification code is: *${otp}*\n\nValid for 5 minutes. Do not share this code with anyone.`);
          
        // If we get here, message was sent successfully
        success = true;
        
      } catch (sendError) {
        console.error(`Send message error (attempt ${retries + 1}/${MAX_RETRIES + 1}):`, sendError);
        
        // If last retry failed, send error response
        if (retries === MAX_RETRIES) {
          // Clean up the OTP since we couldn't send it
          activeOTPs.delete(formattedNumber);
          
          return res.status(503).json({
            success: false,
            message: 'Failed to send WhatsApp message after multiple attempts',
            error: sendError.message
          });
        }
        
        // Mark client as not ready if we got a session error
        if (sendError.message.includes('Session closed') || sendError.message.includes('Protocol error')) {
          clientReady = false;
          
          // Force restart client
          try {
            await client.destroy().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
            client.initialize();
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for client to initialize
          } catch (err) {
            console.error('Error during client restart:', err);
          }
        }
        
        retries++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
      }
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