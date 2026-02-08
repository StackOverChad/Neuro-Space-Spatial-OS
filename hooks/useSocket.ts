// hooks/useSocket.ts
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // SMART CONNECTION LOGIC
    let url = "";
    
    // Check if we are running locally (Laptop)
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        console.log("Detected Localhost: Using Direct Connection");
        url = "http://localhost:3001";
    } else {
        // We are on mobile/remote (Ngrok)
        console.log("Detected Remote: Using Ngrok Connection");
        // PASTE YOUR STATIC NGROK URL HERE (No trailing slash)
        url = "https://refractorily-unrevived-lucio.ngrok-free.dev";
    }

    const socketInstance = io(url, {
        transports: ["websocket"],
        reconnectionAttempts: 5
    });

    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      console.log("Connected to Hive Mind:", socketInstance.id);
    });

    socketInstance.on("connect_error", (err) => {
        console.warn("Socket Connection Failed:", err.message);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return socket;
};