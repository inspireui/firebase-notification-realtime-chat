// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

// The HTTP request handler.
const { onRequest } = require("firebase-functions/v2/https");

// The Firebase Admin SDK to access Firestore and Messaging.
const admin = require('firebase-admin');
admin.initializeApp();

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// Push Notification via HTTP request
// curl--location 'http://127.0.0.1:5001/fluxstore-inspireui/us-central1/pushNotification?email=test%40gmail.com&senderName=Chung%20Xon&message=test'
exports.pushNotification = onRequest((req, res) => {
    admin
        .firestore()
        .collection('users')
        .doc(req.query.email)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                res.status(400).json("Not Found")
            } else {
                const user = snapshot.data()

                const message = {
                    notification: {
                        title: `You have a message from "${req.query.senderName}"`,
                        body: req.query.message,
                    },
                    token: user.deviceToken,
                    android: {
                        priority: 'high'
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10'
                        }
                    }
                };
                admin
                    .messaging()
                    .send(message)
                    .then(response => {
                        console.log('Successfully sent message:', response)
                        res.json({ success: true })
                    })
                    .catch(error => {
                        console.log('Error sending message:', error)
                        res.status(500).send(error);
                    })
            }

        })
        .catch((err) => {
            res.status(500).send(err);
        })
});

exports.sendNotification = onDocumentCreated('chatRooms/{roomId}/chatScreen/{message}', (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No data associated with the event");
        return;
    }
    const { roomId } = event.params;
    const { text, sender } = snapshot.data();

    admin.firestore().doc('chatRooms/' + roomId).get().then((snapshot) => {
        if (!snapshot.exists) {
            console.log("No data associated with the event");
            return;
        }
        const { users } = snapshot.data();

        if (users instanceof Array) {
            var registrationTokens = [];

            users.forEach((user) => {
                const { email, pushToken, unread, langCode } = user;
                if (email !== sender && pushToken) {
                    registrationTokens.push(pushToken);
                }
            })

            const message = {
                notification: {
                    title: `You have a message from "${sender}"`,
                    body: `${text}`
                },
                tokens: registrationTokens,
                android: {
                    priority: 'high'
                },
                apns: {
                    headers: {
                        'apns-priority': '10'
                    }
                }
            };
            console.log(message);

            admin.messaging().sendEachForMulticast(message).then((response) => {
                console.log('Successfully sent message:', response)
            }).catch((error) => {
                console.log('Error sending message:', error)
            });
        }
    });
});
