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
  "phoneNumber": "1234567890",
  "callbackUrl": "https://your-service.com/verify-callback" // Optional
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

## Deploying to Railway

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

6. Set up environment variables in the Railway dashboard if needed

## API Endpoints

- `GET /`: Health check endpoint
- `POST /send-otp`: Send an OTP to a WhatsApp number
- `POST /verify-otp`: Verify an OTP via API

## License

MIT 