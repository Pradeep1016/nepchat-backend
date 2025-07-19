// server.js

// 1. SETUP
// Import necessary packages
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

// Create the Express app and the HTTP server
const app = express();
const server = http.createServer(app);

// --- IMPORTANT: CORS Configuration ---
// This is crucial for allowing your Vercel frontend to communicate with this backend.
// Replace 'https://your-frontend-domain.vercel.app' with your actual Vercel deployment URL.
const corsOptions = {
  origin: "https://nepchat-frontend.vercel.app", // For development, you can use '*' but for production, specify your frontend URL
  methods: ["GET", "POST"]
};
app.use(cors(corsOptions));


// 2. SOCKET.IO SERVER INITIALIZATION
// Create a new Socket.IO server and attach it to the HTTP server.
// Configure it to use the same CORS options.
const io = new Server(server, {
  cors: corsOptions
});

// 3. USER MATCHING LOGIC
// This array will hold users who are waiting for a partner.
let waitingUsers = [];

// 4. SOCKET.IO CONNECTION HANDLING
// This is the main event listener. It runs whenever a new user connects to our server.
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // --- Event: A user wants to find a stranger ---
  socket.on('find-stranger', (data) => {
    console.log(`User ${socket.id} is looking for a ${data.type} chat.`);
    
    // Add the current user to the waiting queue.
    // We also store their desired call type.
    socket.callType = data.type;
    waitingUsers.push(socket);

    // --- Try to pair users ---
    // If there are 2 or more users waiting, let's pair them!
    if (waitingUsers.length >= 2) {
      // Pull two users from the front of the queue
      const user1 = waitingUsers.shift();
      const user2 = waitingUsers.shift();

      // Pair them by storing the other's ID on their socket object
      user1.strangerId = user2.id;
      user2.strangerId = user1.id;

      console.log(`Pairing ${user1.id} and ${user2.id}`);

      // Notify both users that a stranger has been found.
      // This will trigger the WebRTC connection process on the frontend.
      user1.emit('stranger-found', { id: user2.id, callType: user2.callType });
      user2.emit('stranger-found', { id: user1.id, callType: user1.callType });
    }
  });

  // --- Event: Relaying WebRTC signals ---
  // These are the technical messages (offers, answers, ICE candidates)
  // that two browsers need to exchange to connect directly via video/audio.
  socket.on('webrtc-signal', (payload) => {
    console.log(`Relaying WebRTC signal from ${socket.id} to ${payload.to}`);
    // The server just acts as a middleman here.
    io.to(payload.to).emit('webrtc-signal', {
      from: socket.id,
      signal: payload.signal
    });
  });
  
  // --- Event: Relaying chat messages ---
  socket.on('send-message', (payload) => {
    // When a user sends a message, we forward it to their stranger.
    if (socket.strangerId) {
       console.log(`Relaying message from ${socket.id} to ${socket.strangerId}`);
       io.to(socket.strangerId).emit('new-message', { text: payload.text });
    }
  });
  
  // --- Event: Relaying media status (video on/off) ---
  socket.on('media-status-changed', (payload) => {
      if (socket.strangerId) {
          console.log(`Relaying media status from ${socket.id} to ${socket.strangerId}`);
          io.to(socket.strangerId).emit('stranger-media-status', { video: payload.video });
      }
  });

  // --- Event: User disconnects ---
  // This can happen if they close the tab or click "Disconnect".
  const handleDisconnect = () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // If the disconnected user had a stranger, notify them.
    if (socket.strangerId) {
      io.to(socket.strangerId).emit('stranger-disconnected');
      // Clear the strangerId from the other user's socket
      const strangerSocket = io.sockets.sockets.get(socket.strangerId);
      if (strangerSocket) {
          strangerSocket.strangerId = null;
      }
    }

    // Remove the user from the waiting queue if they were in it.
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
  }
  
  socket.on('disconnect-chat', handleDisconnect);
  socket.on('disconnect', handleDisconnect);

});


// 5. START THE SERVER
// Use the PORT environment variable provided by Render, or 5000 for local development.
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

