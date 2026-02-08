// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { google } = require("googleapis");
const https = require("https");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config();

// --- CONFIGURATION ---
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. Validate Keys
if (!process.env.GEMINI_API_KEY) console.error("❌ MISSING: GEMINI_API_KEY in .env");
if (!process.env.YOUTUBE_API_KEY) console.error("❌ MISSING: YOUTUBE_API_KEY in .env");

// 2. AI Model Setup (Using Stable 1.5 Flash)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const app = express();
app.use(cors());
app.use(express.json());

let callAssistantLastOkAt = 0;
let callAssistantCooldownUntil = 0;

app.post("/call-assistant", async (req, res) => {
  try {
    const now = Date.now();
    if (now < callAssistantCooldownUntil) {
      return res.status(429).json({
        language: "English",
        intent: "Support",
        emotion: "Calm",
        reply: "I’m having a temporary connection issue. Please give me a moment.",
        note: {
          caller_name: "unknown",
          caller_number: "unknown",
          summary: "Assistant temporarily rate-limited",
          details: [],
          action_required: "No",
          actions: []
        }
      });
    }

    if (now - callAssistantLastOkAt < 1000) {
      return res.status(429).json({
        language: "English",
        intent: "Support",
        emotion: "Calm",
        reply: "One moment please.",
        note: {
          caller_name: "unknown",
          caller_number: "unknown",
          summary: "Assistant throttled",
          details: [],
          action_required: "No",
          actions: []
        }
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const callerUtterance = typeof body.caller_utterance === "string" ? body.caller_utterance.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!callerUtterance) {
      return res.status(400).json({ error: "caller_utterance required" });
    }

    const historyText = history
      .slice(-20)
      .map((m) => {
        const role = m && typeof m === "object" && typeof m.role === "string" ? m.role : "unknown";
        const text = m && typeof m === "object" && typeof m.text === "string" ? m.text : "";
        return `${role.toUpperCase()}: ${text}`;
      })
      .join("\n");

    const systemPrompt = `You are \"Jarvis\", a real-time phone-call assistant for Rahul.

RULES:
- You are Rahul’s assistant. You are NOT Rahul.
- Do NOT reveal you are an AI unless explicitly asked.
- If asked who you are: "I’m Rahul’s assistant."

LANGUAGE:
- Detect caller language (Hindi/English) from the caller’s message.
- Respond in the SAME language.
- Hindi must be respectful/formal (आप/जी/कृपया).

BEHAVIOR:
- If caller asks for Rahul: respond that Rahul is unavailable and they can leave a message.
- If unknown info: say you will note and confirm with Rahul.
- Never interrupt; ask clarifying questions when needed.

CLASSIFY:
- intent: Personal / Business / Sales / Support / Spam / Urgent
- emotion: Calm / Angry / Confused / Happy / Stressed

OUTPUT STRICT JSON ONLY with this schema:
{
  "language": "Hindi"|"English",
  "intent": "Personal"|"Business"|"Sales"|"Support"|"Spam"|"Urgent",
  "emotion": "Calm"|"Angry"|"Confused"|"Happy"|"Stressed",
  "reply": "string",
  "note": {
    "caller_name": "string or unknown",
    "caller_number": "string or unknown",
    "summary": "short summary",
    "details": ["Key point 1"],
    "action_required": "Yes"|"No",
    "actions": ["Call back"]
  }
}

CONVERSATION SO FAR:
${historyText || "(none)"}

CALLER SAID:
${callerUtterance}
`;

    const aiRes = await model.generateContent(systemPrompt);
    const raw = aiRes.response.text();
    const clean = String(raw).replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(200).json({
        language: "English",
        intent: "Support",
        emotion: "Calm",
        reply: "Sorry, could you please repeat that?",
        note: {
          caller_name: "unknown",
          caller_number: "unknown",
          summary: "Audio unclear / parsing failed",
          details: [callerUtterance],
          action_required: "No",
          actions: []
        }
      });
    }

    callAssistantLastOkAt = Date.now();
    return res.json(parsed);
  } catch (e) {
    console.error("/call-assistant error:", e?.message || e);

    const msg = String(e?.message || "");
    if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
      callAssistantCooldownUntil = Date.now() + 30000;
      return res.status(429).json({
        language: "English",
        intent: "Support",
        emotion: "Calm",
        reply: "I’m having a temporary connection issue. Please give me a moment.",
        note: {
          caller_name: "unknown",
          caller_number: "unknown",
          summary: "Gemini quota/rate limit",
          details: [],
          action_required: "No",
          actions: []
        }
      });
    }

    return res.status(500).json({ error: "call assistant error" });
  }
});

