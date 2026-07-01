// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onValueCreated } = require("firebase-functions/v2/database");

// The HTTP request handler.
const { onRequest } = require("firebase-functions/v2/https");

// The Firebase Admin SDK to access Firestore and Messaging.
const admin = require("firebase-admin");
admin.initializeApp();

const PUSH_PROVIDER = (process.env.PUSH_PROVIDER || "firebase").toLowerCase();
const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONE_SIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const ONE_SIGNAL_RESTRICTED_EXTERNAL_IDS = new Set([
  "0",
  "1",
  "-1",
  "null",
  "NULL",
  "NA",
  "NaN",
  "UNQUALIFIED",
  "all",
  "00000000-0000-0000-0000-000000000000",
  "-",
  "none",
  "ok",
  "123ABC",
  "unknown",
  "INVALID_USER",
  "undefined",
  "not set",
]);

function stringifyData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value ?? "")])
  );
}

function normalizeOneSignalExternalId(userId) {
  if (!userId) return null;

  const rawId = String(userId)
    .replace(/^usr-/, "")
    .replace(/^fbc-op-/, "");

  if (!rawId) return null;

  return ONE_SIGNAL_RESTRICTED_EXTERNAL_IDS.has(rawId)
    ? `user_${rawId}`
    : rawId;
}

function buildFirebaseChatMessage({ token, title, body, data = {}, badge = 1 }) {
  return {
    token,
    notification: {
      title,
      body,
    },
    data: stringifyData(data),
    android: {
      priority: "high",
      notification: {
        sound: "default",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
          badge,
        },
      },
    },
  };
}

async function sendFirebaseChatNotifications({ recipients, title, body, data = {} }) {
  const messages = recipients
    .filter((recipient) => recipient.token)
    .map((recipient) =>
      buildFirebaseChatMessage({
        token: recipient.token,
        title,
        body,
        data,
        badge: recipient.badge || 1,
      })
    );

  if (messages.length === 0) {
    console.log("No Firebase recipients found");
    return;
  }

  console.log(`Sending ${messages.length} Firebase chat notifications`);
  const response = await admin.messaging().sendEach(messages);
  console.log("Firebase chat notification results:", {
    successCount: response.successCount,
    failureCount: response.failureCount,
    responses: response.responses.map((resp, index) => ({
      recipient: recipients[index]?.userName || recipients[index]?.userId || null,
      success: resp.success,
      error: resp.error?.message || null,
    })),
  });
}

async function sendOneSignalChatNotifications({ recipients, title, body, data = {} }) {
  if (!ONE_SIGNAL_APP_ID || !ONE_SIGNAL_REST_API_KEY) {
    throw new Error(
      "Missing OneSignal env: ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY"
    );
  }

  const externalIds = [
    ...new Set(
      recipients
        .map((recipient) => recipient.externalId)
        .filter((externalId) => externalId && externalId.length > 0)
    ),
  ];

  if (externalIds.length === 0) {
    console.log("No OneSignal external ids found");
    return;
  }

  console.log("Sending OneSignal chat notifications:", {
    externalIds,
    recipientCount: externalIds.length,
  });

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      Authorization: `Basic ${ONE_SIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: ONE_SIGNAL_APP_ID,
      priority: "10",
      existing_android_channel_id: "high_importance_channel",
      include_external_user_ids: externalIds,
      channel_for_external_user_ids: "push",
      headings: { en: title },
      contents: { en: body || "" },
      data: {
        ...data,
        title,
        message: body || "",
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OneSignal send failed: ${response.status} ${responseText}`);
  }

  console.log("OneSignal chat notification results:", responseText);
}

