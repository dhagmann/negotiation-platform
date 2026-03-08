# Negotiation Experiment Platform

A web-based platform for running real-time negotiation experiments. The platform pairs participants as buyers and sellers who negotiate the price of a battery unit through a structured chat interface. It handles the full experiment flow: participant onboarding, role assignment, comprehension checks, real-time matching, timed negotiations with offer mechanics, and post-experiment surveys.

## Disclaimer

This software is provided as-is for research and educational purposes. **No guarantees of functionality, security, or suitability for any particular purpose are made. No technical support is provided.** Use at your own risk.

## Demo Mode

Demo mode lets you experience the full experiment flow on your own computer without needing a database or any external services. You walk through the experiment as a single user; when you reach the matching stage, the system automatically simulates a partner so you can explore the chat and offer interface. No data is saved anywhere — everything is held in temporary memory and disappears when you stop the server.

### Running in Demo Mode

1. Make sure you have [Node.js](https://nodejs.org/) (version 14 or higher) installed.

2. Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ..
   cd server && npm install && cd ..
   ```

3. Create a `.env` file in the root directory with:
   ```
   DEMO_MODE=true
   ```

4. Start the application:
   ```bash
   npm run dev-local
   ```

5. Open http://localhost:3000 in your browser and enter any text as a participant ID.

### What to Expect in Demo Mode

- You will go through the full experiment flow: introduction pages, role instructions, a comprehension quiz, and then the negotiation.
- At the matching stage, you will briefly see a "Waiting" message before being automatically matched with a simulated partner.
- In the chat, you can send messages and make offers. Offers from your simulated partner will be auto-accepted after a couple of seconds so you can complete the full negotiation flow (accept, confirm, reach agreement).
- After the chat, you can complete the post-experiment surveys and see the payment page.
- All data is temporary. Restarting the server clears everything.

## Production Deployment

To run real experiments with multiple participants being matched together, you need a PostgreSQL database and a hosting platform.

### Prerequisites

- Node.js 14+
- A PostgreSQL database (tested with AWS Aurora Serverless v2, but any PostgreSQL instance works)
- A hosting platform such as Heroku

### Database Setup

1. Create a PostgreSQL database.
2. Copy `env.template` to `.env` in the root directory.
3. Fill in your database credentials:
   ```
   DB_HOST=your-database-host
   DB_USER=your_db_user
   DB_PASSWORD=your_password
   DB_NAME=your_database_name
   DB_PORT=5432
   ```
   Alternatively, you can provide a single connection URL:
   ```
   POSTGRES_DATABASE_URL=postgresql://user:password@host:5432/dbname
   ```
4. Make sure `DEMO_MODE` is **not** set (or set to `false`).
5. Database tables are created automatically on first run.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DEMO_MODE` | No | Set to `true` to run in demo mode (no database needed) |
| `NODE_ENV` | Yes | `development` or `production` |
| `DB_HOST` | For production | Database hostname |
| `DB_USER` | For production | Database username |
| `DB_PASSWORD` | For production | Database password |
| `DB_NAME` | For production | Database name |
| `DB_PORT` | For production | Database port (default: 5432) |
| `POSTGRES_DATABASE_URL` | Alternative | Full PostgreSQL connection URL (use instead of individual DB_ variables) |
| `PORT` | No | Server port (default: 5000) |

### Deploying to Heroku

1. Create a Heroku app.
2. Set your environment variables:
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set POSTGRES_DATABASE_URL="postgresql://user:password@host:5432/dbname"
   ```
3. Push your code:
   ```bash
   git push heroku main
   ```

## Project Structure

```
client/                  React frontend application
  src/
    pages/               Experiment flow pages (landing, instructions, quiz, chat, payment)
    components/          UI components (chat interface, offer slider, confirmation)
    hooks/               Custom React hooks (socket connection management)
server/                  Express backend
  index.js               Main server with Socket.IO handlers and API endpoints
  models/                Sequelize database models (Participant, ChatMessage)
  config/                Session timeout configuration
  utils/                 Utility modules (logging, session management)
```

## Technology Stack

- **Frontend**: React, Bootstrap
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.IO
- **Database**: PostgreSQL via Sequelize ORM (SQLite in demo mode)
