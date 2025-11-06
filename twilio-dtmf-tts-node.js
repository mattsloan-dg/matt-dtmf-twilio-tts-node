const WebSocketServer = require("ws");
const { createClient, LiveTTSEvents } = require("@deepgram/sdk");

const websocketServer = new WebSocketServer.Server({ port: 3000 });
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

websocketServer.on("connection", (ws) => {
  console.log("new client connected");

  // Track streamSid because we need it to send audio back to Twilio
  let streamSid;

  const deepgram = createClient(deepgramApiKey);

  const connection = deepgram.speak.live({
    model: "aura-2-thalia-en",
    encoding: "mulaw",
    sample_rate: 8000,
  });

  connection.on(LiveTTSEvents.Open, () => {
    console.log("Connection opened");

    connection.sendText(
      "Using the keypad, please enter your 5 digit account number."
    );

    // Send Flush message to the server after sending the text
    connection.flush();

    connection.on(LiveTTSEvents.Close, () => {
      console.log("Connection closed");
    });

    connection.on(LiveTTSEvents.Audio, (data) => {
      if (streamSid && ws.readyState === WebSocket.OPEN) {
        const audioBuffer = Buffer.from(data); // Your mulaw 8kHz audio

        // This is the proper format of audio to send to Twilio.
        // You can't just send the raw audio bytes back through the websocket.
        // You need to match the JSON format exactly.
        // https://www.twilio.com/docs/voice/media-streams/websocket-messages#send-a-media-message
        ws.send(
          JSON.stringify({
            event: "media",
            streamSid: streamSid,
            media: {
              payload: audioBuffer.toString("base64"),
            },
          })
        );
      }
    });

    connection.on(LiveTTSEvents.Flushed, () => {
      console.log("Flush confirmation");
    });

    connection.on(LiveTTSEvents.Metadata, (results) => {
      console.log("Received Meatadata");
      console.log(results);
    });

    connection.on(LiveTTSEvents.Error, (e) => {
      console.log("Error: ", e);
    });

    connection.on(LiveTTSEvents.Unhandled, (data) => {
      console.log("Unhandled message: ", data);
    });

    connection.on(LiveTTSEvents.Warning, (warn) => {
      console.log("Received warning! : ", warn);
    });
  });

  // Array to store DTMF digits
  const dtmfDigits = [];

  // Timer setup
  let dtmfTimer;

  // Function to reset the timer
  const resetTimer = () => {
    // Clear existing timer if it exists
    if (dtmfTimer) {
      clearTimeout(dtmfTimer);
    }

    // Set new timer
    dtmfTimer = setTimeout(() => {
      console.log("5 seconds without a dtmf tone");
      // Can do something here such as play TTS "Please continue entering digits."
    }, 5000);
  };

  ws.on("message", (data) => {
    const twilioMessage = JSON.parse(data);

    if (twilioMessage["event"] === "connected") {
      console.log("Connected to Twilio!");
    }

    if (twilioMessage["event"] === "start") {
      streamSid = twilioMessage.streamSid;
      console.log(`Twilio Stream ID: ${streamSid}`);
    }

    if (twilioMessage["event"] === "media") {
      const media = twilioMessage["media"];
      const audio = Buffer.from(media["payload"], "base64");
      // Not doing anything with incoming audio, since it's a TTS demo
      // connection.send(audio);
    }

    if (twilioMessage["event"] === "dtmf") {
      console.log(twilioMessage);

      // Push the digit to the array
      dtmfDigits.push(twilioMessage["dtmf"]["digit"]);

      // Check if there are 5 digits now
      if (dtmfDigits.length === 5) {
        connection.sendText(
          `Thanks for entering your digits. You entered ${dtmfDigits[0]}  ${dtmfDigits[1]}  ${dtmfDigits[2]}  ${dtmfDigits[3]}  ${dtmfDigits[4]}`
        );

        // Send Flush message to the server after sending the text
        connection.flush();
      }

      // Reset the timer
      resetTimer();
    }

    if (twilioMessage["event"] === "stop") {
      console.log("Received stop message from Twilio");
      console.log(`User input: ${dtmfDigits}`);
    }

    // Initial timer start when first message comes in
    if (!dtmfTimer) {
      resetTimer();
    }
  });
});

console.log("the websocket server is running on port 3000");
