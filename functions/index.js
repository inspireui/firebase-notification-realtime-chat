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
                const { senderName, message } = req.query
                const email = req.query.email

                const messagePayload = {
                    notification: {
                        title: senderName ? `You have a message from "${senderName}"` : 'You have a message',
                        body: message ? message : null,
                    },
                    token: user.deviceToken,
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                        },
                        collapseKey: email
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10'
                        },
                        payload: {
                            aps: {
                                sound: "default",
                                badge: 1,
                                threadId: email
                            }
                        }
                    }
                };

                console.log('Sending messages:', JSON.stringify(messagePayload));

                admin
                    .messaging()
                    .send(messagePayload)
                    .then(response => {
                        console.log('Successfully sent message:', JSON.stringify(response));
                        res.json({ success: true })
                    })
                    .catch(error => {
                        console.log('Error sending message:', JSON.stringify(error));
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

    admin.firestore().doc('chatRooms/' + roomId).get().then(async (snapshot) => {
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
                            email: email
                        });
                    } else {
                        const snapshot = await admin
                            .firestore()
                            .collection('users')
                            .doc(email)
                            .get();


                        if (!snapshot.empty) {
                            const user = snapshot.data();
                            receivers.push({
                                token: user.deviceToken,
                                badge: unread ? unread : 1,
                                email: email
                            });
                        }

                    }
                }
            }

            if (receivers.empty) {
                console.log("No receivers found");
                return;
            }

            console.log('Receivers:', JSON.stringify(receivers));

            const message = {
                notification: {
                    title: sender ? `You have a message from "${sender}"` : 'You have a message',
                    body: text ? text : null,
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                    }
                },
                apns: {
                    headers: {
                        'apns-priority': '10'
                    },
                    payload: {
                        aps: {
                            sound: "default",
                            badge: 1
                        }
                    }
                }
            };

            const messages = receivers.map((receiver) => {
                const { token, badge, email } = receiver;
                // deepcopy message
                var copy;
                if (global.structuredClone) {
                    // In some case, it trhow Error `ReferenceError:
                    // structuredClone is not defined`. I dunno ^^
                    copy = structuredClone(message)
                }
                else {
                    copy = JSON.parse(JSON.stringify(message))
                }

                // add token to copied message
                copy.token = token;
                // add badge to copied message
                copy.apns.payload.aps.badge = badge;
                // add collapse key to copied message by email for grouping notifications.
                copy.android.collapseKey = email;
                // add threadId to copied message by email for grouping notifications.
                copy.apns.payload.aps.threadId = email;

                return copy;
            });

            // console.log('Sending messages:', JSON.stringify(messages));

            admin.messaging().sendEach(messages).then((response) => {
                console.log('Successfully sent message:', JSON.stringify(response));
            }).catch((error) => {
                console.log('Error sending message:', JSON.stringify(error));
            });
        }
    });
});
