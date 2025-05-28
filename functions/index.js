// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onValueCreated } = require("firebase-functions/v2/database");

// The HTTP request handler.
const { onRequest } = require("firebase-functions/v2/https");

// The Firebase Admin SDK to access Firestore and Messaging.
const admin = require("firebase-admin");
admin.initializeApp();

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
  (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("No data associated with the event");
      return;
    }
    const { roomId } = event.params;
    const { text, sender } = snapshot.data();

    admin
      .firestore()
      .doc("chatRooms/" + roomId)
      .get()
      .then(async (snapshot) => {
        if (!snapshot.exists) {
          console.log("No data associated with the event");
          return;
        }
        const { users } = snapshot.data();

        if (users instanceof Array) {
          var receivers = [];

          for await (const user of users) {
            const { email, pushToken, unread, langCode } = user;
            if (email !== sender) {
              if (pushToken) {
                receivers.push({
                  token: pushToken,
                  // If `unread` is null or equal 0, set badge to 1
                  badge: unread ? unread : 1,
                });
              } else {
                const snapshot = await admin
                  .firestore()
                  .collection("users")
                  .doc(email)
                  .get();

                if (!snapshot.empty) {
                  const user = snapshot.data();
                  receivers.push({
                    token: user.deviceToken,
                    badge: unread ? unread : 1,
                  });
                }
              }
            }
          }

          if (receivers.empty) {
            console.log("No receivers found");
            return;
          }

          console.log("Receivers:", JSON.stringify(receivers));

          const message = {
            notification: {
              title: sender
                ? `You have a message from "${sender}"`
                : "You have a message",
              body: text ? text : null,
            },
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

          const messages = receivers.map((receiver) => {
            const { token, badge } = receiver;
            // deepcopy message
            var copy;
            if (global.structuredClone)
              // In some case, it trhow Error `ReferenceError:
              // structuredClone is not defined`. I dunno ^^
              copy = structuredClone(message);
            else copy = JSON.parse(JSON.stringify(message));
            // add token to copied message
            copy.token = token;
            // add badge to copied message
            copy.apns.payload.aps.badge = badge;
            return copy;
          });

          // console.log('Sending messages:', JSON.stringify(messages));

          admin
            .messaging()
            .sendEach(messages)
            .then((response) => {
              console.log(
                "Successfully sent message:",
                JSON.stringify(response)
              );
            })
            .catch((error) => {
              console.log("Error sending message:", JSON.stringify(error));
            });
        }
      });
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
          continue;
        }

        const recipientUserData = recipientUserSnapshot.val();
        if (recipientUserData.pushToken) {
          recipients.push({
            userId: recipientUserId,
            pushToken: recipientUserData.pushToken,
            userName: recipientUserData.user_name || "User",
            userType: recipientUserData.user_type || "visitor"
          });
        }
      }

      if (recipients.length === 0) {
        // No recipients with push tokens found
        return;
      }

      // Build notification messages for each recipient
      const notificationMessages = recipients.map((recipient) => {
        const notificationTitle = senderName
          ? `New message from ${senderName}`
          : "You have a new message";

        const notificationBody = messageText || "New message received";

        return {
          token: recipient.pushToken,
          notification: {
            title: notificationTitle,
            body: notificationBody,
          },
          // data: {
          //   type: "chat_message",
          //   conversation_id: conversation_id,
          //   sender_id: senderId,
          //   sender_name: senderName || "",
          //   message_id: messageId,
          //   vendor_id: vendor_id ? vendor_id.toString() : ""
          // },
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
      });

      console.log(`Sending ${notificationMessages.length} notifications`);

      // Send notifications
      const response = await admin
        .messaging()
        .sendEach(notificationMessages)
        .then((response) => {
          console.log(
            "Successfully sent message:",
            JSON.stringify(response)
          );
        })
        .catch((error) => {
          console.log("Error sending message:", JSON.stringify(error));
        });
    } catch (error) {
      console.error("Error in notifyOnRealtimeChatMessage:", error);
    }
  }
);
