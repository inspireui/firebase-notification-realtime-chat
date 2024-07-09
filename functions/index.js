// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore and Messaging.
const admin = require('firebase-admin');
admin.initializeApp();

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

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
