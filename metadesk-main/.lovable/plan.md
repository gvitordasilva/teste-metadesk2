

## Evaluation: Attendant Receiving Inbound Phone Calls

### Current State

The system currently has:
- **Twilio secrets** configured (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- **ElevenLabs voice agent** for public-facing AI conversations (WebRTC in browser)
- **Voice agent tools** edge function that handles complaint creation and transfer to human queue
- **No inbound call handling** -- there is no Twilio webhook to receive phone calls, no TwiML generation, and no mechanism to connect a phone call to an attendant's browser

### Architecture Options

There are two viable approaches to route a phone call to an attendant:

**Option A -- Browser-based WebRTC via Twilio Client SDK**
The attendant receives the call directly in their browser using the Twilio JS SDK. The flow:
1. Inbound call hits Twilio phone number
2. Twilio webhook (edge function) generates TwiML that either enqueues the caller or connects to AI agent first
3. When transferred to human, Twilio dials the attendant via their Twilio Client identity (browser WebRTC)
4. Attendant answers in the Atendimento page -- no physical phone needed

**Option B -- Twilio forwards to attendant's physical phone**
Simpler but less integrated: Twilio dials the attendant's personal phone number. Less control, costs per minute, and the attendant leaves the platform context.

### Recommended: Option A (Browser WebRTC)

This keeps everything inside the platform and integrates with the existing omnichannel queue.

### Implementation Plan

#### 1. Edge Function: `twilio-voice-webhook` (new)
Handles inbound calls from Twilio. Generates TwiML to:
- Greet caller with `<Say>` or `<Play>`
- Optionally route through ElevenLabs AI agent first (via `<Stream>` or `<Connect>`)
- When transfer requested, use `<Enqueue>` to place caller in a Twilio queue
- Create a `service_queue` entry with `channel = 'phone'`

#### 2. Edge Function: `twilio-token` (new)
Generates a Twilio Access Token with Voice grant for the attendant's browser, using their `user_id` as the Twilio Client identity.

#### 3. Edge Function: `twilio-dequeue` (new)
When an attendant accepts a call, dequeues the Twilio call and connects it to the attendant's Twilio Client identity via `<Dial><Client>`.

#### 4. Frontend: Voice call component in Atendimento
- On page load (if attendant is online), initialize Twilio Device with token from `twilio-token`
- Show incoming call indicator when a phone-channel queue item is assigned via round-robin
- Accept/reject call buttons
- In-call controls (mute, hold, end)
- Integrates with existing `ConversationView` for notes, forwarding, and session tracking

#### 5. Database
- No schema changes needed -- `service_queue` already supports `channel = 'phone'` and `voice_session_id`
- The Twilio Call SID would be stored in `voice_session_id`

#### 6. Twilio Configuration (manual by user)
- Set the Twilio phone number's Voice webhook URL to the `twilio-voice-webhook` edge function
- Create a TwiML App in Twilio console pointing to the dequeue function

### Dependencies & Secrets
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` -- already configured
- Need to add: `TWILIO_TWIML_APP_SID` and `TWILIO_API_KEY` + `TWILIO_API_SECRET` (for Access Token generation)
- Frontend needs `@twilio/voice-sdk` npm package

### Complexity Assessment
This is a **high-complexity feature** involving:
- 3 new edge functions with Twilio TwiML/token logic
- npm dependency addition (`@twilio/voice-sdk`)
- New UI components for call controls
- Twilio console configuration by the user
- Testing requires an actual Twilio phone number receiving real calls

### Recommendation
The feature is fully viable with the current infrastructure. The Twilio secrets are already in place. The main work is building the webhook chain (TwiML generation), the browser-side Twilio Device integration, and the call UI in the Atendimento page.

Shall I proceed with implementation?