async function sendChatNotifications({ recipients, title, body, data = {} }) {
  if (PUSH_PROVIDER === "onesignal") {
    return sendOneSignalChatNotifications({ recipients, title, body, data });
  }

  return sendFirebaseChatNotifications({ recipients, title, body, data });
}

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// Push Notification via HTTP request
// curl--location 'http://127.0.0.1:5001/fluxstore-inspireui/us-central1/pushNotification?email=test%40gmail.com&senderName=Chung%20Xon&message=test'
exports.pushNotification = onRequest((req, res) => {
  admin
    .firestore()
    .collection("users")
    .doc(req.query.email)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        res.status(400).json("Not Found");
      } else {
        const user = snapshot.data();
        const { senderName, message } = req.query;

        const messagePayload = {
          notification: {
            title: senderName
              ? `You have a message from "${senderName}"`
              : "You have a message",
            body: message ? message : null,
          },
          token: user.deviceToken,
          android: {
            priority: "high",
            notification: {
              sound: "default",
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
            },
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        };
        admin
          .messaging()
          .send(messagePayload)
          .then((response) => {
            console.log("Successfully sent message:", JSON.stringify(response));
            res.json({ success: true });
          })
          .catch((error) => {
            console.log("Error sending message:", JSON.stringify(error));
            res.status(500).send(error);
          });
      }
    })
    .catch((err) => {
      res.status(500).send(err);
    });
});

exports.sendNotification = onDocumentCreated(
  "chatRooms/{roomId}/chatScreen/{message}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("No data associated with the event");
      return;
    }
    const { roomId } = event.params;
    const { text, sender } = snapshot.data();

    try {
      const roomSnapshot = await admin
        .firestore()
        .doc("chatRooms/" + roomId)
        .get();

      if (!roomSnapshot.exists) {
        console.log("No data associated with the event");
        return;
      }

      const { users } = roomSnapshot.data();

      if (users instanceof Array) {
        var receivers = [];

        for await (const user of users) {
          const { email, pushToken, unread, langCode } = user;
          if (email !== sender) {
            if (pushToken) {
              receivers.push({
                userId: user.id || user.userId || user.uid || email,
                userName: email,
                externalId: normalizeOneSignalExternalId(
                  user.id || user.userId || user.uid || email
                ),
                token: pushToken,
                // If `unread` is null or equal 0, set badge to 1
                badge: unread ? unread : 1,
              });
            } else {
              const userSnapshot = await admin
                .firestore()
                .collection("users")
                .doc(email)
                .get();

              if (!userSnapshot.empty) {
                const fallbackUser = userSnapshot.data();
                const fallbackUserId =
                  fallbackUser.id ||
                  fallbackUser.userId ||
                  fallbackUser.uid ||
                  fallbackUser.ID ||
                  email;
                receivers.push({
                  userId: fallbackUserId,
                  userName: email,
                  externalId: normalizeOneSignalExternalId(fallbackUserId),
                  token: fallbackUser.deviceToken,
                  badge: unread ? unread : 1,
                });
              }
            }
          }
        }

        if (receivers.length === 0) {
          console.log("No receivers found");
          return;
        }

        console.log("Receivers:", JSON.stringify(receivers.map((receiver) => ({
          userId: receiver.userId,
          userName: receiver.userName,
          externalId: receiver.externalId,
          hasToken: Boolean(receiver.token),
          badge: receiver.badge,
        }))));

        await sendChatNotifications({
          recipients: receivers,
          title: sender
            ? `You have a message from "${sender}"`
            : "You have a message",
          body: text ? text : null,
          data: {
            type: "chat_message",
            room_id: roomId,
            sender_id: sender || "",
          },
        });
      }
    } catch (error) {
      console.error("Error in sendNotification:", error);
    }
  }
);

