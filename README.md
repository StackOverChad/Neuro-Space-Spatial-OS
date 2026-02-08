 # 🌌 Neuro-Space: The Spatial Operating System
 
**Neuro-Space** is a futuristic, web-based Spatial Operating System that merges **Artificial Intelligence**, **Blockchain**, and **Hand-Tracking** into a single immersive 3D experience.
 
Designed for the future of computing, it allows users to control windows with hand gestures, generate UI with voice commands, and sync seamlessly across devices (Desktop, Mobile, VR/AR Headsets).
 
![Neuro-Space Banner](https://via.placeholder.com/1200x600.png?text=NEURO-SPACE+v1.0)
 
---
 
## 🚀 Key Features
 
### 🧠 **Hive Mind (Generative AI)**
 
- **Voice-to-UI:** Say *"I need a stock tracker for Apple"* or *"Set a timer for 10 minutes"*, and the OS generates a functional 3D widget instantly.
- **Research Assistant:** Say *"Research Quantum Physics"*, and the system writes a summary document for you, complete with Text-to-Speech reading.
- **YouTube Agent:** Say *"Play interstellar trailer"* and it spawns a floating YouTube window with **OPEN** + **Close** controls.
- **Calendar Agent:** Say *"Schedule meeting with Alex at 14:00"* and it books a Google Calendar event (if OAuth is configured).

### 📂 **File Explorer (Window Stashing)**

- **Store any window:** Stash (store) any currently open window into the File Explorer and restore it later from a gallery.
- **Stateful restore:** Restored windows come back with saved spatial state (position + rotation) and their stored metadata (type/content/data).
- **Bulk stashing:** Say *"Store windows"* to stash all currently open windows at once.

### 💼 **LinkedIn (In-World)**

- **Open LinkedIn:** Opens LinkedIn inside an in-world browser window.
- **Search jobs:** Say *"Search LinkedIn jobs for <role> in <location>"* to open the matching LinkedIn Jobs search results.
- **Voice commands:** Use voice commands to interact with LinkedIn, such as *"Open LinkedIn"* or *"Search LinkedIn jobs for <role> in <location>"*.

### 🗺️ **Maps**

- **Open maps:** Opens the in-world maps window.
- **Search maps:** Say *"Search maps for <query>"* to search inside the maps window.
- **Directions:** Say *"Directions from <A> to <B>"* to show a route in the maps window.
- **Open Google Maps:** Opens Google Maps in a new browser tab.

### 🖐️ **Neural Hand Interface**
 
- **Grab & Move:** Use your webcam and a fist gesture to grab a window and move it in 3D space.
- **Swipe to Delete:** Flick your hand fast horizontally across a window to delete it.
- **MediaPipe Integration:** Real-time skeletal tracking without VR hardware.
- **Hand State Indicator:** Hand dots turn **red** when a fist is detected.

 ### 🥽 **VR & AR Ready**

 - **WebXR Support:** Works instantly on **Meta Quest**, **Apple Vision Pro**, or **Android AR**.
 - **Passthrough Mode:** On mobile/AR devices, windows float in your real-world room.

 ### ⚡ **Multiplayer Sync**

 - **Real-Time Collab:** See other users' avatars and hand movements as they happen.
 - **Shared Workspace:** If you move a window, it moves for everyone. Drag a video file, and everyone watches it together.

 ### 📂 **Spatial Media Core**

 - **Holograms:** Drag & Drop `.glb` files to spawn 3D models.
 - **Cinema Mode:** Drag `.mp4` files to spawn a floating video player with Play/Pause/Seek controls.
 - **Smart Docs:** Drag `.docx` files to read them in 3D.
 
 ---
 
 ## 🛠️ Prerequisites
 
 Before running the system, ensure you have:
 
 1. **Node.js** (v18 or higher)
 2. **MetaMask Extension** installed in your browser.
 3. **Google Gemini API Key** (for the AI Brain).
 4. **YouTube Data API v3 Key** (for YouTube search).
 5. (Optional) **Google Calendar OAuth Client** (for meeting scheduling).
 6. (Optional) **OpenWeather API Key** (for the Weather widget).
 7. **ngrok** (Optional: required for Mobile AR/VR testing). [Download Here](https://ngrok.com/download)
 
 ---
 
 ## 📦 Installation Guide
 
 ### 1. Clone the Repository
 
 ```bash
 git clone https://github.com/your-username/neuro-space.git
 cd neuro-space
 ```
 
 ### 2. Install Dependencies
 
 This project uses a Next.js Frontend and a Custom Node.js Server.
 
 ```bash
 # Install Frontend Dependencies
 npm install

 # Install Server Dependencies
 cd server
 npm install
 ```
 
 ### 3. Configure API Keys
 
 Create a `.env` file in the `server/` directory:

 ```text
 # server/.env
 GEMINI_API_KEY=your_actual_api_key_here
 YOUTUBE_API_KEY=your_youtube_data_api_key_here
 OPENWEATHER_API_KEY=your_openweather_key_here
 ```
 
 - **Gemini API key:** https://aistudio.google.com/app/apikey
 - **YouTube Data API v3 key:** https://console.cloud.google.com/apis/api/youtube.googleapis.com
 - **OpenWeather API key:** https://openweathermap.org/api
 
 ### 4. Enable Google Calendar Scheduling (Optional)

 Meeting scheduling uses Google Calendar OAuth.

 1. Create an OAuth Client in Google Cloud Console.
 2. Download the OAuth credentials file as JSON.
 3. Place it at:

 ```text
 server/credentials.json
 ```

 4. Start the server (`cd server && node server.js`).
 5. The server will print an authorization URL.
 6. Open it, approve access, paste the code back into the terminal.
 7. A token file will be generated:

 ```text
 server/token.json
 ```

 After that, voice commands like "Schedule meeting … at 14:00" will create events.

 ---
 
 ## 🚦 How to Run (Local Mode)
 
 ### Quick Start (New Users)
 
 1. Install dependencies:
 
    ```bash
    npm install
    cd server
    npm install
    ```
 
 2. Add your API keys in `server/.env` (see section above).
 
 3. Start the backend server:
 
    ```bash
    cd server
    node server.js
    ```
 
 4. Start the frontend:
 
    ```bash
    npm run dev
    ```
 
 5. Open: http://localhost:3000
 
 
 For development on your Laptop/PC only.
 
 ### Terminal 1: The Brain (Server)
 
 This runs the AI, YouTube search, Google Calendar scheduling, Socket.io, and Multiplayer logic.
 
 ```bash
 cd server
 node server.js
 ```
 
 You should see: `🌌 Neuro-Space Hive Mind (Autonomous) running on port 3001...`
 
 ### Terminal 2: The Interface (Frontend)
 
 This runs the 3D visual interface.
 
 ```bash
 npm run dev
 ```
 
 Open your browser to: http://localhost:3000
 
 ---
 
 ## 🌐 How to Run in VR / AR (Mobile & Headset)
 
 **Important:** WebXR (AR Mode) requires a secure HTTPS connection. It will not work on `localhost` for mobile devices. You must use **ngrok** to tunnel your connection.
 
 ### Step 1: Start your Local Server
 
 Ensure `node server.js` and `npm run dev` are running.
 
 ### Step 2: Tunnel the Frontend
 
 Open a new terminal and run:
 
 ```bash
 ngrok http 3000
 ```
 
 Copy the `https://...ngrok-free.app` URL provided.
 
 ### Step 3: Tunnel the Backend (Optional but Recommended)
 
 If you want AI & Multiplayer to work on mobile, you must also tunnel the server.
 
 Open another terminal:
 
 ```bash
 ngrok http 3001
 ```
 
 Copy this URL and update `components/Scene3D.tsx`:
 
 ```ts
 const AI_ENDPOINT = isLocal
   ? "http://localhost:3001"
   : "https://YOUR-BACKEND-URL.ngrok-free.app";
 ```
 
 ### Step 4: Open on Mobile / VR
 
 Send the Frontend HTTPS Link (from Step 2) to your phone or Quest headset.
 
 - Open it in Chrome (Android) or Meta Browser.
 - For AR: You will see an "Enter AR" button (goggles icon) or simply grant Camera permissions to see the hand tracking overlay on your camera feed.
 
 ---
 
 ## 🎮 User Manual
 
 ### Voice Commands
 
 Click "Allow Microphone" and speak clearly.
 
 | Command | Action |
| :--- | :--- |
| "Connect Wallet" | Opens MetaMask and spawns your 3D Balance Card. |
| "Research [Topic]" | Generates a document about the topic (e.g., "Research Mars"). |
| "Play [Query]" | Searches YouTube and spawns a YouTube window (OPEN + Close). |
| "Play music [Query]" | Generates a music player window and starts playback. |
| "Schedule [Meeting] at HH:MM" | Creates a Google Calendar event (requires OAuth setup). |
| "Set Timer [X] minutes" | Spawns a countdown timer widget. |
| "Check Stock [Name]" | Spawns a live stock price card (Simulated). |
| "Open Terminal" | Spawns a standard CLI window. |
| "Open notes" | Spawns a notes widget window. |
| "Open maps" | Opens the in-world maps window. |
| "Search maps for [Query]" | Searches inside the maps window. |
| "Directions from [A] to [B]" | Shows a route in the maps window. |
| "Open Google Maps" | Opens Google Maps in a new browser tab. |
| "Open LinkedIn" | Opens LinkedIn inside an in-world browser window. |
| "Search LinkedIn jobs for [Role] in [Location]" | Opens LinkedIn Jobs search results in-world. |
| "Close All" | Destroys all windows in the scene. |
| "Store windows" | Stores (stashes) all currently open windows into File Explorer. |
 
 ### Hand Gestures
 
 - **Move Window:** Pinch your Index Finger and Thumb together (Make a Fist) over a window to grab it. Move your hand to drag. Release to drop.
- **Delete Window:** Swipe your hand fast horizontally across a window to delete it.
- **Fist Indicator:** Hand dots turn **red** when the system detects a fist.
 
 ### File System
 
 Drag & Drop any `.png`, `.jpg`, `.mp4`, `.docx`, or `.glb` file from your computer directly onto the black screen. It will spawn instantly.

### File Explorer (Stashing)

- Click the **FE** icon (left side of the screen) to open the File Explorer gallery.
- Store a window to remove it from the scene and keep it in the gallery for later restore.
- Use voice command *"Store windows"* to stash everything currently open.
 
 ---
 
 ## 🔧 Troubleshooting
 
 ### Q: The AI isn't responding.
 
 Check Terminal 1.
 
 - If it says `Quota Exceeded`, you hit the free limit.
- If it says `CRITICAL: GEMINI_API_KEY is missing`, check `server/.env`.

### Q: Weather widget shows an error.

- Ensure `OPENWEATHER_API_KEY` exists in `server/.env`.

### Q: YouTube "Play" does nothing.

- Ensure `YOUTUBE_API_KEY` exists in `server/.env`.
- Ensure YouTube Data API v3 is enabled for that key.

### Q: Scheduling meetings fails.

- Ensure `server/credentials.json` exists.
- Ensure you completed the one-time OAuth flow (creates `server/token.json`).
- Time format must be **HH:MM** (24-hour).
 
 ### Q: "Enter AR" button is missing on mobile.
 
 - Ensure you are using the HTTPS link from ngrok, not `http`.
 - Ensure you are using a WebXR-compatible browser (Chrome on Android, Safari on iOS 17+, or Meta Browser).
 
 ### Q: Hand tracking is laggy.
 
 - Ensure you are in a well-lit room.
 - Make sure no other heavy apps (like Zoom) are using the camera.
 
 ---
 
 ## 📜 License
 
 This project is open-source under the MIT License. Built for the Future.
