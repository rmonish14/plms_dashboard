# IoT Air Quality Monitoring System (AQMS)

## 1. System Architecture
The application is structured into three main components:
1. **IoT Simulators (Devices)**: Publishes simulated air quality data via MQTT. Located at `simulator.js`.
2. **Backend Engine (`/backend`)**:
   - **MQTT Broker**: Integrated `aedes` broker running on port 1883.
   - **REST API**: Node.js/Express server providing data endpoints.
   - **Database**: MongoDB for storing real-time data history, user credentials, alerts, and node definitions.
   - **WebSockets**: `socket.io` bridging MQTT events to the frontend in real-time.
3. **Frontend Dashboard (`/frontend`)**: Next.js (React), TailwindCSS, Shadcn/ui conventions, Recharts, handling visualization, real-time node monitoring, device control.

---

## 2. API Endpoints Documentation

### Authentication Base Route: `/api/auth`
- `POST /register`: Accepts `{ email, password, role }`. Returns JWT token.
- `POST /login`: Accepts `{ email, password }`. Returns JWT token.

### Nodes Base Route: `/api/nodes`
- `GET /`: Returns all registered nodes.
- `GET /:id`: Returns specific node details.
- `GET /:id/data?range=24h`: Returns historical time-series data for a node to populate charts.

### Alerts Base Route: `/api/alerts`
- `GET /`: Returns unread/active system alerts triggered by thresholds.

---

## 3. Database Schema (MongoDB / Mongoose)
- **User**: Email, Password Hash, Role (User/Admin), Preferences.
- **Node**: NodeId, Name, Status, Location, LastSeen, FirmwareVersion.
- **NodeData** (Time-Series): NodeId, Timestamp, Metrics { aqi, pm1_0, pm2_5, pm10, co, co2, temperature, humidity }.
- **Alert**: NodeId, Type (Info, Warning, Critical), Message, Timestamp, Resolved.

---

## 4. MQTT Integration Setup
- **Broker**: We implemented `Aedes` inside our Node server on port `1883`. This means no external setup is required, our backend natively understands the MQTT topics.
- **Data Topic**: `airquality/data/{nodeId}` - Used to stream JSON payloads of AQI metrics.
- **Status Topic**: `airquality/status/{nodeId}` - Used for LWT (Last Will & Testament) offline/online transitions.
- **Control**: Dashboard can publish to `airquality/control/{nodeId}` to send remote execution bounds (toggling relays logic implemented in UI).

---

## 5. Deployment Instructions

### Prerequisites
- Node.js > v18 installed
- MongoDB installed locally or via Atlas (`MONGO_URI`)

### Step 1: Start the Backend & MQTT Broker
```cmd
cd backend
npm install
npm run dev
```
*(Broker runs on 1883, API and WS run on 5000)*

### Step 2: Start the IoT Nodes Simulator
In a new terminal:
```cmd
node simulator.js
```
*(Nodes will begin publishing randomized realistic metric data via MQTT)*

### Step 3: Start the Production Frontend Dashboard
In a new terminal:
```cmd
cd frontend
npm install
npm run dev
```
*(Next.js will compile and serve the dashboard at http://localhost:3000)*

---
**Design**: The frontend uses a custom Dark-Mode Industrial Glassmorphism built natively with TailwindCSS variables for a premium, non-generic look.