app.get("/weather", async (req, res) => {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENWEATHER_API_KEY missing" });
    }

    const city = typeof req.query.city === "string" && req.query.city.trim()
      ? req.query.city.trim()
      : "London";

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(apiKey)}&units=metric`;

    const w = await new Promise((resolve, reject) => {
      https
        .get(url, (r) => {
          let body = "";
          r.on("data", (chunk) => {
            body += chunk;
          });
          r.on("end", () => {
            try {
              if (r.statusCode && r.statusCode >= 200 && r.statusCode < 300) {
                resolve(JSON.parse(body));
              } else {
                reject(new Error(body || `status=${r.statusCode}`));
              }
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    });

    const out = {
      city: typeof w?.name === "string" ? w.name : city,
      country: typeof w?.sys?.country === "string" ? w.sys.country : "",
      tempC: Number.isFinite(w?.main?.temp) ? w.main.temp : undefined,
      description: Array.isArray(w?.weather) && w.weather[0] && typeof w.weather[0].description === "string" ? w.weather[0].description : "",
      humidity: Number.isFinite(w?.main?.humidity) ? w.main.humidity : undefined,
      windMs: Number.isFinite(w?.wind?.speed) ? w.wind.speed : undefined
    };

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: "Weather error" });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 50 * 1024 * 1024
});

// --- GOOGLE CALENDAR AUTH FLOW ---
const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
let calendarClient = null;

// Load Credentials & Authenticate
const loadGoogleAuth = () => {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log("⚠️ No credentials.json found. Calendar features will fail.");
    return;
  }

  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  // Support both 'installed' and 'web' formats
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if we already have a token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    calendarClient = google.calendar({ version: "v3", auth: oAuth2Client });
    console.log("✅ Google Calendar Connected.");
  } else {
    getNewToken(oAuth2Client);
  }
};

const getNewToken = (oAuth2Client) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("\n⚠️ ACTION REQUIRED: Authorize this app by visiting this url:\n", authUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\n📋 Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log("✅ Token stored to", TOKEN_PATH);
      calendarClient = google.calendar({ version: "v3", auth: oAuth2Client });
    });
  });
};

loadGoogleAuth();

// --- REAL HELPERS ---

// 1. Real YouTube Search
const searchYouTube = async (query) => {
  try {
    const youtube = google.youtube({
      version: "v3",
      auth: process.env.YOUTUBE_API_KEY
    });
    const response = await youtube.search.list({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 1
    });
    const items = response.data.items;
    if (items && items.length > 0) {
      return items[0].id.videoId;
    }
    return null;
  } catch (error) {
    console.error("YouTube Search Error:", error.message);
    return null;
  }
};

const searchYouTubeMusic = async (query) => {
  try {
    const youtube = google.youtube({
      version: "v3",
      auth: process.env.YOUTUBE_API_KEY
    });

    const response = await youtube.search.list({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 1
    });

    const items = response.data.items;
    if (!items || items.length === 0) return null;

    const item = items[0];
    const snippet = item.snippet || {};
    const thumbs = snippet.thumbnails || {};
    const thumb = (thumbs.high && thumbs.high.url)
      ? thumbs.high.url
      : (thumbs.medium && thumbs.medium.url)
        ? thumbs.medium.url
        : (thumbs.default && thumbs.default.url)
          ? thumbs.default.url
          : "";

    return {
      videoId: item.id && item.id.videoId ? item.id.videoId : null,
      title: typeof snippet.title === "string" ? snippet.title : "",
      artist: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
      thumbnail: thumb
    };
  } catch (error) {
    console.error("YouTube Music Search Error:", error.message);
    return null;
  }
};

// 2. Real Calendar Scheduler
// server/server.js

const scheduleEvent = async (summary, timeStr) => {
  if (!calendarClient) return "Error: Calendar not authenticated.";

  if (typeof timeStr !== "string" || !/^\d{1,2}:\d{2}$/.test(timeStr.trim())) {
    return "Failed to schedule event: time must be in HH:MM (24hr) format.";
  }

  // Parse time (e.g., "14:00")
  const now = new Date();
  const [hours, mins] = timeStr.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return "Failed to schedule event: invalid time.";
  }

  // Create Date object using LOCAL server time
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins, 0);

  // Logic: If the time has already passed today, schedule for TOMORROW
  // Example: It's 8 PM, you say "Schedule at 6 AM" -> System assumes tomorrow 6 AM
  if (startDate < now) {
    startDate.setDate(startDate.getDate() + 1);
  }

  const endDate = new Date(startDate);
  endDate.setMinutes(startDate.getMinutes() + 30);

  console.log(`📅 Booking for Local Time: ${startDate.toString()}`);

  const event = {
    summary: summary,
    description: "Scheduled via Neuro-Space OS",
    start: {
      dateTime: startDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Use Server's Timezone
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
  };

  try {
    const res = await calendarClient.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log(`✅ Event Link: ${res.data.htmlLink}`); // <--- CLICK THIS IN TERMINAL TO FIND IT
    return `Success! Event created: ${res.data.htmlLink}`;
  } catch (err) {
    console.error("Calendar Insert Error:", err);
    return "Failed to schedule event.";
  }
};

// --- MEMORY STORE ---
let windowsState = {};
let users = {};
let chatState = {};

console.log("Neuro-Space Hive Mind initializing...");

io.on("connection", (socket) => {
  console.log(`Unit Connected: ${socket.id}`);
  socket.emit("init_state", windowsState);
  socket.emit("init_users", users);
  socket.emit("init_chat", chatState);

  socket.on("join_user", (name) => {
    users[socket.id] = { name, color: { r: Math.random(), g: Math.random(), b: Math.random() }, x: 0, y: 0, z: 0 };
    socket.broadcast.emit("user_joined", { id: socket.id, name, color: users[socket.id].color });
  });

  socket.on("hand_move", (pos) => {
    if (users[socket.id]) {
      users[socket.id].x = pos.x;
      users[socket.id].y = pos.y;
      users[socket.id].z = pos.z;
      socket.broadcast.volatile.emit("user_moved", { id: socket.id, pos });
    }
  });

  // --- STASH SYNC ---
  socket.on("sync_stash_add", (entry) => {
    // Broadcast to all other clients (including same user in different tab)
    socket.broadcast.emit("sync_stash_add", entry);
  });

  socket.on("sync_stash_remove", (id) => {
    socket.broadcast.emit("sync_stash_remove", id);
  });

  socket.on("move_window", (data) => {
    if (!windowsState[data.id]) {
      windowsState[data.id] = { ...data };
    } else {
      Object.assign(windowsState[data.id], data);
      // Explicitly allow type upgrades
      if (data.type) windowsState[data.id].type = data.type;
      if (data.content) windowsState[data.id].content = data.content;
    }
    socket.broadcast.emit("update_window", windowsState[data.id]);
  });

  socket.on("music_action", (data) => {
    if (!data || !data.id) return;
    if (!windowsState[data.id]) return;
    windowsState[data.id].musicState = {
      action: data.action || "",
      payload: data.payload || null
    };
    socket.broadcast.emit("music_action", data);
  });

  socket.on("close_window", (id) => {
    delete windowsState[id];
    socket.broadcast.emit("window_closed", id);
  });

  socket.on("update_content", (data) => {
    if (windowsState[data.id]) windowsState[data.id].content = data.content;
    socket.broadcast.emit("update_content", data);
  });

  socket.on("chat_message", (data) => {
    try {
      if (!data || typeof data !== "object") return;
      const windowId = data.windowId;
      const text = data.text;
      const isUser = Boolean(data.isUser);
      if (typeof windowId !== "string" || typeof text !== "string") return;
      socket.broadcast.emit("chat_message", { windowId, text, isUser });
      if (!chatState[windowId]) chatState[windowId] = [];
      chatState[windowId].push({ text, isUser });
    } catch (e) {
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user_left", socket.id);
  });
});

// --- INTELLIGENT ROUTER ENDPOINT ---
app.post("/generate-ui", async (req, res) => {
  const { prompt } = req.body;
  const cleanPrompt = prompt ? prompt.toLowerCase() : "";
  console.log("🧠 Processing:", prompt);

  try {
    if (cleanPrompt.includes("research") || cleanPrompt.includes("explain")) {
      const aiRes = await model.generateContent(`
            You are a research assistant.
            Write a clear, well-structured summary for the topic/request below.
            Use headings and bullet points where helpful.
            Request: "${prompt}"
        `);

      const text = aiRes.response.text().trim();

      return res.json({
        widgets: [{
          id: `Doc_${Date.now()}`,
          type: "DOC",
          position: { x: 0, y: 2, z: 0 },
          data: { text }
        }]
      });
    }

    // 1. CHECK INTENT: MUSIC (YouTube Music mode)
    if (cleanPrompt.includes("play music") || cleanPrompt.includes("youtube music")) {
      const aiRes = await model.generateContent(`Extract the music search query from: "${prompt}". Output only the query.`);
      const searchQuery = aiRes.response.text().trim();

      console.log("🎵 Searching YouTube Music for:", searchQuery);
      const music = await searchYouTubeMusic(searchQuery);

      if (music && music.videoId) {
        return res.json({
          widgets: [{
            id: `MUSIC_${Date.now()}`,
            type: "MUSIC",
            position: { x: 0, y: 2, z: 0 },
            data: music
          }]
        });
      }
    }

    // 2. CHECK INTENT: YOUTUBE
    if (cleanPrompt.includes("play") || cleanPrompt.includes("video") || cleanPrompt.includes("youtube")) {
      // Ask AI for the search query
      const aiRes = await model.generateContent(`Extract search query from: "${prompt}". Output only the query.`);
      const searchQuery = aiRes.response.text().trim();

      console.log("🔍 Searching YouTube for:", searchQuery);
      const videoId = await searchYouTube(searchQuery);

      if (videoId) {
        return res.json({
          widgets: [{
            id: `YT_${Date.now()}`,
            type: "YOUTUBE",
            position: { x: 0, y: 2, z: 0 },
            data: { videoId: videoId }
          }]
        });
      }
    }

    // 2. CHECK INTENT: CALENDAR
    if (cleanPrompt.includes("schedule") || cleanPrompt.includes("meeting") || cleanPrompt.includes("calendar")) {
      // Ask AI to extract details
      const aiRes = await model.generateContent(`
            Extract event details from: "${prompt}".
            Output JSON: { "summary": "Meeting Title", "time": "HH:MM" } (Use 24hr format)
        `);
      const jsonText = aiRes.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      let details = null;
      try {
        details = JSON.parse(jsonText);
      } catch (e) {
        details = null;
      }

      const summary = details && typeof details.summary === "string" ? details.summary : "Meeting";
      const time = details && typeof details.time === "string" ? details.time : "09:00";
      const resultMsg = await scheduleEvent(summary, time);

      return res.json({
        widgets: [{
          id: `Cal_${Date.now()}`,
          type: "DOC",
          position: { x: 0, y: 2, z: 0 },
          data: { text: `📅 CALENDAR AGENT\n\nTitle: ${summary}\nTime: ${time}\n\n${resultMsg}` }
        }]
      });
    }

    // 3. DEFAULT: STANDARD UI GENERATION
    const systemPrompt = `
        You are a Spatial OS. Convert request to JSON.
        Widgets: WIDGET_TIMER, WIDGET_STOCK, WIDGET_NOTES, WIDGET_BROWSER, WIDGET_CALCULATOR, WIDGET_CLOCK, WIDGET_WEATHER, WIDGET_REMINDERS, DOC.
        Coordinate: User at (0,0,0). Place at z:0.
        Output JSON: { "widgets": [...] }
        Request: "${prompt}"
    `;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();

    return res.json(JSON.parse(text));

  } catch (error) {
    console.error("AI Error:", error.message);
    return res.json({ widgets: [] }); // Fail gracefully
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🌌 Neuro-Space Hive Mind (Autonomous) running on port ${PORT}...`);
});