# Negotiation Platform

Pairs participants as buyers and sellers in a simulated battery-unit sale negotiation, varying outside options (BATNA) to study how disagreement points affect negotiated outcomes.

![Status](https://img.shields.io/badge/status-not_deployed-lightgrey)
![Database](https://img.shields.io/badge/database-unknown-lightgrey)
![Preregistration](https://img.shields.io/badge/preregistered-not_preregistered-lightgrey)

## Study

Participants are recruited via Prolific and randomly assigned one of four roles: optimistic buyer, pessimistic buyer, optimistic seller, or pessimistic seller. Each role carries a different outside-option value (BATNA) that shapes their private instructions. Matched pairs negotiate in real time via text chat; outcomes, pre-negotiation expectations, and post-negotiation demographics are all recorded.

- **Conditions:** `optimisticBuyer` (BATNA $2.5m), `pessimisticBuyer` (BATNA $3.5m), `optimisticSeller` (BATNA $3.0m), `pessimisticSeller` (BATNA $2.0m)
- **Randomization:** Server-side balanced assignment — incoming participant is assigned to whichever side (buyer or seller) currently has fewer waiting participants; optimistic vs. pessimistic variant chosen at random within that side

## Data collected

| Field | Type | Notes |
|---|---|---|
| `participant_id` | string | P-XXXX-XXXX format, server-generated |
| `worker_id` | string | Prolific participant ID |
| `session_id` | string | Shared by paired participants |
| `role` | string | Experimental condition |
| `partner_id` | string | Paired participant's ID |
| `partner_role` | string | Paired participant's condition |
| `target_price` | text | Pre-negotiation target price |
| `justification` | text | Pre-negotiation justification |
| `walkaway_point` | text | Pre-negotiation walkaway price |
| `expected_outcome` | string | Pre-negotiation expected outcome (multiple choice) |
| `final_agreement` | decimal | Agreed price, if deal reached |
| `agreement_reached` | boolean | Whether negotiation ended in deal |
| `negotiation_duration_seconds` | integer | Chat duration |
| `chat_started_at` | timestamp | |
| `chat_ended_at` | timestamp | |
| `gender` | string | Post-negotiation demographic |
| `age` | string | Post-negotiation demographic |
| `ethnicity` | string | Post-negotiation demographic |
| `education` | string | Post-negotiation demographic |
| `political_orientation` | string | Post-negotiation demographic |
| `negotiation_experience` | string | Post-negotiation demographic |
| `comments` | text | Open-ended comments |
| `quiz_q1`–`quiz_q3` | string | Comprehension quiz first-attempt answers |
| `quiz_q1_retake`–`quiz_q3_retake` | string | Comprehension quiz second-attempt answers |
| `quiz_score` | integer | |
| `quiz_passed` | boolean | |
| `quiz_attempts` | integer | |
| `completed_study` | boolean | |
| `dropout_stage` | string | Stage at which participant exited |

Chat messages are stored in a separate table: `session_id`, `sender_participant_id`, `recipient_participant_id`, `message_text`, `seconds_since_chat_start`.

## Quality controls

- **Attention checks:** 3-question role-specific comprehension quiz covering the negotiation scenario and the participant's assigned BATNA value; all three questions must be answered correctly
- **Exclusion logic:** Mobile devices blocked at entry; duplicate Prolific IDs redirected to `/alreadyParticipated`; quiz failure on retake routes to `/quizFailure`; 10-minute partner-wait timeout routes to `waitingTimeout` dropout stage

## Local development

```bash
npm install
npm install --prefix client
npm install --prefix server
DEMO_MODE=true npm run dev-local
```

Demo mode runs with an in-memory SQLite database and a simulated partner — no external database required. Open http://localhost:3000 and enter any text as a participant ID.

## Deployment

Deployed to Heroku via `Procfile` (`web: npm start`). Requires a PostgreSQL database (tested with AWS Aurora Serverless v2). Set `POSTGRES_DATABASE_URL`, `NODE_ENV=production`, and connection-pool settings via `heroku config:set`. The `heroku-postbuild` script installs dependencies for both client and server and builds the React frontend. Database tables are created automatically on first run.
