# WhatsApp OTP Verification Service

A free WhatsApp OTP (One-Time Password) verification service built using whatsapp-web.js and Express.

## Features

- Send OTP verification codes via WhatsApp
- Verify OTP responses through WhatsApp or API
- Easy to integrate with any application
- Deployable on Railway

## Prerequisites

- Node.js 14+ installed
- A WhatsApp account with an active number

## Setup

1. Clone this repository:
```
git clone https://github.com/yourusername/whatsapp-otp.git
cd whatsapp-otp
```

2. Install dependencies:
```
npm install
```

3. Start the application:
```
npm start
```

4. When you first run the application, a QR code will be displayed in the terminal. Scan this with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Tap Menu or Settings
   - Select WhatsApp Web
   - Scan the QR code displayed in the terminal

## Usage

### Sending an OTP

Send a POST request to `/send-otp` with the following JSON payload:

```json
{
  "phoneNumber": "1234567890"
}
```

The phone number should be in international format without any symbols (e.g., "1234567890").

### Verifying an OTP

OTPs can be verified in two ways:

1. **Via WhatsApp**: The recipient can simply reply to the WhatsApp message with the OTP code.

2. **Via API**: Send a POST request to `/verify-otp` with the following JSON payload:

```json
{
  "phoneNumber": "1234567890",
  "otp": "123456"
}
```

## Deployment on Railway

1. Create a Railway account at [railway.app](https://railway.app)

2. Install the Railway CLI:
```
npm i -g @railway/cli
```

3. Login to Railway:
```
railway login
```

4. Initialize Railway in your project:
```
railway init
```

5. Deploy your app:
```
railway up
```

6. After deployment, visit your deployed application's URL (e.g., https://your-app-name.railway.app) to see the QR code in the browser.

7. You can also access the QR code directly at the `/qr` endpoint: `https://your-app-name.railway.app/qr`

8. Scan the QR code with your WhatsApp app to authenticate.

9. After scanning, refresh the page to confirm authentication was successful.

### Troubleshooting Railway Deployment

If you encounter QR code issues in Railway:

1. **Can't see the QR code in logs**: The QR code in Railway's logs is often unreadable. Use the web interface instead by visiting your app's URL.

2. **Authentication not persisting**: Railway might not persist the WhatsApp session between deployments. You may need to re-authenticate after redeployments.

3. **Session storage issues**: To improve persistence, consider using a database or storage service instead of local auth storage.

## API Endpoints

- `GET /`: Health check endpoint
- `POST /send-otp`: Send an OTP to a WhatsApp number
- `POST /verify-otp`: Verify an OTP via API

## License

MIT 