function buildNotifyMessageForLoyalty(transaction, token) {
  var message = {
    token: token,
    android: {
      priority: "high",
      notification: {
        sound: "default",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  switch (transaction.type) {
    case "add":
      message = {
        ...message,
        notification: {
          title: "Points added successfully",
          body: `You’re earned ${transaction.points} points.`,
        },
        data: {
          type: "points_added",
        },
      };
      break;

    case "redeem":
      message = {
        ...message,
        notification: {
          title: "Points redeemed successfully",
          body: `You’re redeemed ${transaction.points} points.`,
        },
        data: {
          type: "points_redeemed",
        },
      };
      break;
    default:
      break;
  }

  return message;
}

exports.notifyOnLoyaltyTransactionCreated = onDocumentCreated(
  "loyalty_transactions/{transactionId}",
  async (event) => {
    const { transactionId } = event.params;
    const transactionSnapshot = await admin
      .firestore()
      .collection("loyalty_transactions")
      .doc(transactionId)
      .get();

    const userId = transactionSnapshot.data()?.user_id;
    const type = transactionSnapshot.data()?.type;

    if (type == "add" || type == "redeem") {
      const loyaltyUserSnapshot = await admin
        .firestore()
        .collection("loyalty_users")
        .doc(userId)
        .get();

      const userPath = loyaltyUserSnapshot.data()?.email || userId;
      const userSnapshot = await admin
        .firestore()
        .collection("users")
        .doc(userPath)
        .get();

      const deviceToken = userSnapshot.data()?.deviceToken;
      if (!deviceToken) return null;

      const message = buildNotifyMessageForLoyalty(
        transactionSnapshot.data(),
        deviceToken
      );
      if (message) {
        admin
          .messaging()
          .send(message)
          .then((response) => {
            console.log("Successfully sent message:", JSON.stringify(response));
          })
          .catch((error) => {
            console.log("Error sending message:", JSON.stringify(error));
          });
      }
    }
  }
);

// Realtime Database trigger for chat messages (WCFM Live Chat)
exports.notifyOnRealtimeChatMessage = onValueCreated(
  "chat_messages/{messageId}",
  async (event) => {
    try {
      const messageData = event.data.val();
      const { messageId } = event.params;

      if (!messageData) {
        // No message data found for messageId
        console.log(`No message data found for messageId: ${messageId}`);
        return;
      }

      const {
        conversation_id,
        user_id: senderId,
        user_name: senderName,
        user_type: senderType,
        msg: messageText,
        vendor_id
      } = messageData;

      if (!conversation_id || !senderId) {
        // Missing required fields: conversation_id or user_id
        console.log(`Missing required fields for messageId: ${messageId}`);
        return;
      }

      let recipients = [];

      // Get the specific chat session for this conversation
      const chatSessionSnapshot = await admin
        .database()
        .ref(`chat_sessions/${conversation_id}`)
        .once("value");

      if (!chatSessionSnapshot.exists()) {
        // No chat session found for conversation_id
        console.log(`No chat session found for conversation_id: ${conversation_id}`);
        return;
      }

      const sessionData = chatSessionSnapshot.val();

      const sessionUserId = sessionData.user_id;

      // Find all users involved in this conversation
      // We need to check both the session owner and users with same vendor_id
      const potentialRecipients = [];

      // Add the session owner if they're not the sender
      if (sessionUserId && sessionUserId !== senderId) {
        potentialRecipients.push(sessionUserId);
      }

      // Get push tokens for all potential recipients
      for (const recipientUserId of potentialRecipients) {
        const recipientUserSnapshot = await admin
          .database()
          .ref(`chat_users/${recipientUserId}`)
          .once("value");

        if (!recipientUserSnapshot.exists()) {
          // No user data found for user_id
          console.log(`No user data found for user_id: ${recipientUserId}`);
          continue;
        }

        const recipientUserData = recipientUserSnapshot.val();
        if (recipientUserData.push_token) {
          recipients.push({
            userId: recipientUserId,
            externalId: normalizeOneSignalExternalId(recipientUserId),
            pushToken: recipientUserData.push_token,
            userName: recipientUserData.user_name || "User",
            userType: recipientUserData.user_type || "visitor"
          });
        }
      }

      if (recipients.length === 0) {
        // No recipients with push tokens found
        console.log(`No recipients with push tokens found for conversation_id: ${conversation_id}`);
        return;
      }

      const notificationTitle = senderName
        ? `New message from ${senderName}`
        : "You have a new message";

      const notificationBody = messageText || "New message received";

      await sendChatNotifications({
        recipients: recipients.map((recipient) => ({
          ...recipient,
          token: recipient.pushToken,
        })),
        title: notificationTitle,
        body: notificationBody,
        data: {
          type: "chat_message",
          conversation_id: conversation_id,
          sender_id: senderId,
          sender_name: senderName || "",
          message_id: messageId,
          vendor_id: vendor_id ? vendor_id.toString() : ""
        }
      });

    } catch (error) {
      console.error("Error in notifyOnRealtimeChatMessage:", error);
    }
  }
);
